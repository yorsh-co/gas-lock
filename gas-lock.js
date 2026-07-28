'use strict';
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
const GasLock = (() => {
  /** scope -> the Lock object currently held for it, if any. */
  const held = new Map();
  /** Whether `scope` is currently held anywhere in this execution's call stack. */
  const isHeld = (scope) => {
    return held.has(scope);
  };
  /**
   * Run `callback` holding `scope`. Reuses an already-held lock of the same
   * scope from higher up this execution's call stack instead of
   * re-acquiring it.
   */
  const withLock = (scope, callback, options = {}) => {
    if (held.has(scope)) {
      // Already held higher up this same call stack — run directly. There's
      // nothing to acquire or release here; the outermost holder owns that.
      return callback();
    }
    const factory = _GAS_LOCK_FACTORIES[scope];
    if (!factory) {
      throw new Error(
        `[GasLock] Unknown lock scope "${scope}". Expected one of: ${Object.keys(_GAS_LOCK_FACTORIES).join(', ')}.`,
      );
    }
    const lock = factory();
    if (!lock) {
      throw new Error(
        `[GasLock] LockService returned no lock for scope "${scope}" — "document" locks are unavailable outside the context of a containing document (e.g. a web app execution). Use "script" or "user" instead.`,
      );
    }
    const timeoutMs = options.timeoutMs ?? _GAS_LOCK_DEFAULT_TIMEOUT_MS;
    lock.waitLock(timeoutMs);
    held.set(scope, lock);
    try {
      return callback();
    } finally {
      held.delete(scope);
      lock.releaseLock();
    }
  };
  /**
   * Resolve the raw `Lock` for a scope without acquiring it.
   *
   * `withLock` covers the common case — hold a lock for the duration of a
   * callback, blocking on `waitLock` until it's available. Some callers
   * can't use that shape: a rate limiter guarding a `CacheService` counter
   * needs `tryLock`'s fail-fast semantics, because a busy limiter should
   * reject the request outright rather than queue behind it. `getLock`
   * hands back the lock so those callers can drive
   * `tryLock`/`releaseLock` themselves.
   *
   * Two consequences of returning a bare lock:
   *
   * - **The caller owns the lifecycle.** Nothing here acquires or releases
   *   it; forgetting to `releaseLock()` holds it for the rest of the
   *   execution.
   * - **Not reentrancy-tracked.** The held-scope registry only covers
   *   `withLock`'s callback-scoped critical sections, where GasLock knows
   *   exactly when the scope is entered and left. It can't know that for a
   *   lock it handed away, so a lock taken via `getLock` is invisible to
   *   `isHeld` and to any nested `withLock` for the same scope — which
   *   will then block against it as it would against raw `LockService`.
   *
   * Returns `null` when LockService itself declines to provide a lock —
   * notably `document` scope outside the context of a containing document.
   */
  const getLock = (scope) => {
    const factory = _GAS_LOCK_FACTORIES[scope];
    if (!factory) {
      throw new Error(
        `[GasLock] Unknown lock scope "${scope}". Expected one of: ${Object.keys(_GAS_LOCK_FACTORIES).join(', ')}.`,
      );
    }
    return factory();
  };
  return { withLock, isHeld, getLock };
})();
