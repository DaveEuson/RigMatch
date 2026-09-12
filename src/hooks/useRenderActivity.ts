// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useMemo, useSyncExternalStore } from 'react';
import { stopAudioLineup } from '../lib/audioLineupSession';
import { stopImageLineup } from '../lib/imageLineupSession';
import {
  imageTestOutcomeSnapshot,
  imageTestSnapshot,
  lastRenderOutcome,
  renderActivityFrom,
  subscribeImageTest,
  type ImageTestActivity,
  type RenderActivity,
  type RenderOutcome,
} from '../lib/renderActivity';
import { stopVideoLineup } from '../lib/videoLineupSession';
import { useAudioLineupSession } from './useAudioLineupSession';
import { useImageLineupSession } from './useImageLineupSession';
import { useVideoLineupSession } from './useVideoLineupSession';

const STOPS = { video: stopVideoLineup, image: stopImageLineup, audio: stopAudioLineup };

/** A picture being drawn from a model's row, the same on every screen. */
export function useImageTest(): ImageTestActivity | null {
  return useSyncExternalStore(subscribeImageTest, imageTestSnapshot);
}

/** Whatever ComfyUI is rendering for RigMatch now, wherever it was started. */
export function useRenderActivity(): RenderActivity | null {
  const video = useVideoLineupSession();
  const image = useImageLineupSession();
  const audio = useAudioLineupSession();
  const imageTest = useImageTest();
  return useMemo(
    () => renderActivityFrom({ video, image, audio, imageTest }, STOPS),
    [video, image, audio, imageTest],
  );
}

/** How the last render ended, whichever path it took, until another one ends. */
export function useRenderOutcome(): RenderOutcome | null {
  const video = useVideoLineupSession();
  const image = useImageLineupSession();
  const audio = useAudioLineupSession();
  const imageTestOutcome = useSyncExternalStore(subscribeImageTest, imageTestOutcomeSnapshot);
  return useMemo(
    () => lastRenderOutcome({ video, image, audio, imageTestOutcome }),
    [video, image, audio, imageTestOutcome],
  );
}
