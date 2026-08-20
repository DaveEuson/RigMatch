// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { agentArcadeApi } from '../api';
import { readComfySettings } from '../lib/comfySettings';
import { getComfyStatus } from '../lib/comfyTransport';

/**
 * What ComfyUI has on disk, and the one download that can be in flight to it.
 *
 * ComfyUI is a separate program the user starts themselves, so its state is
 * fetched by looking rather than subscribed to. Two things follow from that,
 * and both are the reason this is a hook rather than three loose useStates:
 *
 *  - checkpoints and text encoders are tracked apart, because a video model
 *    without a T5 encoder cannot render and the two are fixed by fetching two
 *    different files;
 *  - the folder setting is re-read whenever the panel changes, since choosing a
 *    folder in Settings has to reach the Models screen without a restart and
 *    localStorage fires no event for same-document writes.
 *
 * The download ref is private. A generation download is a file stream, not an
 * Ollama pull, so abortPull cannot touch it — without a handle to it the
 * multi-gigabyte fetch carried on writing after Stop while the UI said it had
 * stopped. Handing that ref out to callers is how it gets left set; the three
 * methods below are the only ways to move it.
 */
export function useComfy({ activeNavId }: { activeNavId: string }) {
  // Checkpoints ComfyUI has loaded. Image generation is the one skill that does
  // not run on an Ollama model, so its candidates come from here.
  const [comfyCheckpoints, setComfyCheckpoints] = useState<string[]>([]);
  // Tracked separately: a video model without a T5 encoder cannot render, and
  // the two are fixed by fetching two different files.
  const [comfyTextEncoders, setComfyTextEncoders] = useState<string[]>([]);
  /** The generation download in flight, so Stop can abort the right stream. */
  const activeComfyDownloadRef = useRef<string | null>(null);

  /**
   * The folder and URL, re-read whenever the panel changes.
   *
   * Choosing a folder in Settings has to reach the Models screen without a
   * restart, and localStorage fires no event for same-document writes — hence
   * the re-read. It was state plus an effect that set it, which eslint rightly
   * flags: setting state synchronously in an effect makes every navigation cost
   * a second render pass to arrive at the same values. Reading storage is a
   * pure lookup, so it belongs in the render rather than after it.
   *
   * This is the one deliberate behaviour change in the extraction: 31 effects
   * become 30, and the values are read before paint instead of after, which
   * also removes a frame where a freshly chosen folder still read as unset.
   */
  // activeNavId is a cache key, not an input: the body does not read it, but a
  // change of panel is the moment storage may have been written by the Settings
  // screen. exhaustive-deps has no way to express "recompute when this changes"
  // and reports it as unnecessary, which it is not.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const comfySettings = useMemo(() => readComfySettings(), [activeNavId]);

  // ComfyUI is a separate program the user starts themselves, so this is a
  // look rather than a subscription. It drops its answer if the app closed
  // while the probe was in flight.
  useEffect(() => {
    let live = true;
    void getComfyStatus().then((status) => {
      if (!live) return;
      setComfyCheckpoints(status.checkpoints);
      setComfyTextEncoders(status.textEncoders ?? []);
    });
    return () => { live = false; };
  }, []);

  /**
   * Look again — after a download, or after the user has restarted ComfyUI.
   *
   * Unlike the mount probe this has no cancellation, because it is called from
   * a user action rather than a render; if the window is gone the setState is a
   * no-op React warns about at worst.
   */
  const refreshComfyStatus = useCallback(async () => {
    const status = await getComfyStatus();
    setComfyCheckpoints(status.checkpoints);
    setComfyTextEncoders(status.textEncoders ?? []);
  }, []);

  const beginComfyDownload = useCallback((progressId: string) => {
    activeComfyDownloadRef.current = progressId;
  }, []);

  const endComfyDownload = useCallback(() => {
    activeComfyDownloadRef.current = null;
  }, []);

  /** Stop the file stream, which abortPull cannot reach. No-op when idle. */
  const abortComfyDownload = useCallback(() => {
    if (!activeComfyDownloadRef.current) return;
    void agentArcadeApi.comfyAbortDownload?.(activeComfyDownloadRef.current);
  }, []);

  return {
    comfyCheckpoints,
    comfyTextEncoders,
    comfySettings,
    refreshComfyStatus,
    beginComfyDownload,
    endComfyDownload,
    abortComfyDownload,
  };
}
