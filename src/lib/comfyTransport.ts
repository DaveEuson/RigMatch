// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Adapts the preload bridge to the transport the runners expect.
 *
 * The split is deliberate: the orchestration in imageGenRun.ts and
 * videoGenRun.ts takes a plain object of functions, so their tests drive a
 * fake and never touch Electron. This file is the only place that knows the
 * bridge exists.
 */

import { agentArcadeApi } from '../api.ts';
import { readComfySettings, writeComfySettings } from './comfySettings.ts';
import { comfyBusyCount } from './videoGen.ts';
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

/**
 * Is ComfyUI free to be measured on?
 *
 * Returns the queue depth. Anything above zero means something else is in
 * flight, which on a shared instance is the normal state rather than an error.
 */
export async function comfyQueueDepth(baseUrl: string = comfyBaseUrl()): Promise<number> {
  if (!agentArcadeApi.getComfyStatus) return 0;
  try {
    const status = await agentArcadeApi.getComfyStatus(baseUrl);
    return comfyBusyCount(status.execInfo ?? null);
  } catch {
    // Unreadable queue counts as idle: failing to ask must not block a run.
    return 0;
  }
}

/**
 * Why a benchmark should not start right now, or null when it may.
 *
 * Sharing a GPU with a render already in flight does not fail — it queues,
 * then both jobs fight for the card, and the time that produces describes
 * neither. A wrong number that looks like a measurement is worse than a
 * refusal, and on a shared ComfyUI this is the normal state rather than an
 * error.
 */
export async function describeComfyBusy(baseUrl: string = comfyBaseUrl()): Promise<string | null> {
  const depth = await comfyQueueDepth(baseUrl);
  if (depth <= 0) return null;
  return `ComfyUI is already working on ${depth} job${depth === 1 ? '' : 's'}. `
    + 'Timing a run alongside it would measure the queue rather than this computer — '
    + 'wait for it to finish, then try again.';
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

/**
 * Ask for the ComfyUI folder, then prove it is the right one.
 *
 * Proving matters: two ComfyUI installs is an ordinary setup, and picking the
 * one that is not running would write gigabytes where the live server never
 * looks and then report success. The check compares the checkpoints on disk
 * with the checkpoints the running server lists.
 */
export async function pickAndVerifyComfyFolder(baseUrl: string = comfyBaseUrl()): Promise<
  { canceled: true } | { canceled: false; ok: boolean; root?: string; reason?: string; warning?: string | null }
> {
  const api = agentArcadeApi;
  if (!api.comfyPickFolder || !api.comfyVerifyFolder) {
    return { canceled: false, ok: false, reason: 'This build cannot open a folder picker.' };
  }
  const picked = await api.comfyPickFolder();
  if (picked.canceled || !picked.folder) return { canceled: true };

  // Asked fresh rather than reused: the listing is what the folder is checked
  // against, and a stale one would compare against the wrong install.
  const status = await getComfyStatus(baseUrl);
  const verdict = await api.comfyVerifyFolder(picked.folder, status.checkpoints ?? []);
  return { canceled: false, ...verdict };
}

/**
 * Work out where ComfyUI keeps its models, by asking the copy that is running.
 *
 * Lives here rather than in the settings panel because two surfaces need it and
 * only one had it. Settings had the working flow; Simple Mode, which is where a
 * beginner picks "making images" and is then refused, had no way to reach it —
 * the refusal told them to open a Settings page that Simple Mode does not have.
 *
 * The folder is never taken on trust. It is checked against the checkpoints the
 * running ComfyUI actually lists, because two installs on one machine is normal
 * and a multi-gigabyte download landing in the unused one is not. Callers get a
 * reason rather than a message, so each can say it in its own voice — Settings can
 * offer a folder picker as the fallback, and Simple Mode, which has none, cannot.
 */
export type ComfyLocateOutcome =
  | { found: true; folder: string }
  | { found: false; reason: 'not-running' | 'cannot-tell' | 'no-bridge' };

/**
 * The two calls this makes, injectable so the branching can be tested.
 *
 * Same seam the runners use: the orchestration takes a plain object of
 * functions and the tests drive a fake, rather than reaching for Electron. The
 * branch that matters is "running but unrecognisable" versus "not running",
 * because they give opposite advice and only one of them is the user's fault.
 */
export type ComfyLocateDeps = {
  status: (baseUrl: string) => Promise<ComfyStatus>;
  locate: ((baseUrl: string, checkpoints: string[]) =>
    Promise<{ found: boolean; folder?: string } | undefined>) | undefined;
  remember: (folder: string) => void;
};

export async function locateComfyFolder(
  baseUrl: string = comfyBaseUrl(),
  deps: ComfyLocateDeps = {
    status: getComfyStatus,
    locate: agentArcadeApi.comfyLocateFolder,
    remember: (folder) => writeComfySettings({ folder }),
  },
): Promise<ComfyLocateOutcome> {
  if (!deps.locate) return { found: false, reason: 'no-bridge' };

  const status = await deps.status(baseUrl);
  const result = await deps.locate(baseUrl, status.checkpoints ?? []);
  if (result?.found && result.folder) {
    // Saved here, not by the caller. Both callers want it kept, and one of them
    // is a notice with a single button — the kind of place a follow-up write is
    // easy to leave out and impossible to notice missing until a download lands
    // nowhere.
    deps.remember(result.folder);
    return { found: true, folder: result.folder };
  }

  // Not running and running-but-unrecognisable need different advice: one is
  // "start it first", the other is "pick the folder yourself".
  return { found: false, reason: status.reachable ? 'cannot-tell' : 'not-running' };
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
