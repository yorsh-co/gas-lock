# gas-lock

[![Built with Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)

## Reentrancy-safe wrapper around Google Apps Script's `LockService`.

> The goal of this project is to make nested locking in Apps Script projects safe by default, without callers having to track for themselves whether a lock is already held somewhere higher up the call stack.

Apps Script's `LockService` locks (`script`, `document`, `user`) are owned per execution, not per handle. If code that already holds a lock calls into other code that acquires that same lock again — directly, or several layers down through another library — the nested acquire succeeds immediately, without blocking. The hazard comes afterwards: `releaseLock()` on any handle that has acquired the lock — a nested acquire counts — releases the execution's lock, so the nested code's release silently ends the outer critical section early. The rest of the outer section runs without the lock, and nothing throws.

`gas-lock` fixes this by tracking which scopes are currently held by the current execution. A nested `withLock()` call, or a `getLock()` handle, for a scope already held joins it instead of acquiring it again, and never releases it — only the code that really acquired the lock does.

> **Disclaimer:**
> This project and [Yorsh](https://github.com/yorsh-co) are independent and are not affiliated with, endorsed by, or associated with Google LLC.

### Features

- Reentrancy-safe `withLock()` — nested calls for an already-held scope reuse it instead of releasing the outer lock early
- Supports all three `LockService` scopes: `script`, `document`, `user`
- `isHeld()` to check whether a scope is already held in the current execution
- `getLock()` for callers needing non-blocking `tryLock()`/`releaseLock()` control instead of `withLock`'s blocking `waitLock` — returns a tracked handle that shares `withLock`'s registry
- Detects a lock released outside `GasLock` and throws instead of silently finishing an unprotected critical section
- Clear, actionable errors instead of raw null-reference failures — e.g. when `document` scope is requested outside the context of a containing document
- Designed to be optionally injectable into other libraries (e.g. `gas-sheetdb`, `gas-webapp`) as their lock service, the same way a logger is injected (`gas-sheetdb` uses `withLock`, `gas-webapp`'s limiters use `getLock`) — each falls back to calling `LockService` directly if `gas-lock` isn't provided
- Singleton namespace, not a class — one shared, execution-wide registry
- Written in TypeScript with generated JavaScript distribution
- No external dependencies beyond built-in Apps Script services

### Example Usage

```js
// With raw LockService, the nested acquire succeeds and its releaseLock()
// would release the lock the outer call holds, so everything after
// saveConfig() would run unprotected.
GasLock.withLock('script', () => {
  // holds 'script'
  saveConfig(); // internally also calls GasLock.withLock('script', ...)
  // joined, not re-acquired or released — the lock is still held here
});

function saveConfig() {
  GasLock.withLock('script', () => {
    // ...critical section...
  });
}
```

## Requirements

### Scopes

`gas-lock` wraps Apps Script's built-in `LockService`, which requires no `oauthScopes` entry in the parent project's `appsscript.json`.

## Quick Start

It is recommended to use `gas-lock` together with [Google's `clasp` CLI](https://github.com/google/clasp) for local Apps Script development and git-based workflows. See [Setup instructions with `clasp`](#setup-instructions-with-clasp) for more information.

#### 1. Add the library to your Apps Script project

##### Several gas-\* libraries: gas-dev-bundle

[gas-dev-bundle](https://github.com/yorsh-co/gas-dev-bundle) resolves version ranges against the libraries' release tags and writes them into one script, in dependency order.

```bash
npm install -D github:yorsh-co/gas-dev-bundle#semver:^1.1.1
```

List the libraries in your `package.json`:

```json
{
  "gasDevBundle": {
    "outFile": "src/lib/gas-libraries.js",
    "libraries": {
      "gas-lock": "^1.2.0",
      "gas-logger": "^1.3.0"
    }
  }
}
```

```bash
npx gas-dev-bundle
```

- Commit the generated file. Its header records each library's version and commit SHA.
- Re-run the command after changing a range to upgrade.
- Requires `gas-lock` >= 1.2.0, the first release that carries the load-order metadata.

See the [gas-dev-bundle README](https://github.com/yorsh-co/gas-dev-bundle) for configuration details.

##### This library only: git subtree

This repository is intended to be added directly into Apps Script projects using git subtree.

```bash
git subtree add \
  --prefix=src/lib/gas-lock \
  https://github.com/yorsh-co/gas-lock.git \
  dist \
  --squash
```

This creates:

```txt
src/lib/gas-lock/
```

#### 2. If needed, move `gas-lock` files to the start of the execution order.

This is required for calling `GasLock.withLock()` or `GasLock.getLock()` at runtime, as a global variable or inside an IIFE.

See the [Configure the file push order](#5-configure-the-file-push-order) section for details.

With gas-dev-bundle, the single entry is the bundle file, e.g. `src/lib/gas-libraries.js` (adjusted for `rootDir`).

#### 3. Call `GasLock` wherever a lock is needed

```js
GasLock.withLock('script', () => {
  // ...critical section...
});
```

## Setup instructions with `clasp`

`gas-lock` works best with [Google's `clasp` CLI](https://github.com/google/clasp) for local Apps Script development and git-based workflows.

#### 1. Install clasp

```bash
npm install -g @google/clasp
```

#### 2. Enable the [Apps Script API](https://script.google.com/home/usersettings)

#### 3. Login to Google Apps Script

```bash
clasp login
```

#### 4. Clone or create your Apps Script project

Clone an existing project:

```bash
clasp clone <script-id>
```

or create a new project:

```bash
clasp create --type standalone
```

#### 5. Configure the file push order

Apps Script executes files by the order in the Apps Script editor, from top to bottom. By default, `clasp push` orders the files alphabetically, by file name. If `GasLock.withLock()` or `GasLock.getLock()` is called at runtime (as a global variable or in an IIFE) in a file ordered before `gas-lock`'s own files, `clasp push` will succeed but running the project will throw:

```txt
ReferenceError: GasLock is not defined
```

To avoid this, add a [`filePushOrder`](https://github.com/google/clasp#filepushorder-optional) entry to your project's `.clasp.json` that pushes `gas-lock`'s module files ahead of any file that references them:

```json
{
  "filePushOrder": [
    "dist/lib/gas-lock/gas-lock.constants.js",
    "dist/lib/gas-lock/gas-lock.js"
  ]
}
```

Use the path where the files land in your pushed project, e.g. `src/lib/gas-lock/...` when pushing the subtree as-is.

Alternatively, you can manually move these files to the top of the file list in the Apps Script editor.

With gas-dev-bundle, the single entry is the bundle file, e.g. `src/lib/gas-libraries.js` (adjusted for `rootDir`).

> **Note:**
> Any file in your own project that calls `GasLock.withLock()` or `GasLock.getLock()` at the top level (e.g. outside a function) must be pushed _after_ the entries above. Calls made from inside functions or methods are unaffected, since those only run after every file has already loaded.

#### 6. Import `gas-lock`

To install several gas-\* libraries together, use the [gas-dev-bundle method](#1-add-the-library-to-your-apps-script-project) from the Quick Start; otherwise, add this library with git subtree:

```bash
git subtree add \
  --prefix=src/lib/gas-lock \
  https://github.com/yorsh-co/gas-lock.git \
  dist \
  --squash
```

This creates:

```txt
src/lib/gas-lock/
```

#### 7. Push local files to Apps Script

```bash
clasp push
```

#### 8. Call `GasLock` wherever a lock is needed

```js
GasLock.withLock('script', () => {
  // ...critical section...
});
```

## Basic Usage

### Run a callback holding a lock

```js
GasLock.withLock('script', () => {
  // ...critical section...
});
```

### Nested calls reuse an already-held scope

```js
GasLock.withLock('script', () => {
  // holds 'script'
  GasLock.withLock('script', () => {
    // runs directly — no acquire and, crucially, no release
  });
  // still holds 'script' here
});
```

Nesting _different_ scopes is unaffected — each is tracked and acquired/released independently. See [Lock ordering](#limitations) for the one caveat.

### Check whether a scope is already held

```js
if (GasLock.isHeld('script')) {
  // ...
}
```

### Get a tracked lock handle for non-blocking use

```js
const lock = GasLock.getLock('script');

if (lock && lock.tryLock(3000)) {
  try {
    // ...critical section...
  } finally {
    lock.releaseLock();
  }
}
```

The handle has the same `hasLock`/`releaseLock`/`tryLock`/`waitLock` interface as a `LockService` lock and shares `withLock`'s registry:

- Acquiring a scope that is already held joins it without calling `LockService`, and releasing a joined handle is a no-op.
- Only the handle that really acquired the lock releases it.
- An owned scope is visible to `isHeld()` and to nested `withLock()` calls.

> **Note:**
> `getLock()` hands back the handle and steps out of the way — the caller still drives `tryLock`/`waitLock`/`releaseLock`, and must release an owning handle (use `try`/`finally`). Forgetting to release holds the scope for the rest of the execution.
>
> Reach for `getLock()` only when you need `tryLock`'s non-blocking, fail-fast behavior — not as a general alternative to `withLock`.

### Set a custom timeout

```js
GasLock.withLock(
  'script',
  () => {
    // ...critical section...
  },
  { timeoutMs: 10000 }, // defaults to 30000
);
```

## Project Details

### Reentrancy

`LockService`'s `script`, `document`, and `user` locks are owned per execution, not per handle. A nested acquire of a scope your own execution already holds succeeds immediately, so nothing blocks or deadlocks. But `releaseLock()` on any handle that has acquired the lock (a nested acquire counts) releases the execution's lock, so the nested code's release silently ends the outer critical section early — the remainder runs without the lock, with no error.

`GasLock` tracks currently-held scopes in an execution-scoped registry. When `withLock()` is called for a scope already in that registry, it runs the callback directly, without acquiring and, crucially, without releasing, so the outer section keeps its lock. `getLock()` handles follow the same rules. State lives only as long as one execution — Apps Script gives every `doGet`/`doPost`/trigger invocation a fresh global scope, so this never leaks between requests or users.

### Lock Scopes

`gas-lock` supports the same three scopes as `LockService` itself:

| Scope      | `LockService` method | Notes                                                                                                                                                       |
| ---------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script`   | `getScriptLock()`    | Serializes across all users and all executions of the script.                                                                                               |
| `document` | `getDocumentLock()`  | Only available for scripts running in the context of a containing document — not from a standalone script or a web app execution, where it returns no lock. |
| `user`     | `getUserLock()`      | Serializes only the current user's own concurrent executions.                                                                                               |

### Errors

- An unrecognized `scope` (including inherited keys such as `toString`) throws from both `withLock()` and `getLock()`.
- When `LockService` can't provide the requested lock — most commonly `document` scope outside the context of a containing document, e.g. a web app execution — `withLock()` throws a descriptive error naming the scope (the `document` hint is shown only for that scope). `getLock()` returns `null` instead, leaving the decision to the caller: a non-blocking caller may reasonably want to proceed unguarded, or fail its own way.
- If the owning `withLock()` call finds its lock no longer held when the callback returns, because code outside `GasLock` called `releaseLock()`, it skips the release and throws `[GasLock] The "<scope>" lock was released before withLock's callback finished — ...`. An error thrown by the callback takes precedence.
- `waitLock` timeouts propagate from `LockService` unchanged.

### Limitations

- **Only cooperating callers are protected.** Code that calls `LockService` directly for the same scope can still release the execution's lock. `withLock()` detects this after the fact (it throws) but can't prevent it, so route all locking through `GasLock`, or inject it into [`gas-sheetdb`](https://github.com/yorsh-co/gas-sheetdb) and [`gas-webapp`](https://github.com/yorsh-co/gas-webapp).
- **Synchronous callbacks only.** If the callback returns a `Promise`, the lock is released before it settles.
- **Lock ordering across executions.** Nesting different scopes in opposite orders in different code paths (e.g. `script` → `user` in one, `user` → `script` in another) can make two concurrent executions wait on each other until a timeout. Keep a consistent order.

### Entry Point

#### GasLock

Main entry point for the library. Singleton namespace, not a class — there is no constructor.

##### Methods

```js
GasLock.withLock(scope, callback, options); // options is optional; { timeoutMs } defaults to 30000
GasLock.isHeld(scope);
GasLock.getLock(scope); // → tracked Lock handle | null
```

### Example Workflow

```js
function saveReportsFolderId(folderId) {
  GasLock.withLock('script', () => {
    appConfig.load({ force: true });

    if (appConfig.get('reportsFolderId')) return;

    appConfig.set('reportsFolderId', folderId); // internally also calls
    // GasLock.withLock('script', ...) via gas-sheetdb — joined, not
    // re-acquired or released, so the lock is held until this callback ends.
  });
}
```

## Development

The source code is written in TypeScript.

Release builds are compiled to JavaScript before publishing so the distributed library remains compatible with Google Apps Script.

### Apps Script tests

The Vitest suite runs against an in-memory `LockService`. `gas-test/gas-lock.ts` checks the platform behaviour that mock assumes (per-execution lock ownership, `document` scope availability) in a real Apps Script execution. They are built and run with [gas-dev-config](https://github.com/yorsh-co/gas-dev-config#apps-script-tests)'s `gas-test`; see its README for the one-off setup.

- `npm run test:gas:build` writes a single script; paste it into the Apps Script editor and run `runGasTests`.
- `npm run test:gas` pushes it to a dedicated test project with clasp and prints the results. It needs `clasp login` and `GAS_TEST_SCRIPT_ID`; the project's contents are replaced.

## Planned features

- Optional configurable default timeout per scope, rather than one global default
- Expose the current held-scope registry for diagnostics/logging

## License

MIT

See the `LICENSE` file for details.

## Support

Issues and feature requests are welcome via GitHub Issues.

Maintained by [yorsh-co](https://github.com/yorsh-co).
