// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Start ComfyUI when a test needs it, instead of sending someone off to find a .bat file.
 *
 * The Start button already knew how: the launcher sits beside the models folder
 * the user verified, and the main process runs only a launcher it finds there.
 * What nothing did was notice. ComfyUI had to be started by hand, outside
 * RigMatch, before every image or video session.
 *
 * Four rules keep starting a program on someone's behalf from becoming a nuisance:
 *
 *  - Started is not ready. Loading torch and its nodes takes seconds to
 *    minutes, so a start is watched until ComfyUI answers, and only then does
 *    anything say it is running.
 *  - One start at a time. Every screen that wants ComfyUI shares the start in
 *    flight, rather than launching a second copy that dies on a taken port.
 *  - Once a session on its own. Choosing the Images channel starts it; if the
 *    person then closes it, switching channels again does not fight them. A
 *    click on Test or Start always may.
 *  - A start that failed is not retried unasked. A broken install relaunched on
 *    every screen change is a console window that keeps flashing up; Start
 *    tries again.
 *
 * Pure apart from what it is handed, so these rules are tested without Electron.
 * comfyStarter.ts wires it to the bridge.
 */

export type ComfyLauncher = { path: string; label: string; file: string };

/**
 * Why a start was wanted. `auto`: a screen that runs on ComfyUI opened.
 * `test`: someone asked to test a ComfyUI model. `button`: someone pressed Start.
 */
export type ComfyStartTrigger = 'auto' | 'test' | 'button';

export type ComfyStartState =
  | { phase: 'idle' }
  | { phase: 'starting'; since: number; launcher: string }
  | { phase: 'failed'; message: string };

export type ComfyStartSkip =
  | 'setting-off'
  | 'already-started'
  | 'failed-before'
  | 'no-folder'
  | 'no-launcher'
  | 'no-bridge';

export type ComfyStartResult =
  | { outcome: 'running' }
  | { outcome: 'skipped'; reason: ComfyStartSkip }
  | { outcome: 'failed'; message: string };

export type ComfyStarterDeps = {
  /** Whether ComfyUI answers at the address RigMatch uses. */
  isRunning: () => Promise<boolean>;
  /** That address, for a message that has to say where nothing answered. */
  address: () => string;
  /** The verified models folder; empty when none was chosen. */
  folder: () => string;
  /** Whether RigMatch may start ComfyUI without a click on Start. */
  allowed: () => boolean;
  findLaunchers: ((folder: string) => Promise<ComfyLauncher[]>) | null;
  launch: ((folder: string, launcherPath: string) => Promise<unknown>) | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/** Long enough for ComfyUI to load its custom nodes from a slow disk. */
export const COMFY_START_TIMEOUT_MS = 180_000;
export const COMFY_START_POLL_MS = 2_000;

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export function createComfyStarter(
  deps: ComfyStarterDeps,
  { timeoutMs = COMFY_START_TIMEOUT_MS, pollMs = COMFY_START_POLL_MS }: { timeoutMs?: number; pollMs?: number } = {},
) {
  const sleep = deps.sleep ?? wait;
  const now = deps.now ?? Date.now;
  let state: ComfyStartState = { phase: 'idle' };
  const listeners = new Set<() => void>();
  const startedListeners = new Set<() => void>();
  let inFlight: Promise<ComfyStartResult> | null = null;
  /** An automatic start has launched ComfyUI once this session. */
  let autoLaunched = false;
  /** The last start never answered, so only a click on Start tries again. */
  let failedBefore = false;

  const set = (next: ComfyStartState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const answering = () => deps.isRunning().catch(() => false);

  const fail = (message: string): ComfyStartResult => {
    failedBefore = true;
    set({ phase: 'failed', message });
    return { outcome: 'failed', message };
  };

  const skip = (reason: ComfyStartSkip): ComfyStartResult => ({ outcome: 'skipped', reason });

  async function run(trigger: ComfyStartTrigger): Promise<ComfyStartResult> {
    if (await answering()) {
      // Started some other way since a start failed: the failure is history.
      failedBefore = false;
      if (state.phase === 'failed') set({ phase: 'idle' });
      return { outcome: 'running' };
    }
    if (trigger !== 'button') {
      if (!deps.allowed()) return skip('setting-off');
      if (failedBefore) return skip('failed-before');
      if (trigger === 'auto' && autoLaunched) return skip('already-started');
    }
    if (!deps.findLaunchers || !deps.launch) return skip('no-bridge');
    const folder = deps.folder();
    if (!folder) return skip('no-folder');
    const launchers = await deps.findLaunchers(folder).catch((): ComfyLauncher[] => []);
    const launcher = launchers[0];
    if (!launcher) return skip('no-launcher');

    if (trigger === 'auto') autoLaunched = true;
    const since = now();
    set({ phase: 'starting', since, launcher: launcher.file });
    try {
      await deps.launch(folder, launcher.path);
    } catch (error) {
      return fail(error instanceof Error && error.message ? error.message : `${launcher.file} could not be started.`);
    }

    while (now() - since < timeoutMs) {
      await sleep(pollMs);
      if (await answering()) {
        failedBefore = false;
        set({ phase: 'idle' });
        for (const listener of startedListeners) listener();
        return { outcome: 'running' };
      }
    }
    return fail(
      `ComfyUI was started with ${launcher.file} but did not answer at ${deps.address()} within `
      + `${Math.round(timeoutMs / 60_000)} minutes. Its own window says why. If it runs on another port, `
      + 'set the address in Settings.',
    );
  }

  return {
    /** Start ComfyUI unless it already answers, may not be started, or cannot be. Never throws. */
    ensure(trigger: ComfyStartTrigger): Promise<ComfyStartResult> {
      if (!inFlight) {
        inFlight = run(trigger)
          .catch((error: unknown) => fail(error instanceof Error ? error.message : 'ComfyUI could not be started.'))
          .finally(() => { inFlight = null; });
      }
      return inFlight;
    },
    snapshot: (): ComfyStartState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Called each time a start RigMatch made is answered, so every screen can look again at once. */
    onStarted(listener: () => void): () => void {
      startedListeners.add(listener);
      return () => { startedListeners.delete(listener); };
    },
  };
}
