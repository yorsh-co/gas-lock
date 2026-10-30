/** Asserts that `fn` throws an error whose message contains `substring`. */
const expectThrows = (fn: () => unknown, substring: string): void => {
  let message: string | undefined;
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message !== undefined, `expected an error containing "${substring}"`);
  assert(
    message.includes(substring),
    `expected "${substring}" in error, got "${message}"`,
  );
};

/** Releases a raw lock handle if the execution still holds it. */
const releaseRaw = (lock: GoogleAppsScript.Lock.Lock | null): void => {
  if (lock && lock.hasLock()) lock.releaseLock();
};

/**
 * Naive nested locking outside GasLock. A raw handle's `releaseLock()` is a
 * no-op until that handle has itself acquired the lock.
 */
const acquireAndReleaseRaw = (): void => {
  const raw = LockService.getScriptLock();
  assert(raw.tryLock(0), 'raw handle should join the held script lock');
  raw.releaseLock();
};

// The premise GasLock and test/mocks.ts rely on: locks belong to the
// execution, not to the handle.
test('per-execution ownership', () => {
  const first = LockService.getScriptLock();
  const second = LockService.getScriptLock();
  try {
    assert(first.tryLock(0), 'first handle should acquire the script lock');
    assert(second.tryLock(0), 'second handle should join the same execution');
    second.releaseLock();
    assert(
      !first.hasLock(),
      "releasing the second handle should release the first handle's lock",
    );
  } finally {
    releaseRaw(first);
    releaseRaw(second);
  }
});

info('fresh handle hasLock', () => {
  const holder = LockService.getScriptLock();
  try {
    holder.tryLock(0);
    return `hasLock() on a fresh handle: ${LockService.getScriptLock().hasLock()}`;
  } finally {
    releaseRaw(holder);
  }
});

test('withLock basics', () => {
  (['script', 'user'] as GasLockScope[]).forEach((scope) => {
    assert(!GasLock.isHeld(scope), `${scope} should start free`);
    const result = GasLock.withLock(scope, () => {
      assert(GasLock.isHeld(scope), `${scope} should be held inside`);
      return 42;
    });
    assert(result === 42, `${scope}: callback value not returned`);
    assert(!GasLock.isHeld(scope), `${scope} should be free after`);
  });
});

test('nested withLock reuses the held lock', () => {
  const owner = GasLock.getLock('script');
  assert(owner !== null, 'script lock should be available');
  try {
    owner.waitLock(1000);
    const result = GasLock.withLock('script', () => 'nested');
    assert(result === 'nested', 'nested callback should run');
    assert(
      owner.hasLock(),
      'nested withLock should not release the outer lock',
    );
  } finally {
    owner.releaseLock();
  }
});

test('callback error releases the scope', () => {
  const failure = new Error('boom');
  try {
    GasLock.withLock('script', () => {
      throw failure;
    });
    assert(false, 'expected withLock to throw');
  } catch (error) {
    assert(error === failure, 'callback error should propagate unchanged');
  }
  assert(!GasLock.isHeld('script'), 'scope should be released');
  assert(
    GasLock.withLock('script', () => true, { timeoutMs: 1000 }),
    'a following withLock should acquire',
  );
});

test('lost lock is detected', () => {
  expectThrows(
    () => GasLock.withLock('script', acquireAndReleaseRaw),
    'released before withLock',
  );
  assert(!GasLock.isHeld('script'), 'scope should be cleared');
});

test('callback error wins over lost lock', () => {
  const failure = new Error('boom');
  try {
    GasLock.withLock('script', () => {
      acquireAndReleaseRaw();
      throw failure;
    });
    assert(false, 'expected withLock to throw');
  } catch (error) {
    assert(error === failure, 'callback error should win');
  }
  assert(!GasLock.isHeld('script'), 'scope should be cleared');
});

test('getLock handles', () => {
  const owner = GasLock.getLock('script');
  const joiner = GasLock.getLock('script');
  assert(owner !== null && joiner !== null, 'script lock should be available');
  try {
    assert(owner.tryLock(0), 'owner should acquire');
    assert(GasLock.isHeld('script'), 'owner should mark the scope held');
    assert(joiner.tryLock(0), 'second handle should join');
    joiner.releaseLock();
    assert(owner.hasLock(), 'joined release should leave the owner holding');
    assert(GasLock.isHeld('script'), 'scope should stay held');
  } finally {
    joiner.releaseLock();
    owner.releaseLock();
  }
  assert(!GasLock.isHeld('script'), 'owner release should clear the scope');
});

test('document scope', () => {
  const raw = LockService.getDocumentLock();
  try {
    if (raw === null) {
      expectThrows(
        () => GasLock.withLock('document', () => undefined),
        '"document" locks are unavailable',
      );
      assert(GasLock.getLock('document') === null, 'getLock should be null');
    } else {
      GasLock.withLock('document', () => {
        assert(GasLock.isHeld('document'), 'document should be held inside');
      });
      assert(!GasLock.isHeld('document'), 'document should be free after');
    }
  } finally {
    releaseRaw(raw);
  }
});

info('document context', () => {
  const raw = LockService.getDocumentLock();
  releaseRaw(raw);
  return raw === null ? 'getDocumentLock() is null' : 'document lock available';
});

test('unknown scope', () => {
  const scope = 'bogus' as GasLockScope;
  expectThrows(
    () => GasLock.withLock(scope, () => undefined),
    'Unknown lock scope',
  );
  expectThrows(() => GasLock.getLock(scope), 'Unknown lock scope');
});
