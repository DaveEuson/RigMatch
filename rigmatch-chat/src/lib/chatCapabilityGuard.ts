// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Saying plainly what the model in this chat cannot do.
 *
 * The main app has done this since 0.7 opened; the companion never did, and the
 * companion is the window people actually talk in. Asked to draw a dog,
 * starcoder2:3b answered "As a text-based AI, I don't have the capability to
 * create visual content" and then wrote two hundred words describing one. That
 * model was being honest — and the person still got prose instead of a picture,
 * with nothing pointing at the image maker sitting one click away in the same
 * window.
 *
 * Two halves, deliberately kept apart:
 *
 *  - `classifyChatRequest` is copied verbatim from src/lib/chatCapabilityGuard.ts
 *    and must stay identical. tests/chatGuardParity.test.mjs fails if the two
 *    drift, for the same reason the benchmark suites have a parity guard: code
 *    that exists twice and is edited once is a bug nobody sees.
 *  - the note text is *not* shared, because the two surfaces can offer different
 *    things. The main app points at Advanced Mode; this one points at the chips
 *    above the model list and can name the checkpoint that would do the work.
 */

export type ChatBeyond = 'image' | 'video' | 'speech' | 'transcribe' | null;

/**
 * What the message is asking to be produced, if it is asking for a file at all.
 *
 * Both an action and an object are required: "draw" alone catches "how do I
 * draw a flowchart in Mermaid", which is a text question with a text answer.
 *
 * KEEP IDENTICAL to src/lib/chatCapabilityGuard.ts — see the note above.
 */
export function classifyChatRequest(message: string): ChatBeyond {
  const text = (message || '').toLowerCase();

  // An action *and* an object, with no verbless fallback. A "the picture ... of"
  // branch seemed a cheap way to catch "a picture of a cat please", and it also
  // caught "summarise the picture this data paints of Q4" — an ordinary
  // question about a spreadsheet. Missing the rare verbless request is the
  // better failure: a note that fires on prose stops being read.
  const asks = (verbs: string, nouns: string) =>
    new RegExp(`\\b(${verbs})\\b[^.?!]{0,40}\\b(${nouns})\\b`).test(text);

  // Video first: "make a video of a cat" also matches the image nouns via
  // "of", and the more specific answer is the more useful one.
  if (asks('make|create|generate|render|animate|produce', 'video|animation|clip|gif|movie')) return 'video';
  if (asks('draw|sketch|paint|render|generate|create|make|design|illustrate',
    'image|picture|photo|photograph|logo|illustration|artwork|drawing|painting|icon|poster|wallpaper')) return 'image';
  if (asks('say|speak|read|generate|make|produce', 'aloud|out loud|audio|voice|speech|mp3|wav|podcast')) return 'speech';

  // Transcription is the one request here that some local models really can
  // answer, so it is classified separately and only warned about when the
  // selected model cannot hear. A text model asked to transcribe does not
  // refuse — it writes a plausible transcript of nothing.
  if (/\btranscri(be|ption|pt)\b/.test(text)) return 'transcribe';
  if (/\b(listen to|subtitle|caption)\b[^.?!]{0,30}\b(this|that|it|recording|audio|clip|file)\b/.test(text)) return 'transcribe';

  return null;
}

/**
 * The note this window shows, or null when there is nothing worth saying.
 *
 * Returns null generously. A model that genuinely hears must not be warned
 * about transcription, and a request this window can honour outright — a
 * picture, when the maker is ready — gets a pointer rather than a refusal. A
 * warning that fires when it need not is how people learn to ignore warnings.
 */
export function companionBeyondNote(
  kind: ChatBeyond,
  model: string,
  able: { canSee: boolean; canHear: boolean; makerReady: boolean; checkpoint?: string | null },
): string | null {
  if (!kind) return null;
  const name = model || 'This model';

  if (kind === 'image') {
    // The one case this window can actually finish. Naming the checkpoint
    // matters: it is the difference between "somewhere else" and "there".
    return able.makerReady
      ? `${name} writes text — it cannot make pictures, and anything it describes below will be words. `
        + `To make a real one, choose **Make a picture** above the model list; `
        + `${able.checkpoint ?? 'ComfyUI'} is ready and will do it.`
      : `${name} writes text — it cannot make pictures, and anything it describes below will be words. `
        + `Picture-making is ComfyUI's job, reached through **Make a picture** above the model list — `
        + `it is not ready right now, so nothing here can produce one yet.`;
  }

  if (kind === 'video') {
    return `${name} writes text — it cannot make video, and this window does not make video at all. `
      + `RigMatch has a Video test in Advanced Mode → Activity, which is the only place that renders one.`;
  }

  if (kind === 'speech') {
    return `${name} writes text — it cannot speak or produce audio. `
      + `Nothing in RigMatch does yet, so there is no elsewhere to point you at.`;
  }

  // transcribe — the only kind where the model may genuinely be able to.
  if (able.canHear) return null;
  return `${name} cannot listen, so it cannot transcribe a recording. Asked anyway, a text model does `
    + `not refuse — it writes a plausible transcript of audio it never heard. `
    + `Pick a model marked **hears** and attach the recording to that one instead.`;
}
