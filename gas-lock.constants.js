'use strict';
/** Falls back to this when `withLock` isn't given a timeout. */
const _GAS_LOCK_DEFAULT_TIMEOUT_MS = 30000;
/** One factory per scope — resolved lazily, never memoized ahead of a call. */
const _GAS_LOCK_FACTORIES = Object.freeze({
  script: () => LockService.getScriptLock(),
  document: () => LockService.getDocumentLock(),
  user: () => LockService.getUserLock(),
});
