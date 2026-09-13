// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useSyncExternalStore } from 'react';
import { imageLineupSnapshot, subscribeImageLineup, type ImageLineupSession } from '../lib/imageLineupSession';

/** The picture comparison in flight or last finished, the same on every screen that shows it. */
export function useImageLineupSession(): ImageLineupSession {
  return useSyncExternalStore(subscribeImageLineup, imageLineupSnapshot);
}
