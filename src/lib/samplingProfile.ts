// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * How many steps, and how hard to steer, for the checkpoint in hand.
 *
 * RigMatch asked every image model for 20 steps at CFG 7 — the sensible
 * default for an ordinary Stable Diffusion checkpoint, and actively wrong for
 * a distilled one. SDXL-Turbo is trained by adversarial diffusion distillation
 * to produce a finished image in one to four steps with guidance switched off;
 * push CFG to 7 and it oversaturates and posterises, which is exactly what came
 * back the first time someone asked for a fox in a forest. The model was fine.
 * The request was not.
 *
 * The family is read from the filename because it is the only thing available:
 * ComfyUI reports the checkpoints it can load, not what they are. That makes
 * this a heuristic, and it is written to fail safe — anything unrecognised
 * gets the ordinary settings that have always been used, so a new checkpoint
 * behaves no worse than it did before.
 */

export type SamplingProfile = {
  steps: number;
  cfg: number;
  /** Why these numbers, in words a person can check against their own model. */
  reason: string;
};

/** The ordinary Stable Diffusion settings, and the fallback for anything unknown. */
export const STANDARD_PROFILE: SamplingProfile = {
  steps: 20,
  cfg: 7,
  reason: 'Standard diffusion settings.',
};

/**
 * Distilled families and what they actually want.
 *
 * Matched longest-first so `sdxl-turbo-lightning` cannot be claimed by the
 * shorter of two matching names, and matched on the bare filename so a folder
 * called `turbo-models` does not decide this for every checkpoint inside it.
 */
const DISTILLED: Array<{ match: string; profile: SamplingProfile }> = [
  {
    match: 'lightning',
    profile: { steps: 4, cfg: 1, reason: 'SDXL-Lightning is distilled for 4 steps with guidance off.' },
  },
  {
    match: 'hyper',
    profile: { steps: 4, cfg: 1, reason: 'Hyper-SD is distilled for a handful of steps with guidance off.' },
  },
  {
    match: 'turbo',
    profile: { steps: 4, cfg: 1, reason: 'Turbo checkpoints are distilled for 1–4 steps with guidance off.' },
  },
  {
    match: 'lcm',
    profile: { steps: 6, cfg: 2, reason: 'LCM checkpoints want few steps and very low guidance.' },
  },
];

/**
 * Strip directories and the extension, so matching sees only the model's name.
 */
function bareName(checkpoint: string): string {
  const last = checkpoint.split(/[\\/]/).pop() ?? checkpoint;
  return last.replace(/\.(safetensors|ckpt|sft|pt|bin)$/i, '').toLowerCase();
}

export function samplingProfileFor(checkpoint: string): SamplingProfile {
  const name = bareName(checkpoint ?? '');
  if (!name) return STANDARD_PROFILE;

  const hit = DISTILLED
    .filter((entry) => name.includes(entry.match))
    .sort((a, b) => b.match.length - a.match.length)[0];

  return hit ? hit.profile : STANDARD_PROFILE;
}

/**
 * True when the checkpoint is one of the distilled families.
 *
 * Kept separate from the profile because callers that compare models need to
 * know that two runs were measured under different settings — a four-step
 * render and a twenty-step render are not the same unit of work, and speed
 * scored per step flatters the slower one.
 */
export function isDistilledCheckpoint(checkpoint: string): boolean {
  return samplingProfileFor(checkpoint) !== STANDARD_PROFILE;
}
