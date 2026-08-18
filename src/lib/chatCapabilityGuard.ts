/**
 * Saying plainly what the model in the chat box cannot do.
 *
 * Ollama serves text. Ask a text model to draw a cat and it will not refuse —
 * it will describe one warmly, or announce that it has made one. Both read as
 * success, and the second is a straight untruth the app is currently repeating
 * without comment.
 *
 * So the app says it first, in its own voice, before the model answers.
 *
 * Deliberately NOT a block. The patterns below will sometimes fire on a message
 * that only mentions drawing, and refusing to pass that on would be a worse
 * failure than a redundant note — the person still gets their answer, they just
 * are not misled about where a picture would come from. Every pattern is
 * therefore kept tight enough to be worth reading when it does fire.
 */

export type ChatBeyond = 'image' | 'video' | 'speech' | null;

/**
 * What the message is asking to be produced, if it is asking for a file at all.
 *
 * Both an action and an object are required: "draw" alone catches "how do I
 * draw a flowchart in Mermaid", which is a text question with a text answer.
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

  return null;
}

/**
 * The note to put in the transcript before the model replies.
 *
 * Each one names where the thing can actually be done, because "I cannot do
 * that" without a route is only half an answer — and RigMatch can do two of
 * these three, just not here.
 */
export function chatBeyondNote(kind: ChatBeyond, model: string): string | null {
  if (!kind) return null;
  const name = model || 'This model';

  if (kind === 'image') {
    return `${name} writes text — it cannot make images. Anything it describes below is words, not a picture. `
      + 'Image generation lives in Advanced Mode → Activity → the Image test, and needs ComfyUI running.';
  }
  if (kind === 'video') {
    return `${name} writes text — it cannot make video. Video generation lives in Advanced Mode → Activity → `
      + 'the Video test, and needs ComfyUI with a video checkpoint and a text encoder.';
  }
  return `${name} writes text — it cannot produce audio. RigMatch has no text-to-speech; `
    + 'it can only listen, using a model that reports the audio capability.';
}
