# Changelog

---

## [Unreleased]

### Added

- `GasLock.withLock(scope, callback, options?)` — reentrancy-safe wrapper around `LockService.get{Script,Document,User}Lock()`
- `GasLock.isHeld(scope)` — check whether a scope is already held in the current execution
- Singleton namespace tracking held scopes per execution; nested calls for an already-held scope reuse it instead of re-acquiring
- Clear, actionable error (instead of a raw null-reference) when `LockService` returns no lock for a requested scope
