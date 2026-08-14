/**
 * Pure formatting and score-presentation helpers shared across the UI.
 * Extracted from App.tsx; keep this module free of React and app state.
 */

/** CSS tone class for a 0-100 Match total. */
export function getScoreTone(total: number) {
  if (total >= 90) return 'elite';
  if (total >= 80) return 'good';
  if (total >= 70) return 'ok';
  return 'low';
}

/** Letter grade for a 0-100 score. */
export function gradeFor(score: number) {
  if (score >= 95) return 'S';
  if (score >= 88) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 72) return 'B';
  if (score >= 64) return 'C';
  return 'D';
}

export function topPickLabel(grade: string | undefined): string {
  if (!grade) return 'Best Tested';
  if (grade.startsWith('S') || grade.startsWith('A')) return 'Top Match';
  if (grade.startsWith('B')) return 'Strong Contender';
  if (grade.startsWith('C')) return 'Best So Far';
  return 'Best Tested';
}

/** Hover/aria explanation for a score label shown on tiles and detail panels. */
export function getScoreTooltip(label: string) {
  const key = label.toLowerCase();
  if (key.includes('sobriety') || key.includes('reliability') || key.includes('quality')) {
    return 'How well the model follows prompts — instruction discipline, completeness, and avoiding hallucinations.';
  }

  if (key.includes('speed')) {
    return 'How quickly this model responds on the selected computer, including throughput and latency.';
  }

  if (key.includes('compatibility') || key.includes('match')) {
    return 'Overall Match score: 34% answer quality, 32% speed, 18% finish rate, 16% computer fit.';
  }

  return 'Score from the latest model test.';
}

/** Rough human wait-time estimate from a 0-100 speed score. */
export function getResponseEstimate(speedScore: number): string {
  if (speedScore >= 90) return '~1s';
  if (speedScore >= 75) return '~3s';
  if (speedScore >= 55) return '~8s';
  if (speedScore >= 35) return '~20s';
  return '30s+';
}

/**
 * Rough tokens-per-second estimate from a 0-100 speed score.
 *
 * Only correct as a lower bound at the top of the range. The speed sub-score
 * maps 100 tok/s to 100 and clamps there, so every model at or above 100 tok/s
 * scores 90+ and this returns "20+ tok/s" for all of them -- a 4070 running a 3B
 * model measures ~365 tok/s and still lands in that bucket.
 *
 * Prefer `formatThroughput`, which uses the measured rate when one was saved.
 * This remains only for scores recorded before throughput was persisted.
 */
export function scoreToToks(speed: number): string {
  if (speed >= 90) return '20+ tok/s';
  if (speed >= 75) return '~10 tok/s';
  if (speed >= 55) return '~5 tok/s';
  if (speed >= 35) return '~2 tok/s';
  return '<2 tok/s';
}

/**
 * Generation speed for display. Uses the rate actually measured during the run
 * when it was saved, and only falls back to inferring one from the saturated
 * sub-score for older scores that predate the persisted field.
 */
export function formatThroughput(score: { speed: number; tokensPerSecond?: number }): string {
  const value = formatThroughputValue(score.tokensPerSecond);
  return value === null ? scoreToToks(score.speed) : `${value} tok/s`;
}

/**
 * The bare number for a measured throughput, without the unit -- for places that
 * supply their own label, such as the share card's stat chips. Returns null when
 * there is no usable measurement, so callers can choose their own fallback.
 *
 * Shared with `formatThroughput` so the rounding rule exists in exactly one place.
 */
export function formatThroughputValue(measured: number | undefined): string | null {
  if (typeof measured !== 'number' || !Number.isFinite(measured) || measured <= 0) return null;
  // Below ~20 tok/s the reader is waiting on the text, so a tenth is meaningful
  // (10.7 vs 10.0 is a real difference). Above it the decimal is run-to-run noise.
  return String(measured >= 20 ? Math.round(measured) : Math.round(measured * 10) / 10);
}

