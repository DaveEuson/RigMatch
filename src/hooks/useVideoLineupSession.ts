// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { lineupSessionSnapshot, subscribeLineupSession, type LineupSession } from '../lib/videoLineupSession';

/** The video lineup in flight or last finished, the same on every screen that shows it. */
export function useVideoLineupSession(): LineupSession {
  return useSyncExternalStore(subscribeLineupSession, lineupSessionSnapshot);
}
