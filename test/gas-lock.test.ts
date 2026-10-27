import { describe, expect, it, type Mock } from 'vitest';
import { loadGasLock } from './harness';
import { LOCK_TIMEOUT_MESSAGE, type MockLock } from './mocks';

/** Returns the first lock handle `factory` produced. */
function lockOf(factory: Mock<() => MockLock | null>): MockLock {
  const lock = factory.mock.results[0]?.value;
  if (!lock) throw new Error('No lock was requested');
  return lock;
}

const PROTOTYPE_KEYS = [
  'toString',
  'constructor',
  'hasOwnProperty',
  '__proto__',
];

/** Exact message for a rejected scope. */
const unknownScopeMessage = (scope: string): string =>
  `[GasLock] Unknown lock scope "${scope}". Expected one of: script, document, user.`;

describe('GasLock.withLock', () => {
  it('acquires with waitLock and a 30000ms default timeout', () => {
    const { GasLock, mocks } = loadGasLock();

    GasLock.withLock('script', () => undefined);

    const lock = lockOf(mocks.LockService.getScriptLock);
    expect(lock.waitLock).toHaveBeenCalledExactlyOnceWith(30000);
  });

  it('passes a custom timeoutMs to waitLock', () => {
    const { GasLock, mocks } = loadGasLock();

    GasLock.withLock('user', () => undefined, { timeoutMs: 5000 });

    const lock = lockOf(mocks.LockService.getUserLock);
    expect(lock.waitLock).toHaveBeenCalledExactlyOnceWith(5000);
  });

  it("returns the callback's value", () => {
    const { GasLock } = loadGasLock();

    expect(GasLock.withLock('script', () => 42)).toBe(42);
  });

  it('releases the lock after the callback', () => {
    const { GasLock, mocks } = loadGasLock();

    GasLock.withLock('script', () => undefined);

    const lock = lockOf(mocks.LockService.getScriptLock);
    expect(lock.releaseLock).toHaveBeenCalledOnce();
    expect(lock.hasLock()).toBe(false);
  });

  it('releases the lock and propagates when the callback throws', () => {
    const { GasLock, mocks } = loadGasLock();

    expect(() =>
      GasLock.withLock('script', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    const lock = lockOf(mocks.LockService.getScriptLock);
    expect(lock.releaseLock).toHaveBeenCalledOnce();
    expect(lock.hasLock()).toBe(false);
  });

  it('reuses the held lock for a nested call on the same scope', () => {
    const { GasLock, mocks } = loadGasLock();

    GasLock.withLock('script', () => {
      const result = GasLock.withLock('script', () => 'inner');
      const lock = lockOf(mocks.LockService.getScriptLock);

      expect(result).toBe('inner');
      expect(mocks.LockService.getScriptLock).toHaveBeenCalledOnce();
      expect(lock.waitLock).toHaveBeenCalledOnce();
      expect(lock.releaseLock).not.toHaveBeenCalled();
      expect(lock.hasLock()).toBe(true);
      expect(GasLock.isHeld('script')).toBe(true);
    });
  });

  it('acquires different scopes independently', () => {
    const { GasLock, mocks } = loadGasLock();

    GasLock.withLock('script', () => {
      GasLock.withLock('user', () => {
        expect(GasLock.isHeld('script')).toBe(true);
        expect(GasLock.isHeld('user')).toBe(true);
        expect(GasLock.isHeld('document')).toBe(false);
      });

      expect(GasLock.isHeld('user')).toBe(false);
      expect(GasLock.isHeld('script')).toBe(true);
    });

    expect(
      lockOf(mocks.LockService.getScriptLock).waitLock,
    ).toHaveBeenCalledOnce();
    expect(
      lockOf(mocks.LockService.getUserLock).waitLock,
    ).toHaveBeenCalledOnce();
  });

  it('throws for an unknown scope', () => {
    const { GasLock } = loadGasLock();

    expect(() => GasLock.withLock('bogus', () => 1)).toThrow(
      '[GasLock] Unknown lock scope "bogus". Expected one of: script, document, user.',
    );
  });

  it.each(PROTOTYPE_KEYS)(
    'throws for the inherited object key "%s"',
    (scope) => {
      const { GasLock } = loadGasLock();

      expect(() => GasLock.withLock(scope, () => 1)).toThrow(
        unknownScopeMessage(scope),
      );
    },
  );

  it('throws when LockService returns no document lock', () => {
    const { GasLock } = loadGasLock({ unavailable: ['document'] });

    expect(() => GasLock.withLock('document', () => 1)).toThrow(
      /LockService returned no lock for scope "document"/,
    );
    expect(() => GasLock.withLock('document', () => 1)).toThrow(
      /"document" locks are unavailable outside the context of a containing document/,
    );
    expect(GasLock.isHeld('document')).toBe(false);
  });

  it.each(['script', 'user'] as const)(
    'names the "%s" scope without the document hint when no lock is returned',
    (scope) => {
      const { GasLock } = loadGasLock({ unavailable: [scope] });

      expect(() => GasLock.withLock(scope, () => 1)).toThrow(
        `[GasLock] LockService returned no lock for scope "${scope}".`,
      );
      expect(GasLock.isHeld(scope)).toBe(false);
    },
  );

  it('propagates a waitLock timeout and leaves the scope unheld', () => {
    const { GasLock } = loadGasLock({ contended: ['script'] });
    let ran = false;

    expect(() =>
      GasLock.withLock('script', () => {
        ran = true;
      }),
    ).toThrow(LOCK_TIMEOUT_MESSAGE);

    expect(ran).toBe(false);
    expect(GasLock.isHeld('script')).toBe(false);
  });
});

describe('GasLock.isHeld', () => {
  it('is true inside the callback and false outside', () => {
    const { GasLock } = loadGasLock();

    expect(GasLock.isHeld('script')).toBe(false);
    GasLock.withLock('script', () => {
      expect(GasLock.isHeld('script')).toBe(true);
    });
    expect(GasLock.isHeld('script')).toBe(false);
  });

  it('is false after the callback throws', () => {
    const { GasLock } = loadGasLock();

    expect(() =>
      GasLock.withLock('script', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(GasLock.isHeld('script')).toBe(false);
  });
});

describe('GasLock.getLock', () => {
  it('returns the raw lock without acquiring it', () => {
    const { GasLock, mocks } = loadGasLock();

    const lock = GasLock.getLock('script');

    expect(lock).toBe(lockOf(mocks.LockService.getScriptLock));
    expect(lock?.waitLock).not.toHaveBeenCalled();
    expect(lock?.tryLock).not.toHaveBeenCalled();
    expect(GasLock.isHeld('script')).toBe(false);
  });

  it('returns null when LockService provides no document lock', () => {
    const { GasLock } = loadGasLock({ unavailable: ['document'] });

    expect(GasLock.getLock('document')).toBeNull();
  });

  it('throws for an unknown scope', () => {
    const { GasLock } = loadGasLock();

    expect(() => GasLock.getLock('bogus')).toThrow(
      '[GasLock] Unknown lock scope "bogus".',
    );
  });

  it.each(PROTOTYPE_KEYS)(
    'throws for the inherited object key "%s"',
    (scope) => {
      const { GasLock } = loadGasLock();

      expect(() => GasLock.getLock(scope)).toThrow(unknownScopeMessage(scope));
    },
  );
});
