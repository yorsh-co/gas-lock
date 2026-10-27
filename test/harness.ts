import { fileURLToPath } from 'node:url';
import { createGasLoader } from 'gas-dev-config/test';
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

/** Source files in load order; later files depend on earlier ones. */
const SOURCE_FILES = [
  'gas-lock.types.ts',
  'gas-lock.constants.ts',
  'gas-lock.ts',
];

const load = createGasLoader<{ GasLock: GasLockNamespace }>({
  files: SOURCE_FILES.map((file) => `src/${file}`),
  exports: ['GasLock'],
  root: fileURLToPath(new URL('..', import.meta.url)),
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
