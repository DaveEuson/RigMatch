/**
 * Adapts the preload bridge to the transport `runImageGeneration` expects.
 *
 * The split is deliberate: the orchestration in imageGenRun.ts takes a plain
 * object of four functions, so its tests drive a fake and never touch Electron.
 * This file is the only place that knows the bridge exists.
 */

import { agentArcadeApi } from '../api.ts';
import { COMFY_DEFAULT_URL } from './comfyui.ts';
import type { ComfyTransport } from './imageGenRun.ts';
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

export async function getComfyStatus(baseUrl: string = COMFY_DEFAULT_URL): Promise<ComfyStatus> {
  if (!agentArcadeApi.getComfyStatus) return { reachable: false, checkpoints: [] };
  try {
    return await agentArcadeApi.getComfyStatus(baseUrl);
  } catch {
    // Not running is the ordinary case, not a fault: ComfyUI is a separate
    // program the user starts themselves.
    return { reachable: false, checkpoints: [] };
  }
}

export function createComfyTransport(baseUrl: string = COMFY_DEFAULT_URL): ComfyTransport {
  const api = agentArcadeApi;
  if (!api.comfySubmit || !api.comfyHistory || !api.comfyImage || !api.comfyInterrupt) {
    throw new Error('This build cannot reach ComfyUI.');
  }
  return {
    submit: (graph) => api.comfySubmit!(baseUrl, graph, 'rigmatch'),
    history: (promptId) => api.comfyHistory!(baseUrl, promptId),
    image: (ref) => api.comfyImage!(baseUrl, ref),
    interrupt: (promptId) => api.comfyInterrupt!(baseUrl, promptId),
  };
}
