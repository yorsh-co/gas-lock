/**
 * Reentrancy-safe wrapper around Apps Script's LockService.
 *
 * GAS's document/script/user locks aren't reentrant: a second `waitLock()`
 * call for a scope the SAME execution already holds just blocks until its
 * own timeout, since nothing else in a single-threaded execution can ever
 * release it. GasLock tracks which scopes are currently held by the
 * current execution's call stack, so a nested `withLock()` call for a
 * scope already held higher up reuses it instead of trying to re-acquire.
 *
 * Singleton namespace, not a class — the entire point is ONE shared,
 * execution-wide registry. Every consumer (gas-sheetdb, other gas-*
 * libraries, app code) is expected to call `GasLock.withLock` directly
 * rather than instantiate their own tracker; two independent registries
 * would defeat the purpose.
 *
 * State lives only as long as one execution — Apps Script gives every
 * doGet/doPost/trigger invocation a fresh global scope, so this never
 * leaks between requests or users.
 */
declare const GasLock: GasLockNamespace;