/** Log-scale 0-100 meter fill for Ollama library pull counts. */
export function getPopularityPercent(pulls: number | null | undefined): number {
  if (pulls == null || !Number.isFinite(pulls) || pulls <= 0) return 0;
  return Math.max(8, Math.min(100, Math.round((Math.log10(pulls + 1) / 7) * 100)));
}

export function formatPullCount(n: number | null | undefined): string {
  if (n == null) return '';
  if (n >= 1_000_000_000) return `${+(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatBytes(value?: number | null) {
  if (!Number.isFinite(value) || value === null || value === undefined || value < 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let normalized = value;
  let unitIndex = 0;

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024;
    unitIndex += 1;
  }

  const precision = normalized >= 100 || unitIndex === 0 ? 0 : normalized >= 10 ? 1 : 2;
  return `${normalized.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatBytesPerSecond(value?: number | null) {
  if (!Number.isFinite(value) || !value || value <= 0) return '-- MB/s';
  return `${formatBytes(value)}/s`;
}

export function formatGb(value: number) {
  if (!Number.isFinite(value)) return '? GB';
  return `${Math.round(value * 10) / 10} GB`;
}

export function formatMs(value: number) {
  if (!Number.isFinite(value)) return '? ms';
  if (value >= 1000) return `${Math.round((value / 1000) * 10) / 10}s`;
  return `${Math.round(value)} ms`;
}

export function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Strip Electron IPC wrapper noise from error messages before display. */
export function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return describeRunError(message.replace(/^Error invoking remote method '[^']+':\s*/i, ''));
}

/**
 * Turn common raw failures into plain-language guidance instead of a
 * stack-trace wall. Falls through to the original message.
 *
 * Every rule here earns its place by being something a user actually saw: a
 * disk-full pull surfaced Ollama's own `no space left on device` complete with
 * a blob path, and a ComfyUI that died between the status probe and the run
 * showed the raw Electron IPC wrapper. The original text is appended where it
 * might still help someone diagnosing, but it never leads.
 */
export function describeRunError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('mlx')) {
    return 'This looks like an Apple Silicon (macOS) model — it runs on Apple\'s MLX framework, which Ollama can\'t load on Windows or Linux. Image models like x/flux2 are macOS-only for now.';
  }

  // Disk full, from Ollama's own writer or the OS.
  if (lower.includes('no space left') || lower.includes('enospc') || lower.includes('not enough space')) {
    return 'Your disk ran out of space partway through. Free some room — the Closet in Settings shows which models are taking the most — then start the download again. Partly-downloaded files are cleaned up automatically.';
  }

  // A tag that does not exist upstream, usually a typo or a renamed model.
  if (lower.includes('file does not exist') || /\b404\b/.test(lower) || lower.includes('model not found') || lower.includes('pull model manifest')) {
    return 'That model name was not found in the library. Check the spelling, or pick it from the Models list so the exact tag comes from there.';
  }

  // Nothing listening: the provider went away, or was never running.
  if (lower.includes('econnrefused') || lower.includes('connection refused') || lower.includes('fetch failed')
      || lower.includes('socket hang up') || lower.includes('econnreset')) {
    return 'Nothing answered on that address. The program serving it — Ollama, LM Studio, or ComfyUI — is probably not running any more. Start it and try again.';
  }

  // Permission problems, most often an installer or a protected folder.
  if (lower.includes('eperm') || lower.includes('eacces') || lower.includes('permission denied')) {
    return 'Windows refused permission for that file. It is usually a folder that needs administrator rights, or an antivirus holding the file open. Try a different folder, or run the installer yourself.';
  }

  if (lower.includes('etimedout') || lower.includes('timeout')) {
    return 'That took too long and was given up on. A slow or interrupted connection is the usual cause — trying again normally works.';
  }

  return message;
}

export function compareVersionStrings(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
