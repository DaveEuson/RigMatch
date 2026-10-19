// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What the in-app chat dock sends: the message and the conversation before it.
 *
 * The dock used to send one flattened prompt ("User: …\nAssistant:"), so it
 * turned newlines into spaces to keep a message from faking an Assistant line,
 * cut at 4,000 characters without saying so, and sent nothing but the last
 * message, so every follow-up reached a model that had forgotten the question.
 * Each turn now travels as its own message with its role, which a newline
 * cannot change.
 */

/** About 4,000 tokens: a long paste, not a book. */
const CHAT_MESSAGE_MAX_CHARS = 16_000;
/** Six exchanges back. */
const CHAT_HISTORY_TURNS = 12;
const CHAT_HISTORY_MAX_CHARS = 12_000;

/** Text as written: newlines and tabs kept, other control characters dropped. */
function cleanChatText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, ' ');
}

/** The message to send, and whether it had to be cut to fit. */
function chatMessageText(value) {
  const text = cleanChatText(value).trim();
  return {
    text: text.slice(0, CHAT_MESSAGE_MAX_CHARS).trim(),
    truncated: text.length > CHAT_MESSAGE_MAX_CHARS,
  };
}

/**
 * The conversation before this message, oldest first: the last
 * CHAT_HISTORY_TURNS turns that fit in CHAT_HISTORY_MAX_CHARS, the oldest
 * dropped first. Anything that is not a user or assistant turn is left out.
 */
function chatHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const turns = raw.slice(-CHAT_HISTORY_TURNS)
    .filter((turn) => (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string')
    .map((turn) => ({ role: turn.role, content: cleanChatText(turn.content).trim() }))
    .filter((turn) => turn.content);
  const kept = [];
  let chars = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    chars += turns[index].content.length;
    if (chars > CHAT_HISTORY_MAX_CHARS) break;
    kept.unshift(turns[index]);
  }
  return kept;
}

module.exports = {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_HISTORY_TURNS,
  CHAT_HISTORY_MAX_CHARS,
  cleanChatText,
  chatMessageText,
  chatHistory,
};
