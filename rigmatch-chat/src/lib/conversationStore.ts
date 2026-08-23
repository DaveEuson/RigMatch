// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Conversations: what they are, and how they survive a version change.
 *
 * They used to be a map from `model::personality` to a list of messages, which
 * meant exactly one thread per model — no second subject, no title, no way to
 * start over without losing what came before. This makes a conversation a thing
 * with an identity, so a model can hold as many as you like.
 *
 * The v1 shape is still out there in every existing install, so reading it and
 * carrying it forward matters more than the new shape being tidy. Nothing here
 * throws: a store that cannot be read must never cost someone their history.
 */

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  /**
   * Where a generated picture was saved. The path is persisted; the picture is
   * not — conversations are rewritten on every change, and a quarter-megabyte
   * image per message is how this file grew unmanageable before.
   */
  imagePath?: string;
  /** The RigMatch job it came from, for fetching the bytes to display. */
  imageJobId?: string;
  /**
   * An attachment's bytes, base64, held for this session only.
   *
   * Never written to the file — see serializeStore. A recording is close to a
   * megabyte once base64'd, the store is rewritten on every change, and this
   * file has been grown unmanageable by exactly that once already. What
   * persists is attachmentName, so a reopened conversation still shows that
   * something was sent and what it was called.
   */
  images?: string[];
  /** What the attachment was called, which is cheap enough to keep. */
  attachmentName?: string;
};

export type Conversation = {
  id: string;
  /** The Ollama model this thread talks to. */
  modelName: string;
  /** Which personality was active. Kept per thread so switching does not
      silently swap you to a different, apparently empty conversation. */
  personalityId: string;
  title: string;
  /** False once renamed by hand, so an auto title never overwrites a real one. */
  titleIsAuto: boolean;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  /**
   * Notes standing in for the first `summarizedCount` messages when this thread
   * is sent to the model.
   *
   * The messages themselves are kept: the transcript still shows every word
   * that was said, and only what gets *sent* is shortened. That is the whole
   * point — the previous behaviour was Ollama silently discarding turns while
   * the transcript went on displaying them.
   */
  summary?: string;
  summarizedCount?: number;
  /** Which model wrote the summary, so the transcript can say. */
  summaryBy?: string;
};

/**
 * 1 — `{ "model::personality": Message[] }`, one thread per model.
 * 2 — conversations with identity, titles, and many per model.
 */
export const STORE_VERSION = 2;

export const NEW_CHAT_TITLE = "New chat";

/** Longest auto title before it gets cut at a word boundary. */
const TITLE_MAX = 44;

export function serializeStore(conversations: Conversation[]): string {
  // Attachment bytes are dropped on the way to disk, deliberately and in one
  // place. They are useful for the rest of the session — a follow-up question
  // about the same picture needs them in context — and ruinous in a file that
  // is rewritten on every keystroke. The name survives so the transcript can
  // still say what was sent.
  const withoutBytes = conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map(({ images, ...message }) => message),
  }));
  return JSON.stringify({ version: STORE_VERSION, conversations: withoutBytes });
}

/**
 * A conversation's name, taken from the first thing asked in it.
 *
 * The opening question is what people remember a thread by — the same reason
 * every other chat app does this — and it costs nothing, unlike asking a model
 * to name it.
 */
export function deriveTitle(messages: StoredMessage[]): string {
  // The first user message with something in it, rather than simply the first:
  // a blank one should not leave the thread called "New chat" forever.
  const line = messages
    .filter((m) => m.role === "user")
    .flatMap((m) => m.content.split("\n"))
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return NEW_CHAT_TITLE;
  if (line.length <= TITLE_MAX) return line;
  // Cut at a word boundary when there is one near the end, so titles do not
  // break mid-word.
  const clipped = line.slice(0, TITLE_MAX);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > TITLE_MAX * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

function cleanMessages(value: unknown): StoredMessage[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (m): m is StoredMessage =>
      !!m && typeof m === "object"
      && typeof (m as StoredMessage).content === "string"
      && ((m as StoredMessage).role === "user" || (m as StoredMessage).role === "assistant"),
  );
}

/**
 * Turn the v1 map into conversations.
 *
 * Keys were `model::personalityId`, or a bare model name from before
 * personalities existed. Both have to survive: a bare key is somebody's whole
 * chat history with that model.
 *
 * `makeId` and `now` are injected so a migration is reproducible in a test
 * rather than depending on the clock.
 */
