/**
 * Every word RigMatch uses that a newcomer would not already know.
 *
 * These definitions existed before, as the Advanced ticker's rotating tips —
 * which is to say the explanations were shown only to the people who least
 * needed them, because the ticker is gated to Advanced Mode. They live here
 * now so Simple Mode can put them next to the words themselves.
 *
 * The rule for writing one: assume the reader has never run a model, does not
 * know what a graphics card is for, and has never opened a terminal. A
 * definition that needs a second definition to make sense has failed, and
 * tests/glossary.test.mjs enforces that by checking no definition leans on a
 * term this file has not already explained in plain words.
 */

export type GlossaryEntry = {
  id: string;
  /** How the word appears in the interface. */
  term: string;
  /** One sentence, no jargon, aimed at someone who has never heard the word. */
  plain: string;
  /** A second sentence for why it matters here. Optional. */
  because?: string;
  /** The technical name, when the plain term is a friendlier stand-in. */
  alsoCalled?: string;
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'model',
    term: 'AI model',
    plain: 'A file containing everything an AI has learned, which your computer can run to answer questions, write, or make pictures.',
    because: 'Different models are good at different things, which is why it is worth finding the right one rather than the famous one.',
  },
  {
    id: 'local',
    term: 'Runs on your PC',
    plain: 'The model does its thinking on your own computer, so what you type never leaves it.',
    because: 'No account, no subscription, and it keeps working with the internet switched off.',
  },
  {
    id: 'ollama',
    term: 'Ollama',
    plain: 'A free program that does the actual work of downloading AI models and running them on your computer.',
    because: 'RigMatch is the part that tests models and picks a winner; Ollama is the part that runs them. You need it installed once, and RigMatch can do that for you.',
  },
  {
    id: 'graphics-card',
    term: 'Graphics card',
    plain: 'The part of your computer built for heavy visual work — games, video, and as it turns out, AI.',
    because: 'AI models run far faster on it than on the main processor, so what your card can hold decides which models are worth trying.',
    alsoCalled: 'GPU',
  },
  {
    id: 'vram',
    term: 'Graphics memory',
    plain: 'The private memory built into your graphics card, separate from your computer’s main memory.',
    because: 'A model has to fit in here to run quickly. Too big and it either crawls or refuses to start, which is most of what RigMatch is checking for you.',
    alsoCalled: 'VRAM',
  },
  {
    id: 'download-size',
    term: 'Download size',
    plain: 'How much disk space the model file takes, in gigabytes.',
    because: 'Bigger usually means more capable and slower. A 4 GB model is a comfortable place to start.',
  },
  {
    id: 'model-size',
    term: 'Model size (3B, 7B)',
    plain: 'A rough measure of how much the model learned — 3B means three billion things it picked up during training.',
    because: 'Bigger models tend to give better answers but need more memory and more time. The best one for you is the biggest that still runs comfortably.',
    alsoCalled: 'parameters',
  },
  {
    id: 'match-score',
    term: 'Match Score',
    plain: 'RigMatch’s own rating out of 100, from testing the model on this computer.',
    because: 'It blends how good the answers were, how fast they arrived, whether the model kept working, and how well it fits your hardware. Above 80 is a good result.',
  },
  {
    id: 'speed-dating',
    term: 'Speed Dating',
    plain: 'Asking several models the exact same questions, one after another, so their answers can be compared fairly.',
    because: 'Any model looks fine on its own. The difference only shows when they answer the same thing.',
  },
  {
    id: 'top-match',
    term: 'Top Match',
    plain: 'The model that scored highest on your computer for what you said you wanted to do.',
    because: 'It is a match for your machine, not a league table — the same model can win here and lose on a different PC.',
  },
  {
    id: 'judge',
    term: 'The judge',
    plain: 'A second AI model that reads the first one’s answers and marks them.',
    because: 'Some answers — a chat reply, a piece of writing — have no single right answer to check against, so another model has to read them and give an opinion.',
  },
  {
    id: 'terminal',
    term: 'Terminal',
    plain: 'A window where you type commands to your computer instead of clicking.',
    because: 'On Linux, installing Ollama takes one pasted line here. On Windows and Mac, RigMatch can do it without one.',
  },
  {
    id: 'quantization',
    term: 'Compression (Q4, Q8)',
    plain: 'A smaller, squeezed-down copy of the same model.',
    because: 'Q4 is about half the size and noticeably faster, at a small cost in quality. Q8 keeps more of the original. Most people should take the Q4.',
    alsoCalled: 'quantization',
  },
  {
    id: 'tokens-per-second',
    term: 'Words per second',
    plain: 'How quickly the model writes its answer, counted in words per second.',
    because: 'Below about five, replies feel slow enough to be annoying. Above twenty feels immediate.',
    alsoCalled: 'tokens/s',
  },
  {
    id: 'context-window',
    term: 'Memory of the conversation',
    plain: 'How much of your conversation the model can keep in mind at once.',
    because: 'When a chat runs past it, the model starts forgetting the beginning — which is why it can suddenly lose track of something you said earlier.',
    alsoCalled: 'context window',
  },
  {
    id: 'embedding-model',
    term: 'Search model',
    plain: 'A model built for finding related text rather than writing any.',
    because: 'It cannot hold a conversation, so RigMatch keeps it out of comparisons instead of letting it lose one it was never in.',
    alsoCalled: 'embedding model',
  },
];

const BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

/**
 * The rotating tips the Advanced ticker shows, built from the same source so
 * the two cannot drift into disagreeing about what a word means.
 */
export function tickerTips(): Array<{ term: string; tip: string }> {
  return GLOSSARY.map((entry) => ({
    term: entry.alsoCalled ? `${entry.term} (${entry.alsoCalled})` : entry.term,
    tip: entry.because ? `${entry.plain} ${entry.because}` : entry.plain,
  }));
}
