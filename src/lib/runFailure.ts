// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { RunFailure, RunFailureKind } from '../types';

/**
 * Why a model's run failed, in words someone can act on.
 *
 * The show passed the raw error through, so a beginner read "Error: 500
 * Internal Server Error from http://127.0.0.1:11434/api/generate: model runner
 * has unexpectedly stopped". A connection dropped for one answer was blamed on
 * "Make sure Ollama or LM Studio is installed, running…" while Ollama sat
 * there running, and pressing Stop was reported as an error. The raw text still
 * goes to the log; this is what the screen says.
 */
export function describeRunFailure(raw: string, provider = 'Ollama'): { kind: RunFailureKind; reason: string } {
  // IPC wraps a rejection as "Error invoking remote method '…': Error: …".
  const text = String(raw ?? '')
    .replace(/^(?:Error(?: invoking remote method '[^']*')?:\s*)+/i, '')
    .trim();

  if (/stopped by user|canceled by user|cancelled by user/i.test(text)) {
    return { kind: 'stopped', reason: 'You stopped the show.' };
  }
  const within = text.match(/did not finish within (\d+)\s*s/i);
  if (within || /timed out/i.test(text)) {
    const seconds = within ? Number(within[1]) : 0;
    const limit = seconds >= 60 ? `${Math.round(seconds / 60)} minute${Math.round(seconds / 60) === 1 ? '' : 's'}` : 'too long';
    return { kind: 'timeout', reason: `It spent more than ${limit} on a single question.` };
  }
  // Every answer empty: the benchmark refuses to score it (main.cjs), since
  // speed and fit alone ranked a model that said nothing.
  if (/empty answer to every question/i.test(text)) {
    return { kind: 'no-answers', reason: 'It gave an empty answer to every question, so there was nothing to score.' };
  }
  // LM Studio's words for a model ejected (by its user, or its own idle
  // timer) while a show was asking it questions.
  if (/unloaded by user or api request/i.test(text)) {
    return { kind: 'other', reason: `It was unloaded in ${provider} partway through. Run it again, and leave it loaded until the test ends.` };
  }
  // A runner that died, usually on memory: Ollama's words, and LM Studio's.
  if (/runner has unexpectedly stopped|runner process has terminated|out of memory|requires more system memory|CUDA error/i.test(text)) {
    return { kind: 'crashed', reason: `${provider}'s model runner stopped unexpectedly, often because the model ran out of memory.` };
  }
  if (/cannot reach local ai service|ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|other side closed|\bterminated\b/i.test(text)) {
    return { kind: 'unreachable', reason: `The connection to ${provider} was lost.` };
  }
  // Ollama 0.40 on Windows saved some models' records as a symlink, and
  // Windows refuses to follow it: "CreateFile …: The path cannot be traversed
  // because it contains an untrusted mount point". Ollama's own CLI fails the
  // same way, and Ollama lists the model again under a code name that runs.
  if (/untrusted mount point/i.test(text)) {
    return { kind: 'other', reason: `Windows is blocking ${provider} from opening this model's files. Ollama 0.40 saved them behind a link Windows won't follow, so every app fails on this model the same way. A working copy may be in your list under its family and size, such as "Qwen35 9.7B". Ollama 0.35.1 opens the model normally.` };
  }
  // Anything else: the provider's own message, without the plumbing around it.
  const detail = text
    // Up to the colon and space that end the address: a lazy match stopped at
    // the port's colon and left "11434/api/generate:" in front of every message.
    .replace(/^\d{3}\s[^:]*?from\s+https?:\/\/\S+?:\s+/i, '')
    .replace(/https?:\/\/\S+/g, provider)
    .trim();
  return { kind: 'other', reason: detail ? `${provider} reported: ${detail}` : 'Something went wrong while it was answering.' };
}

/** "Gemma4", "Gemma4 and Qwen3", "Gemma4, Qwen3 and Llama3.2". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What to say when some contestants dropped out and the show went on. */
export function droppedOutMessage(failures: RunFailure[], nameOf: (model: string) => string): string {
  if (failures.length === 0) return '';
  const names = joinNames(failures.map((f) => nameOf(f.model)));
  const reasons = [...new Set(failures.map((f) => f.reason))];
  const why = reasons.length === 1 ? ` ${reasons[0]}` : '';
  return `${names} couldn't finish, so the show went on without ${failures.length === 1 ? 'it' : 'them'}.${why}`;
}

/**
 * What to say when nobody finished, and what kind of stop it was — which
 * decides whether running it again can help.
 */
export function showStoppedMessage(
  failures: RunFailure[],
  stopped: boolean,
  nameOf: (model: string) => string,
  providerOf: (model: string) => string = () => 'Ollama',
): { kind: RunFailureKind; message: string } {
  if (stopped) return { kind: 'stopped', message: 'You stopped the show before any model finished.' };
  if (failures.length === 0) return { kind: 'other', message: 'No model finished, so there is nothing to compare.' };
  if (failures.every((f) => f.kind === 'unreachable')) {
    const providers = [...new Set(failures.map((f) => providerOf(f.model)))];
    const lost = joinNames(providers);
    return {
      kind: 'unreachable',
      message: `The connection to ${lost} was lost before any model finished. Check that ${providers.length > 1 ? 'both are' : `${lost} is`} still running, then run the show again.`,
    };
  }
  const first = failures[0];
  return { kind: first.kind, message: `No model finished. ${nameOf(first.model)}: ${first.reason}` };
}
