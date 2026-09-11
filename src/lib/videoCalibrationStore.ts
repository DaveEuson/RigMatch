// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Where this machine's video calibration is kept between sessions.
 *
 * One reading: the fastest LTX-Video 2B render on this GPU, which every video
 * estimate is scaled by. Under the rigmatch: prefix, so Clear Data takes it
 * with everything else, and the next estimate goes back to saying it is rough.
 */

import type { VideoCalibration } from './videoFit.ts';

export const VIDEO_CALIBRATION_STORAGE_KEY = 'rigmatch:video-calibration:v1';

export function readVideoCalibration(): VideoCalibration | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIDEO_CALIBRATION_STORAGE_KEY) ?? 'null') as Partial<VideoCalibration> | null;
    if (!parsed || typeof parsed.gpu !== 'string' || typeof parsed.seconds !== 'number' || !(parsed.seconds > 0)) return null;
    return { gpu: parsed.gpu, seconds: parsed.seconds };
  } catch {
    return null;
  }
}

export function saveVideoCalibration(calibration: VideoCalibration): void {
  try {
    localStorage.setItem(VIDEO_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
  } catch {
    // Storage unavailable: the estimate stays rough until the next run.
  }
}
