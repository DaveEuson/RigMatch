// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/** How full a reading is: green below 70%, gold from 70, red from 90. */
export function loadLevel(percent: number): 'ok' | 'busy' | 'full' {
  if (percent >= 90) return 'full';
  if (percent >= 70) return 'busy';
  return 'ok';
}

/** Free disk turns red below 20 GB: a model download would not fit. */
export const LOW_DISK_GB = 20;
