// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Where a model's turn ends, when its template did not tell it.
 *
 * Ollama wraps a conversation in each model's chat template and stops at the
 * template's end-of-turn token. A model whose template is bare, as
 * deepseek-ocr's is (`{{ .Prompt }}`, made for "turn this page into text"),
 * has neither: it writes the marker out as ordinary text and carries on into a
 * turn of its own. Dave saw
 *
 *   "How can I assist you today?<|im_end|>
 *    <|im_start|>system
 *    You are currently powered by the local Ollama model…"
 *
 * which is RigMatch's own instructions read back as the reply. Everything from
 * the first marker on is not the model's answer, so it is cut there and the
 * generation is stopped.
 */

export const TURN_MARKERS = [
  '<|im_end|>',
  '<|im_start|>',
  '<|endoftext|>',
  '<|end_of_text|>',
  '<|eot_id|>',
  '<|start_header_id|>',
  '<|end|>',
  '<end_of_turn>',
  '<start_of_turn>',
] as const;

/** The text before the first marker, and whether one was there. */
export function cutAtTurnMarker(text: string): { text: string; ended: boolean } {
  let cut = -1;
  for (const marker of TURN_MARKERS) {
    const at = text.indexOf(marker);
    if (at !== -1 && (cut === -1 || at < cut)) cut = at;
  }
  return cut === -1 ? { text, ended: false } : { text: text.slice(0, cut).trimEnd(), ended: true };
}

/**
 * How much of a streamed reply is safe to show yet: all of it, minus any tail
 * that could be the start of a marker still arriving ("<|im_" may become
 * "<|im_end|>" with the next token).
 */
export function safeToShow(text: string): number {
  for (let length = Math.min(text.length, 20); length > 0; length -= 1) {
    const tail = text.slice(-length);
    if (TURN_MARKERS.some((marker) => marker.startsWith(tail))) return text.length - length;
  }
  return text.length;
}
