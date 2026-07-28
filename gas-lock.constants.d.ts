/** Falls back to this when `withLock` isn't given a timeout. */
declare const _GAS_LOCK_DEFAULT_TIMEOUT_MS = 30000;
/** One factory per scope — resolved lazily, never memoized ahead of a call. */
declare const _GAS_LOCK_FACTORIES: Readonly<{
  script: () => GoogleAppsScript.Lock.Lock;
  document: () => GoogleAppsScript.Lock.Lock;
  user: () => GoogleAppsScript.Lock.Lock;
}>;
