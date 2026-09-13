// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The one ComfyUI starter every screen shares, wired to the Electron bridge.
 *
 * Kept apart from comfyAutoStart.ts so the rules there are tested without
 * `window`, which importing the bridge would drag in.
 */

import { agentArcadeApi } from '../api.ts';
import { readComfySettings } from './comfySettings.ts';
import { getComfyStatus } from './comfyTransport.ts';
import { createComfyStarter } from './comfyAutoStart.ts';

const { comfyFindLaunchers, comfyLaunch } = agentArcadeApi;

const starter = createComfyStarter({
  isRunning: async () => (await getComfyStatus()).reachable === true,
  address: () => readComfySettings().baseUrl,
  folder: () => readComfySettings().folder,
  allowed: () => readComfySettings().autoStart,
  findLaunchers: comfyFindLaunchers
    ? async (folder) => (await comfyFindLaunchers(folder))?.launchers ?? []
    : null,
  // The main process checks the path against the launchers it finds beside the
  // folder, so this can only ever run one of those.
  launch: comfyLaunch ? (folder, launcherPath) => comfyLaunch(folder, launcherPath) : null,
});

export const ensureComfyRunning = starter.ensure;
export const comfyStartSnapshot = starter.snapshot;
export const subscribeComfyStart = starter.subscribe;
export const onComfyStarted = starter.onStarted;
