// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { audioLineupSnapshot, subscribeAudioLineup, type AudioLineupSession } from '../lib/audioLineupSession';

/** Audio being made, or last made, the same on every screen that shows it. */
export function useAudioLineupSession(): AudioLineupSession {
  return useSyncExternalStore(subscribeAudioLineup, audioLineupSnapshot);
}
