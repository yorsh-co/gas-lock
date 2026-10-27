/** Which LockService lock a `withLock` call acquires. */
type GasLockScope = 'script' | 'document' | 'user';

interface GasLockOptions {
  /** @default 30000 */
  timeoutMs?: number;
}

interface GasLockNamespace {
  /**
   * Run `callback` holding `scope`. If `scope` is already held higher up
   * the current execution's call stack, reuses it instead of re-acquiring —
   * GAS's locks are owned per execution, so a naive nested acquire succeeds
   * and its release would end the outer critical section early.
   */
  withLock<T>(
    scope: GasLockScope,
    callback: () => T,
    options?: GasLockOptions,
  ): T;
  /**
   * Whether `scope` is currently held anywhere in this execution — by
   * `withLock` or by a `getLock` handle that acquired it.
   */
  isHeld(scope: GasLockScope): boolean;
  /**
   * Tracked Lock handle for a scope, for callers needing tryLock-style
   * non-blocking semantics. It shares withLock's held-scope registry:
   * acquiring a held scope joins it, and only a handle that really acquired
   * the lock releases it. The caller still owns tryLock/waitLock/releaseLock;
   * not releasing an owning handle holds the scope for the rest of the
   * execution. Returns `null` when LockService provides no lock.
   */
  getLock(scope: GasLockScope): GoogleAppsScript.Lock.Lock | null;
}
