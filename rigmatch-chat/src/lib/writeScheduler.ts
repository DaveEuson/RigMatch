/**
 * Coalesces rapid persistence updates into occasional writes.
 *
 * Conversations were saved by an effect keyed on the message map, which changes
 * on every streamed token — so the entire store was re-serialized and written
 * once per token. Measured on a 5 MB history: 600 writes, about 3 GB, and 2.5
 * seconds of blocked main thread for one 600-token reply.
 */

export type WriteScheduler<T> = {
  /** Note new state to be written. Replaces any pending value. */
  schedule: (value: T) => void;
  /** Write anything pending immediately. Resolves once the write settles. */
  flush: () => Promise<void>;
  /** Drop anything pending and stop the timers. */
  cancel: () => void;
};

/**
 * Coalesces rapid updates into occasional writes.
 *
 * `delayMs` is the quiet period after the last change. `maxDelayMs` bounds how
 * long a continuous stream of changes can defer a write — without it a long
 * reply, which updates on every token, would never reach a quiet moment and
 * nothing would be saved until it finished.
 *
 * Writes never overlap and never reject: a failing write is reported through
 * `onError` and the next attempt carries the newest state anyway. Persistence
 * failing must not take the app down, which is exactly what it used to do.
 */
export function createWriteScheduler<T>(options: {
  write: (value: T) => Promise<void>;
  delayMs?: number;
  maxDelayMs?: number;
  onError?: (error: unknown) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}): WriteScheduler<T> {
  const {
    write,
    delayMs = 800,
    maxDelayMs = 4000,
    onError,
    setTimer = ((fn: () => void, ms: number) => setTimeout(fn, ms)) as (fn: () => void, ms: number) => unknown,
    clearTimer = ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    now = () => Date.now(),
  } = options;

  let pending: { value: T } | null = null;
  let timer: unknown = null;
  let firstPendingAt = 0;
  let inFlight: Promise<void> | null = null;

  const stopTimer = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const runWrite = async (): Promise<void> => {
    // One write at a time; whatever arrives meanwhile goes in the next one.
    if (inFlight) return inFlight;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    stopTimer();
    inFlight = (async () => {
      try {
        await write(value);
      } catch (error) {
        onError?.(error);
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
    // Changes that landed during the write still need saving.
    if (pending) await runWrite();
  };

  const arm = () => {
    stopTimer();
    const waited = now() - firstPendingAt;
    const wait = Math.max(0, Math.min(delayMs, maxDelayMs - waited));
    timer = setTimer(() => { void runWrite(); }, wait);
  };

  return {
    schedule(value: T) {
      if (!pending) firstPendingAt = now();
      pending = { value };
      arm();
    },
    async flush() {
      stopTimer();
      await runWrite();
      // A write that was already running may have started before the newest
      // value arrived, so make sure that one lands too.
      if (pending) await runWrite();
    },
    cancel() {
      pending = null;
      stopTimer();
    },
  };
}
