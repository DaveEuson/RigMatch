/**
 * Where conversations live, and how often they get written.
 *
 * Two things were wrong. Conversations sat in localStorage, which is capped
 * around 5 MB — past that `setItem` throws, and the write sat unguarded in an
 * effect that runs on mount, so a full history tripped the error boundary on
 * startup and kept doing it on every launch. And the effect was keyed on the
 * message map, which changes on every streamed token, so the *entire* store was
 * re-serialized and written once per token: measured at 4.3 ms and 5 MB per
 * token on a heavy history, or about 2.6 seconds of blocked main thread and
 * 3 GB written for a single 600-token reply.
 *
 * So: a file instead of localStorage, and writes coalesced instead of one per
 * token.
 */

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

export type ConversationMap = Record<string, StoredMessage[]>;

/**
 * Bumped when the on-disk shape changes. A file from a newer version is left
 * alone rather than being read as if it were this one — better to start empty
 * than to quietly drop conversations a later build wrote.
 */
export const STORE_VERSION = 1;

type StoreFile = { version: number; conversations: ConversationMap };

export function serializeStore(conversations: ConversationMap): string {
  return JSON.stringify({ version: STORE_VERSION, conversations } satisfies StoreFile);
}

/**
 * Read a store file. Anything unreadable, from any version but this one, or not
 * shaped like a conversation map yields null — the caller keeps what it has
 * rather than replacing it with nonsense.
 */
export function parseStore(raw: string | null): ConversationMap | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const file = parsed as Partial<StoreFile>;
  if (file.version !== STORE_VERSION) return null;
  if (!file.conversations || typeof file.conversations !== "object") return null;

  // Drop anything that is not a list of messages rather than handing the UI a
  // value it will crash on.
  const clean: ConversationMap = {};
  for (const [key, messages] of Object.entries(file.conversations)) {
    if (!Array.isArray(messages)) continue;
    clean[key] = messages.filter(
      (m): m is StoredMessage =>
        !!m && typeof m === "object"
        && typeof (m as StoredMessage).content === "string"
        && ((m as StoredMessage).role === "user" || (m as StoredMessage).role === "assistant"),
    );
  }
  return clean;
}

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
