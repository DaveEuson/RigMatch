// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import type { ComfyStartState } from '../lib/comfyAutoStart';
import { comfyStartSnapshot, subscribeComfyStart } from '../lib/comfyStarter';

/** Whether RigMatch is starting ComfyUI, or why its last start failed, the same on every screen. */
export function useComfyStart(): ComfyStartState {
  return useSyncExternalStore(subscribeComfyStart, comfyStartSnapshot);
}
