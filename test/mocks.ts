import { vi, type Mock } from 'vitest';

/** Message thrown by `waitLock` when the lock cannot be acquired in time. */
export const LOCK_TIMEOUT_MESSAGE =
  'Lock timeout: another process was holding the lock for too long.';

/** Lock handle returned by the fake, with spies on every method. */
export interface MockLock {
  waitLock: Mock<(timeoutMs: number) => void>;
  tryLock: Mock<(timeoutMs: number) => boolean>;
  releaseLock: Mock<() => void>;
  hasLock: Mock<() => boolean>;
}

type Scope = 'script' | 'document' | 'user';

/** Test switches for the `LockService` fake. */
export interface MockOptions {
  /** Scopes for which `LockService` returns `null`, e.g. `['document']`. */
  unavailable?: Scope[];
  /** Scopes held by another execution: `tryLock` fails and `waitLock` times out. */
  contended?: Scope[];
}

/**
 * Fresh `LockService` fake modelling Apps Script's ownership rules: locks are
 * owned per execution and per scope, so every handle for a scope shares one
 * "held" flag. Acquiring a scope this execution already holds succeeds at once,
 * and `releaseLock` on any handle clears the flag.
 */
export function createMocks(options: MockOptions = {}) {
  const unavailable = new Set(options.unavailable);
  const contended = new Set(options.contended);
  const heldScopes = new Set<Scope>();

  const createLock = (scope: Scope): MockLock => {
    let acquired = false;
    const acquire = (): boolean => {
      if (!heldScopes.has(scope)) {
        if (contended.has(scope)) return false;
        heldScopes.add(scope);
      }
      acquired = true;
      return true;
    };

    return {
      waitLock: vi.fn(() => {
        if (!acquire()) throw new Error(LOCK_TIMEOUT_MESSAGE);
      }),
      tryLock: vi.fn(() => acquire()),
      releaseLock: vi.fn(() => {
        heldScopes.delete(scope);
      }),
      hasLock: vi.fn(() => acquired && heldScopes.has(scope)),
    };
  };

  const factory = (scope: Scope) =>
    vi.fn((): MockLock | null =>
      unavailable.has(scope) ? null : createLock(scope),
    );

  return {
    LockService: {
      getScriptLock: factory('script'),
      getDocumentLock: factory('document'),
      getUserLock: factory('user'),
    },
  };
}

export type Mocks = ReturnType<typeof createMocks>;
