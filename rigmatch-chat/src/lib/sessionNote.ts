// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The few facts a model cannot possibly know about its own situation.
 *
 * Asked "how many chats have we had together?", llama3.2:3b answered "this is
 * our first chat together" while sitting in the second of two threads. Nothing
 * was broken — the history for *this* conversation was being sent, and the same
 * model recalls a fact planted one turn earlier without trouble. The question
 * was simply about the application rather than the conversation, and a model
 * asked something it has no way to know will invent an answer rather than say
 * so.
 *
 * The fix is not to intercept the question. Matching phrases like "how many
 * chats" against natural language would hijack legitimate ones — "how many
 * chats does ChatGPT allow?" is a question for the model, not about the app.
 * Telling it the handful of facts it is missing lets it answer accurately by
 * itself, and costs a couple of dozen tokens.
 */

/** Kept short deliberately: this rides on every single request. */
export function buildSessionNote(options: {
  /** How many conversations exist with this model, including this one. */
  threadCount: number;
  /** When this conversation started. */
  startedAt: number;
  now: number;
}): string {
  const { threadCount, startedAt, now } = options;
  const started = describeWhen(startedAt, now);
  const others = Math.max(0, threadCount - 1);

  const scope = others > 0
    ? `this is 1 of ${threadCount} separate conversations the user keeps with you, and it began ${started}.`
    : `this is the user's only conversation with you, and it began ${started}.`;

  // Saying what it CAN see matters as much as what it cannot. An earlier
  // version only issued the prohibition, and the model turned cautious about
  // its own transcript — answering "your first message was Test" and then
  // undermining it with "but I don't know what you said before that".
  const canSee = 'You can read all of this conversation normally and should answer about it as usual.';

  const cannotSee = others > 0
    ? ` You cannot read ${others === 1 ? 'the other one' : `the other ${others}`} — if asked about those, say so rather than guessing.`
    : '';

  return `Facts you have no other way to know: ${scope} ${canSee}${cannotSee}`;
}

/**
 * Phrased for a reader, not parsed by one — a model handles "yesterday" as
 * comfortably as a date, and it survives being read weeks later.
 */
function describeWhen(startedAt: number, now: number): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(startedAt);
  const elapsed = now - startedAt;

  if (elapsed < 0) return 'recently';
  if (elapsed < dayMs && new Date(now).getDate() === start.getDate()) return 'earlier today';
  if (elapsed < 2 * dayMs) return 'yesterday';
  if (elapsed < 7 * dayMs) return `${Math.floor(elapsed / dayMs)} days ago`;
  return `on ${start.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
