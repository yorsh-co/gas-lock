# gas-lock

[![Built with Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)

## Reentrancy-safe wrapper around Google Apps Script's `LockService`.

> The goal of this project is to make nested locking in Apps Script projects safe by default, without callers having to track for themselves whether a lock is already held somewhere higher up the call stack.

Apps Script's `LockService` locks (`script`, `document`, `user`) aren't reentrant. If code that already holds a lock calls into other code that tries to acquire that same lock again — directly, or several layers down through another library — the second `waitLock()` call just blocks until it times out. Nothing else in a single-threaded execution can ever release the first lock while it's stuck waiting on the second, so the call silently hangs until the timeout throws.

`gas-lock` fixes this by tracking which scopes are currently held by the current execution's call stack. A nested `withLock()` call for a scope already held higher up reuses it instead of trying to acquire it again.

> **Disclaimer:**
> This project and [Yorsh](https://github.com/yorsh-co) are independent and are not affiliated with, endorsed by, or associated with Google LLC.

### Features

- Reentrancy-safe `withLock()` — nested calls for an already-held scope reuse it instead of deadlocking
- Supports all three `LockService` scopes: `script`, `document`, `user`
- `isHeld()` to check whether a scope is already held in the current execution
- `getLock()` for callers needing raw, non-blocking `tryLock()`/`releaseLock()` control instead of `withLock`'s blocking `waitLock`
- Clear, actionable errors instead of raw null-reference failures — e.g. when `document` scope is requested outside the context of a containing document
- Designed to be optionally injectable into other libraries (e.g. `gas-sheetdb`, `gas-webapp`) as their lock service, the same way a logger is injected — each falls back to calling `LockService` directly if `gas-lock` isn't provided
- Singleton namespace, not a class — one shared, execution-wide registry
- Written in TypeScript with generated JavaScript distribution
- No external dependencies beyond built-in Apps Script services

### Example Usage

```js
// A naive nested lock would deadlock here — the inner call blocks until
// timeout, waiting on a lock the outer call already holds and can't
// release until the inner call returns.
GasLock.withLock('script', () => {
  // holds 'script'
  saveConfig(); // internally also calls GasLock.withLock('script', ...)
  // reused, not re-acquired — no deadlock
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
    "dist/lib/gas-lock/gas-lock.js",
    "dist/lib/gas-lock/gas-lock.types.js"
  ]
}
```

Alternatively, you can manually move these files to the top of the file list in the Apps Script editor.

> **Note:**
> Any file in your own project that calls `GasLock.withLock()` or `GasLock.getLock()` at the top level (e.g. outside a function) must be pushed _after_ the entries above. Calls made from inside functions or methods are unaffected, since those only run after every file has already loaded.

#### 6. Import `gas-lock`

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
    // reused, not re-acquired — no deadlock
  });
});
```

Nesting _different_ scopes is unaffected — each is tracked and acquired/released independently.

### Check whether a scope is already held

```js
if (GasLock.isHeld('script')) {
  // ...
}
```

### Get the raw lock for non-blocking use

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

> **Note:**
> `getLock()` hands back the lock and steps out of the way — the caller owns `tryLock`/`releaseLock`, and forgetting to release holds it for the rest of the execution.
>
> It is also **not reentrancy-tracked**, and the consequence is worth being explicit about: a lock taken via `getLock()` is invisible to the registry, so `isHeld()` won't report it and a nested `withLock()` for the same scope will block against it exactly as it would against raw `LockService`. Reentrancy tracking only works for `withLock`'s callback-scoped critical sections, where `gas-lock` knows precisely when the scope is entered and left.
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

`LockService`'s `script`, `document`, and `user` locks are plain mutual-exclusion primitives — they have no concept of "the same execution already holds this." A second `waitLock()` call for a scope your own execution already holds just queues behind a lock that will never be released, since the only code that could release it is itself blocked waiting on the nested call to return.

`GasLock` tracks currently-held scopes in an execution-scoped registry. When `withLock()` is called for a scope already in that registry, it runs the callback directly instead of calling `LockService` again. State lives only as long as one execution — Apps Script gives every `doGet`/`doPost`/trigger invocation a fresh global scope, so this never leaks between requests or users.

### Lock Scopes

`gas-lock` supports the same three scopes as `LockService` itself:

| Scope      | `LockService` method | Notes                                                                                                                                                       |
| ---------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script`   | `getScriptLock()`    | Serializes across all users and all executions of the script.                                                                                               |
| `document` | `getDocumentLock()`  | Only available for scripts running in the context of a containing document — not from a standalone script or a web app execution, where it returns no lock. |
| `user`     | `getUserLock()`      | Serializes only the current user's own concurrent executions.                                                                                               |

### Errors

`withLock()` throws a descriptive error rather than a raw null-reference failure when `LockService` can't provide the requested lock — most commonly when `document` scope is requested outside the context of a containing document, e.g. a web app execution.

`getLock()` returns `null` in that same situation rather than throwing, leaving the decision to the caller: a non-blocking caller may reasonably want to proceed unguarded, or fail its own way, rather than have an exception raised on its behalf.

Both throw on an unrecognized `scope` value.

### Entry Point

#### GasLock

Main entry point for the library. Singleton namespace, not a class — there is no constructor.

##### Methods

```js
GasLock.withLock(scope, callback, options); // options is optional; { timeoutMs } defaults to 30000
GasLock.isHeld(scope);
GasLock.getLock(scope); // → Lock | null
```

### Example Workflow

```js
function saveReportsFolderId(folderId) {
  GasLock.withLock('script', () => {
    appConfig.load({ force: true });

    if (appConfig.get('reportsFolderId')) return;

    appConfig.set('reportsFolderId', folderId); // internally also calls
    // GasLock.withLock('script', ...) via gas-sheetdb — reused, not
    // re-acquired, so this doesn't deadlock.
  });
}
```

## Development

The source code is written in TypeScript.

Release builds are compiled to JavaScript before publishing so the distributed library remains compatible with Google Apps Script.

## Planned features

- Optional configurable default timeout per scope, rather than one global default
- Expose the current held-scope registry for diagnostics/logging

## License

MIT

See the `LICENSE` file for details.

## Support

Issues and feature requests are welcome via GitHub Issues.

Maintained by [yorsh-co](https://github.com/yorsh-co).
