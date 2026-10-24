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
  /** RigMatch speaking rather than the model. Never sent back as context. */
  fromRigMatch?: boolean;
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
   * point — the previous behavior was Ollama silently discarding turns while
   * the transcript went on displaying them.
   */
  summary?: string;
  summarizedCount?: number;
  /** Which model wrote the summary, so the transcript can say. */
  summaryBy?: string;
  /**
   * A second model answering every message too, when this chat asks two. An
   * older Chat's next save deletes it (see SplitThread).
   */
  split?: SplitThread;
};

/**
 * The second model's side of a chat that asks two models at once.
 *
 * The conversation's own `modelName` and `messages` stay the first model's
 * thread, so a chat asking two is still an ordinary chat to everything that
 * does not know about this.
 *
 * Going back to an older Chat (0.9.9 or before) DELETES this side: that build
 * reads the first model's side, rebuilds each conversation without fields it
 * does not know, and its next save writes the file without them. Accepted
 * rather than bumping STORE_VERSION, which would make an older Chat refuse the
 * whole history instead: the Update Center only moves forward, and the release
 * notes say so.
 */
export type SplitThread = {
  modelName: string;
  /**
   * How many of the conversation's messages came before the second model
   * joined. It is sent them, so a follow-up makes sense to it, but only the
   * first model answered them.
   */
  from: number;
  /** Its own thread since then: the same questions, its own answers. */
  messages: StoredMessage[];
};

/** The first model's side of a chat asking two, or the second's. */
export type SplitColumn = "main" | "split";

/**
 * Names one answer in flight: this chat, this side. A side alone is not
 * enough — two chats asking two each have a second side, and Stop in one used
 * to reach the other's answer.
 */
