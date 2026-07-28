# gas-lock

Reentrancy-safe wrapper around Apps Script's `LockService`.

GAS's document/script/user locks aren't reentrant — a nested `waitLock()`
call for a scope your own execution already holds just blocks until its
own timeout, since nothing else in a single-threaded execution can ever
release it. `GasLock.withLock()` tracks which scopes are currently held
by the current execution's call stack and reuses an already-held scope
instead of re-acquiring it.

## Usage

```js
GasLock.withLock('script', () => {
  // ...critical section...
});
```

Nesting is safe as long as the inner call uses the same scope an outer
call already holds:

```js
GasLock.withLock('script', () => {
  // holds 'script'
  GasLock.withLock('script', () => {
    // reused, not re-acquired — no deadlock
  });
});
```

Nesting _different_ scopes is unaffected — each is tracked and
acquired/released independently.

## API

- `GasLock.withLock(scope, callback, options?)` — run `callback` holding
  `scope` (`'script' | 'document' | 'user'`). `options.timeoutMs`
  defaults to 30000. Throws if `scope` isn't one of the three valid
  values, and throws a clear error (rather than a raw null-reference)
  if `LockService` returns no lock for the scope — which happens for
  `'document'` outside the context of a containing document, e.g. a
  web app execution.
- `GasLock.isHeld(scope)` — whether `scope` is currently held anywhere
  in this execution's call stack.

## Installing as a dependency

Peer dependency for other `gas-*` libraries the same way `gas-webapp`
expects `gas-error`/`gas-logger` as globals — no import statement,
just make sure `gas-lock.js` loads before anything that calls
`GasLock.withLock`.

## License

MIT — see LICENSE.md.
