// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { SystemProfile } from '../types';
import { APP_VERSION, GITHUB_ISSUES_URL } from './appConfig.ts';

export type FeedbackContext = {
  /** The Top Match the person just saw, so the note says what they are talking about. */
  model?: string;
  scoreLabel?: string;
  grade?: string;
  ollamaVersion?: string | null;
};

/**
 * A GitHub issue form, filled in with a few questions and the person's setup.
 *
 * It opens GitHub in their browser and nothing goes anywhere until they press
 * Submit there, so "no telemetry" holds. Their setup is one line at the bottom
 * that they can delete. It carries no log path, no host name and no scores
 * beyond the Top Match they had just been shown.
 */
export function buildFeedbackUrl(system: SystemProfile, context: FeedbackContext = {}): string {
  const setup = [
    `RigMatch v${APP_VERSION}`,
    `${system.os.distro} ${system.os.release} (${system.platform} ${system.arch})`,
    `GPU: ${system.gpu.model || 'not identified'}${system.gpu.vramGb ? ` · ${Math.round(system.gpu.vramGb)} GB VRAM` : ''}`,
    `RAM: ${Math.round(system.memory.totalGb)} GB`,
    ...(context.ollamaVersion ? [`Ollama v${context.ollamaVersion}`] : []),
  ].join(' · ');

  const shown = context.model
    ? `RigMatch crowned **${context.model}**${context.scoreLabel ? ` (${context.scoreLabel}${context.grade ? `, grade ${context.grade}` : ''})` : ''}. `
    : '';

  const body = [
    '**How did it go?**',
    `${shown}[Did you get a model you will use? Did the result match what you expected?]`,
    '',
    '**What was confusing, slow or missing?**',
    '[Anything at all. Small things count.]',
    '',
    '**What would you do with it next?**',
    '[Chat with it, code with it, compare more models, nothing yet...]',
    '',
    '---',
    `<sub>${setup}. Delete this line if you would rather not share your setup.</sub>`,
  ].join('\n');

  const params = new URLSearchParams({
    labels: 'feedback',
    title: `Feedback [v${APP_VERSION}]`,
    body,
  });
  return `${GITHUB_ISSUES_URL}?${params.toString()}`;
}
