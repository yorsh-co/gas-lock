import { fileURLToPath } from 'node:url';
import { createGasLoader, loadOrderFiles } from 'gas-dev-config/test';
import { createMocks, type MockOptions, type Mocks } from './mocks';

/** Lock-like handle returned by `GasLock.getLock`. */
export interface LockHandle {
  hasLock(): boolean;
  releaseLock(): void;
  tryLock(timeoutMs: number): boolean;
  waitLock(timeoutMs: number): void;
}

/** Loose, test-side view of the `GasLock` namespace. */
export interface GasLockNamespace {
  withLock<T>(
    scope: string,
    callback: () => T,
    options?: { timeoutMs?: number },
  ): T;
  isHeld(scope: string): boolean;
  getLock(scope: string): LockHandle | null;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const load = createGasLoader<{ GasLock: GasLockNamespace }>({
  files: loadOrderFiles(ROOT),
  exports: ['GasLock'],
  root: ROOT,
});

/**
 * Evaluates the lock sources in a fresh context wired to a fake `LockService`,
 * so each call gets its own empty held-scope registry.
 */
export function loadGasLock(options: MockOptions = {}): {
  GasLock: GasLockNamespace;
  mocks: Mocks;
} {
  const mocks = createMocks(options);
  const { GasLock } = load({ LockService: mocks.LockService, Error });

  return { GasLock, mocks };
}
