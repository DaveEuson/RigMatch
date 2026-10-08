// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { SystemProfile } from '../types';

export type GpuDriverProblem = NonNullable<SystemProfile['gpu']['driverProblem']>;

/**
 * What to tell someone whose NVIDIA card nvidia-smi cannot read. Until it is
 * fixed Ollama runs models on the processor, so picks sized for that are
 * honest; what was missing was saying why, and how to get the card back.
 */
export function gpuDriverMessage(problem: GpuDriverProblem): string {
  return problem === 'reboot-required'
    ? 'Your NVIDIA driver was updated, but the old one is still running. Restart your computer so Ollama can use your graphics card. Until then, models run on the processor.'
    : 'RigMatch found an NVIDIA graphics card but can\'t reach its driver, so Ollama will run models on the processor. Install or repair the NVIDIA driver, then restart your computer.';
}

/** The strip's short reading in place of VRAM. */
export function gpuDriverReading(problem: GpuDriverProblem): string {
  return problem === 'reboot-required' ? 'Restart to use it' : 'Driver not working';
}