export function streamKey(conversationId: string, column: SplitColumn): string {
  return `${conversationId}:${column}`;
}

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
  const strip = (messages: StoredMessage[]) => messages.map(({ images: _bytes, ...message }) => message);
  const withoutBytes = conversations.map((conversation) => ({
    ...conversation,
    messages: strip(conversation.messages),
    ...(conversation.split ? { split: { ...conversation.split, messages: strip(conversation.split.messages) } } : {}),
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

/**
 * The second model's side, or nothing when it is missing or damaged. Damage
 * here costs only that side: the first model's thread is read regardless.
 */
function cleanSplit(value: unknown, mainLength: number): SplitThread | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Partial<SplitThread>;
  const messages = cleanMessages(s.messages);
  if (!messages || typeof s.modelName !== "string" || !s.modelName) return undefined;
  // Clamped like summarizedCount: a start past the end would send the second
  // model turns that are not there.
  const from = typeof s.from === "number" ? Math.max(0, Math.min(Math.floor(s.from), mainLength)) : 0;
  return { modelName: s.modelName, from, messages };
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
  const split = cleanSplit(c.split, messages.length);

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
    ...(split ? { split } : {}),
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

/**
 * What reading a store file came to. Only "ok" and "missing" are safe to save
 * over; "unreadable" means a file is there and holds something this build could
 * not use.
 */
export type StoreRead<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "unreadable"; reason: string };

/**
 * Read a store file (conversations or memory) and say which of the three it was.
 *
 * A file that was locked, damaged or written by a newer version used to come
 * back as an empty list, and the first save then wrote that empty list over
 * it. Telling "nothing saved yet" apart from "could not read what is saved" is
 * what lets the caller hold off.
 */
export async function readStore<T>(
  read: () => Promise<string | null>,
  parse: (raw: string) => T | null,
): Promise<StoreRead<T>> {
  let raw: string | null;
  try {
    raw = await read();
  } catch (error) {
    return { status: "unreadable", reason: String((error as Error)?.message ?? error) };
  }
  // Zero bytes holds nothing to lose.
  if (raw === null || !raw.trim()) return { status: "missing" };
  const value = parse(raw);
  if (value === null) {
    return { status: "unreadable", reason: "the file is damaged, or was saved by a newer RigMatch Chat" };
  }
  return { status: "ok", value };
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

/** Start asking a second model too, from here on. What came before stays the first model's. */
export function startSplit(conversation: Conversation, modelName: string): Conversation {
  return { ...conversation, split: { modelName, from: conversation.messages.length, messages: [] } };
}

/**
 * The second model's whole conversation: what came before it joined, then its
 * own turns. What it is sent, and what it carries on with if it is kept.
 */
export function splitThread(conversation: Conversation): StoredMessage[] {
  const split = conversation.split;
  return split ? [...conversation.messages.slice(0, split.from), ...split.messages] : conversation.messages;
}

/** Change one side's messages, leaving everything else as it is. */
export function updateColumn(
  conversation: Conversation,
  column: SplitColumn,
  update: (messages: StoredMessage[]) => StoredMessage[],
): Conversation {
  if (column === "main") return { ...conversation, messages: update(conversation.messages) };
  // The second side was kept or dropped while an answer was still arriving.
  if (!conversation.split) return conversation;
  return { ...conversation, split: { ...conversation.split, messages: update(conversation.split.messages) } };
}

/** Back to one model: the side that was kept, as an ordinary chat with that model. */
export function keepColumn(conversation: Conversation, column: SplitColumn, now: number): Conversation {
  const { split: _dropped, ...single } = conversation;
  if (column === "main" || !conversation.split) return { ...single, updatedAt: now };
  return { ...single, modelName: conversation.split.modelName, messages: splitThread(conversation), updatedAt: now };
}

/**
 * One question in a chat asking two, and what each model said to it: the
 * rows of the side-by-side view. A note RigMatch added, or an error, belongs to
 * the side it happened on.
 */
export type SplitTurn = { ask: StoredMessage | null; main: StoredMessage[]; split: StoredMessage[] };

/**
 * A chat asking two, laid out for reading: what came before the split once,
 * then each question with both answers.
 *
 * Matched by the question's id, which both sides share, rather than by
 * position, so an answer that failed on one side cannot shift every later row.
 */
export function splitTurns(conversation: Conversation): { shared: StoredMessage[]; turns: SplitTurn[] } {
  const split = conversation.split;
  if (!split) return { shared: conversation.messages, turns: [] };
  const group = (messages: StoredMessage[]) => {
    const turns: Array<{ ask: StoredMessage | null; replies: StoredMessage[] }> = [];
    for (const message of messages) {
      if (message.role === "user") turns.push({ ask: message, replies: [] });
      else if (turns.length > 0) turns[turns.length - 1].replies.push(message);
      else turns.push({ ask: null, replies: [message] });
    }
    return turns;
  };
  const key = (ask: StoredMessage | null) => ask?.id ?? "";
  const second = new Map(group(split.messages).map((turn) => [key(turn.ask), turn]));
  const turns: SplitTurn[] = group(conversation.messages.slice(split.from)).map((turn) => {
    const other = second.get(key(turn.ask));
    second.delete(key(turn.ask));
    return { ask: turn.ask, main: turn.replies, split: other?.replies ?? [] };
  });
  for (const turn of second.values()) turns.push({ ask: turn.ask, main: [], split: turn.replies });
  return { shared: conversation.messages.slice(0, split.from), turns };
}

/**
 * The name of a question's attachment when its bytes are gone, as they are
 * after a restart (serializeStore keeps only the name). Asking it again would
 * send the words without the picture or recording they are about.
 */
export function lostAttachment(message: StoredMessage | null | undefined): string | null {
  return message?.attachmentName && !message.images?.length ? message.attachmentName : null;
}

/** The messages up to and including the last question: what asking again starts from. */
export function untilLastAsk(messages: StoredMessage[]): StoredMessage[] | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages.slice(0, i + 1);
  }
  return null;
}
