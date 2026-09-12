// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What a checkpoint in ComfyUI's checkpoints folder makes.
 *
 * Picture, video and audio models share that folder, and ComfyUI lists them
 * together. A video checkpoint handed to the still-image graph fails deep in the
 * sampler, and an audio one does too, so every place that offers "a checkpoint
 * that can draw" asks here rather than excluding video alone.
 */

import { isVideoCheckpoint } from './videoGen.ts';

/**
 * ACE-Step and Stable Audio, and the other audio families: they make sound.
 * "ace" must start a word, or "surface_steps" would be a music model.
 */
export function isAudioCheckpoint(name: string): boolean {
  return /(^|[^a-z])ace[_-]?step|stable[-_]?audio|audioldm|musicgen/i.test(name || '');
}

/** A checkpoint the still-image graph can draw with. */
export function isPictureCheckpoint(name: string): boolean {
  return !isVideoCheckpoint(name) && !isAudioCheckpoint(name);
}
