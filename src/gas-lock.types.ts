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
   * GAS's locks aren't reentrant, so a naive nested acquire would deadlock.
   */
  withLock<T>(
    scope: GasLockScope,
    callback: () => T,
    options?: GasLockOptions,
  ): T;
  /** Whether `scope` is currently held anywhere in this execution's call stack. */
  isHeld(scope: GasLockScope): boolean;
  /**
   * Raw Lock for a scope, for callers needing tryLock-style non-blocking
   * semantics. Not reentrancy-tracked — that only means something for
   * withLock's callback-scoped critical sections.
   */
  getLock(scope: GasLockScope): GoogleAppsScript.Lock.Lock | null;
}
