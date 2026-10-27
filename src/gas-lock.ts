'use strict';
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
const GasLock: GasLockNamespace = (() => {
  /** scope -> the Lock object currently held for it, if any. */
  const held = new Map<GasLockScope, GoogleAppsScript.Lock.Lock>();

  /** Whether `scope` is currently held anywhere in this execution's call stack. */
  const isHeld = (scope: GasLockScope): boolean => {
    return held.has(scope);
  };

  /**
   * Look up the `LockService` factory for `scope`, throwing for anything that
   * isn't an own key of the registry (inherited members such as `toString`
   * included).
   */
  const factoryFor = (
    scope: GasLockScope,
  ): (() => GoogleAppsScript.Lock.Lock) => {
    if (!Object.prototype.hasOwnProperty.call(_GAS_LOCK_FACTORIES, scope)) {
      throw new Error(
        `[GasLock] Unknown lock scope "${scope}". Expected one of: ${Object.keys(_GAS_LOCK_FACTORIES).join(', ')}.`,
      );
    }
    return _GAS_LOCK_FACTORIES[scope];
  };

  /**
   * Run `callback` holding `scope`. Reuses an already-held lock of the same
   * scope from higher up this execution's call stack instead of
   * re-acquiring it.
   */
  const withLock = <T>(
    scope: GasLockScope,
    callback: () => T,
    options: GasLockOptions = {},
  ): T => {
    if (held.has(scope)) {
      // Already held higher up this same call stack — run directly. There's
      // nothing to acquire or release here; the outermost holder owns that.
      return callback();
    }

    const lock = factoryFor(scope)();
    if (!lock) {
      const hint =
        scope === 'document'
          ? ' — "document" locks are unavailable outside the context of a containing document (e.g. a web app execution). Use "script" or "user" instead.'
          : '.';
      throw new Error(
        `[GasLock] LockService returned no lock for scope "${scope}"${hint}`,
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
   * Wrap `lock` in a handle that shares the `held` registry. A handle is
   * `idle`, the `owner` of the scope (it really acquired the lock) or has
   * `joined` a scope another holder already owns. Only an owner touches the
   * real lock on release, so a nested holder can't end the outer section.
   */
  const trackedLock = (
    scope: GasLockScope,
    lock: GoogleAppsScript.Lock.Lock,
  ): GoogleAppsScript.Lock.Lock => {
    let state: 'idle' | 'owner' | 'joined' = 'idle';

    /** Acquire through `acquireLock` unless the scope is already held. */
    const acquire = (acquireLock: () => boolean): boolean => {
      if (state === 'owner') return true;
      // Re-checked on every call: the holder a joined handle relied on may
      // have released since.
      if (held.has(scope)) {
        state = 'joined';
        return true;
      }
      if (!acquireLock()) return false;
      held.set(scope, lock);
      state = 'owner';
      return true;
    };

    return Object.freeze({
      hasLock: (): boolean => {
        if (state === 'owner') return lock.hasLock();
        return state === 'joined' && held.has(scope);
      },
      releaseLock: (): void => {
        const wasOwner = state === 'owner';
        state = 'idle';
        if (wasOwner) {
          held.delete(scope);
          lock.releaseLock();
        }
      },
      tryLock: (timeoutMs: number): boolean =>
        acquire(() => lock.tryLock(timeoutMs)),
      waitLock: (timeoutMs: number): void => {
        acquire(() => {
          lock.waitLock(timeoutMs);
          return true;
        });
      },
    });
  };

  /**
   * Resolve a tracked `Lock` handle for a scope without acquiring it.
   *
   * `withLock` covers the common case — hold a lock for the duration of a
   * callback, blocking on `waitLock` until it's available. Some callers
   * can't use that shape: a rate limiter guarding a `CacheService` counter
   * needs `tryLock`'s fail-fast semantics, because a busy limiter should
   * reject the request outright rather than queue behind it. `getLock`
   * hands back a handle so those callers can drive
   * `tryLock`/`waitLock`/`releaseLock` themselves.
   *
   * The handle shares the held-scope registry with `withLock`: acquiring a
   * scope already held (by `withLock` or another handle) joins it without
   * calling LockService, and releasing a joined handle never releases the
   * real lock. A handle that really acquired the scope is visible to
   * `isHeld` and to nested `withLock` calls.
   *
   * The caller owns the lifecycle: forgetting to `releaseLock()` an owning
   * handle holds the scope for the rest of the execution.
   *
   * Returns `null` when LockService itself declines to provide a lock —
   * notably `document` scope outside the context of a containing document.
   */
  const getLock = (scope: GasLockScope): GoogleAppsScript.Lock.Lock | null => {
    const lock = factoryFor(scope)();
    return lock ? trackedLock(scope, lock) : null;
  };

  return { withLock, isHeld, getLock };
})();
