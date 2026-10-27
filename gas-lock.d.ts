/**
 * Reentrancy-safe wrapper around Apps Script's LockService.
 *
 * GAS's document/script/user locks are owned per execution, not per handle:
 * acquiring a scope the SAME execution already holds succeeds immediately,
 * and `releaseLock()` on any handle then releases the execution's lock —
 * silently ending the outer critical section early. GasLock tracks which
 * scopes the current execution holds, so a nested `withLock()` or
 * `getLock()` handle for a held scope joins it instead of re-acquiring and
 * later releasing it.
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
