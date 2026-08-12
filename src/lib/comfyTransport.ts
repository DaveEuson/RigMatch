/**
 * Adapts the preload bridge to the transport the runners expect.
 *
 * The split is deliberate: the orchestration in imageGenRun.ts and
 * videoGenRun.ts takes a plain object of functions, so their tests drive a
 * fake and never touch Electron. This file is the only place that knows the
 * bridge exists.
 */

import { agentArcadeApi } from '../api.ts';
import { readComfySettings } from './comfySettings.ts';
import type { ComfyTransport } from './imageGenRun.ts';
import type { VideoTransport } from './videoGenRun.ts';
import type { ComfyStatus } from '../types.ts';

/**
 * True when this build can talk to ComfyUI at all.
 *
 * A browser preview and an older preload both lack the bridge. Neither is an
 * error worth showing a stack trace for — the Lab just has to say image
 * generation is unavailable here.
 */
export function comfyBridgeAvailable(): boolean {
  return typeof agentArcadeApi.comfySubmit === 'function'
    && typeof agentArcadeApi.getComfyStatus === 'function';
}

/** Wherever the user pointed RigMatch, defaulting to ComfyUI's own port. */
export function comfyBaseUrl(): string {
  return readComfySettings().baseUrl;
}

export async function getComfyStatus(baseUrl: string = comfyBaseUrl()): Promise<ComfyStatus> {
  if (!agentArcadeApi.getComfyStatus) return { reachable: false, checkpoints: [] };
  try {
    return await agentArcadeApi.getComfyStatus(baseUrl);
  } catch {
    // Not running is the ordinary case, not a fault: ComfyUI is a separate
    // program the user starts themselves.
    return { reachable: false, checkpoints: [] };
  }
}

function requireBridge() {
  const api = agentArcadeApi;
  if (!api.comfySubmit || !api.comfyHistory || !api.comfyImage || !api.comfyInterrupt) {
    throw new Error('This build cannot reach ComfyUI.');
  }
  return api;
}

/**
 * Fetch any file ComfyUI wrote, as a data URL.
 *
 * Shares the bridge call the image path uses — it is content-type agnostic and
 * already carries the size cap and the localhost guard, so a video needs no
 * second channel. Only called when a video is actually played, because a few
 * seconds of Full HD is megabytes and nothing should pay that on every render.
 */
export async function fetchComfyOutput(
  ref: { filename: string; subfolder: string; type: string },
  baseUrl: string = comfyBaseUrl(),
): Promise<string> {
  return requireBridge().comfyImage!(baseUrl, ref);
}

export function createComfyTransport(baseUrl: string = comfyBaseUrl()): ComfyTransport {
  const api = requireBridge();
  return {
    submit: (graph) => api.comfySubmit!(baseUrl, graph, 'rigmatch'),
    history: (promptId) => api.comfyHistory!(baseUrl, promptId),
    image: (ref) => api.comfyImage!(baseUrl, ref),
    interrupt: (promptId) => api.comfyInterrupt!(baseUrl, promptId),
  };
}

/**
 * The video transport, which additionally needs to be able to free.
 *
 * Free resolves harmlessly when the bridge does not offer it — an older
 * preload should mean "cannot unload", not "cannot render video".
 */
export function createVideoTransport(baseUrl: string = comfyBaseUrl()): VideoTransport {
  const api = requireBridge();
  return {
    ...createComfyTransport(baseUrl),
    free: () => (api.comfyFree ? api.comfyFree(baseUrl) : Promise.resolve()),
  };
}
