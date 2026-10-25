// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The speed test in progress and the results so far, held outside React.
 *
 * A run takes a minute or more a tier, and someone will look at another tab
 * meanwhile. Held in the screen, the result of a run would land on a screen
 * that had already gone and be lost; held here, the screen picks it back up
 * when it opens again. App.tsx needs no state for it.
 */
import { getErrorMessage } from './format.ts';
import type { RigTier, RigTierId } from './rigScore.ts';
import { addRigResult, readRigHistory, saveRigHistory } from './rigScoreHistory.ts';
import {
  assembleTierResult,
  rigRunRequest,
  type RigOutcome,
  type RigProgress,
  type RigResult,
  type RigRunReply,
  type RigRunRequest,
} from './rigScoreRun.ts';

/** The calls the session needs, from agentArcadeApi (or a fake in a test). */
export type RigScoreBridge = {
  runRigScore?: (request: RigRunRequest) => Promise<RigRunReply>;
  cancelRigScore?: (progressId: string) => Promise<void>;
  onRigScoreProgress?: (callback: (update: RigProgress) => void) => () => void;
};

export type RigSessionState = {
  history: RigResult[];
  running: { tier: RigTierId; progressId: string; queued: RigTierId[] } | null;
  progress: RigProgress | null;
  /** Why a tier has no new result: not installed, busy, stopped, failed. */
  messages: Partial<Record<RigTierId, string>>;
  /** The last result could not be written to storage. */
  saveFailed: boolean;
};

export type RigSession = {
  getState: () => RigSessionState;
  subscribe: (listener: () => void) => () => void;
  runTiers: (tiers: RigTier[]) => Promise<void>;
  stop: () => void;
};

export function createRigSession(
  bridge: RigScoreBridge,
  options: {
    loadHistory?: () => RigResult[];
    saveHistory?: (history: RigResult[]) => boolean;
    now?: () => string;
  } = {},
): RigSession {
  const save = options.saveHistory ?? saveRigHistory;
  const now = options.now ?? (() => new Date().toISOString());
  let state: RigSessionState | null = null;
  const listeners = new Set<() => void>();
  let stopRequested = false;
  let unlisten: (() => void) | null = null;

  const getState = (): RigSessionState => {
    state ??= { history: (options.loadHistory ?? readRigHistory)(), running: null, progress: null, messages: {}, saveFailed: false };
    return state;
  };
  const set = (patch: Partial<RigSessionState>) => {
    state = { ...getState(), ...patch };
    listeners.forEach((listener) => listener());
  };

  const record = (tier: RigTier, outcome: RigOutcome) => {
    const current = getState();
    const messages = { ...current.messages };
    if (outcome.kind === 'measured') {
      delete messages[tier.id];
      const history = addRigResult(current.history, outcome.result);
      set({ history, messages, saveFailed: !save(history) });
    } else {
      messages[tier.id] = outcome.message;
      set({ messages });
    }
  };

  const runTiers = async (tiers: RigTier[]) => {
    const run = bridge.runRigScore;
    if (!run || tiers.length === 0 || getState().running) return;
    stopRequested = false;
    unlisten ??= bridge.onRigScoreProgress?.((update) => {
      if (update.id === getState().running?.progressId) set({ progress: update });
    }) ?? null;
    const messages = { ...getState().messages };
    tiers.forEach((tier) => { delete messages[tier.id]; });
    set({ messages });

    for (const [index, tier] of tiers.entries()) {
      if (stopRequested) break;
      const progressId = `rig-${tier.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set({ running: { tier: tier.id, progressId, queued: tiers.slice(index + 1).map((next) => next.id) }, progress: null });
      let outcome: RigOutcome;
      try {
        outcome = assembleTierResult(tier, await run(rigRunRequest(tier, progressId)), now());
      } catch (error) {
        outcome = { kind: 'failed', message: `The test did not finish: ${getErrorMessage(error)}` };
      }
      record(tier, outcome);
      // Busy is about the card, not the tier, so the next tier would meet it too.
      if (outcome.kind === 'stopped' || outcome.kind === 'busy') break;
    }
    set({ running: null, progress: null });
  };

  const stop = () => {
    const running = getState().running;
    if (!running) return;
    stopRequested = true;
    void bridge.cancelRigScore?.(running.progressId);
  };

  return {
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    runTiers,
    stop,
  };
}
