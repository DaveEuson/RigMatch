import type { BenchmarkPromptResult } from '../types';

/**
 * Why an answer looks wrong when the model did not actually fail.
 *
 * An empty or clipped answer reads as the model being bad at the question,
 * when the real cause is Ollama stopping for its own reasons — the output
 * limit, most often. Saying which turns "this model is useless" into "this
 * answer was cut off", and those deserve different conclusions.
 *
 * Pure, and shared by more than one panel, so it lives here rather than inside
 * whichever component happened to need it first.
 */
export function getPromptDiagnosticText(prompt: BenchmarkPromptResult): string {
  if (prompt.diagnostic) return prompt.diagnostic;
  if (prompt.status === 'no-response' && /length/i.test(prompt.doneReason || '')) {
    return 'No visible answer; Ollama hit the output limit before returning text.';
  }
  if (prompt.status === 'truncated') {
    return `Answer may be incomplete; Ollama finished with ${prompt.doneReason || 'unknown reason'}.`;
  }
  return '';
}