export function migrateV1(
  map: Record<string, unknown>,
  makeId: (index: number) => string,
  now: number,
  defaultPersonalityId: string,
): Conversation[] {
  const conversations: Conversation[] = [];
  for (const [key, rawMessages] of Object.entries(map)) {
    const messages = cleanMessages(rawMessages);
    // An empty thread carried nothing worth keeping and would show up as an
    // untitled row in the sidebar.
    if (!messages || messages.length === 0) continue;

    const separator = key.lastIndexOf("::");
    const modelName = separator === -1 ? key : key.slice(0, separator);
    const personalityId = separator === -1 ? defaultPersonalityId : key.slice(separator + 2);
    if (!modelName) continue;

    const lastTs = messages[messages.length - 1]?.ts;
    conversations.push({
      id: makeId(conversations.length),
      modelName,
      personalityId: personalityId || defaultPersonalityId,
      title: deriveTitle(messages),
      titleIsAuto: true,
      createdAt: messages[0]?.ts ?? now,
      updatedAt: typeof lastTs === "number" ? lastTs : now,
      messages,
    });
  }
  return conversations;
}

function cleanConversation(value: unknown, index: number, makeId: (i: number) => string, now: number): Conversation | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<Conversation>;
  const messages = cleanMessages(c.messages);
  if (!messages) return null;
  if (typeof c.modelName !== "string" || !c.modelName) return null;
  // A count that outran the messages would hide real turns from the model, so
  // it is clamped to what is actually there rather than trusted.
  const summary = typeof c.summary === "string" && c.summary ? c.summary : undefined;
  const summarizedCount = summary && typeof c.summarizedCount === "number"
    ? Math.max(0, Math.min(Math.floor(c.summarizedCount), messages.length))
    : undefined;

  return {
    id: typeof c.id === "string" && c.id ? c.id : makeId(index),
    modelName: c.modelName,
    personalityId: typeof c.personalityId === "string" ? c.personalityId : "",
    title: typeof c.title === "string" && c.title ? c.title : deriveTitle(messages),
    titleIsAuto: c.titleIsAuto !== false,
    createdAt: typeof c.createdAt === "number" ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : now,
    messages,
    ...(summary ? { summary } : {}),
    ...(summarizedCount !== undefined ? { summarizedCount } : {}),
    ...(typeof c.summaryBy === "string" && c.summaryBy ? { summaryBy: c.summaryBy } : {}),
  };
}

/**
 * Read a store file of any version this build understands.
 *
 * A file from a *newer* version is refused rather than half-read — better to
 * show nothing than to drop conversations a later build wrote and then save the
 * damage back over them.
 */
export function parseStore(
  raw: string | null,
  options: { makeId: (index: number) => string; now: number; defaultPersonalityId: string },
): Conversation[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const file = parsed as { version?: unknown; conversations?: unknown };

  if (file.version === 1) {
    if (!file.conversations || typeof file.conversations !== "object") return null;
    return migrateV1(
      file.conversations as Record<string, unknown>,
      options.makeId,
      options.now,
      options.defaultPersonalityId,
    );
  }

  if (file.version === STORE_VERSION) {
    if (!Array.isArray(file.conversations)) return null;
    return file.conversations
      .map((c, i) => cleanConversation(c, i, options.makeId, options.now))
      .filter((c): c is Conversation => c !== null);
  }

  return null;
}

/** Newest first — the order the sidebar lists them in. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function conversationsForModel(conversations: Conversation[], modelName: string): Conversation[] {
  return sortConversations(conversations.filter((c) => c.modelName === modelName));
}

/**
 * Fold a new or changed message list back into a conversation, refreshing the
 * title while it is still automatic and always the modified time.
 */
export function withMessages(conversation: Conversation, messages: StoredMessage[], now: number): Conversation {
  return {
    ...conversation,
    messages,
    title: conversation.titleIsAuto ? deriveTitle(messages) : conversation.title,
    updatedAt: now,
  };
}

export function createConversation(options: {
  id: string;
  modelName: string;
  personalityId: string;
  now: number;
}): Conversation {
  return {
    id: options.id,
    modelName: options.modelName,
    personalityId: options.personalityId,
    title: NEW_CHAT_TITLE,
    titleIsAuto: true,
    createdAt: options.now,
    updatedAt: options.now,
    messages: [],
  };
}
