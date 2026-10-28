// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The speed test in progress and the results so far, held outside React.
 *
 * A run takes a minute or more a tier, and someone will look at another tab
 * meanwhile. Held in the screen, the result of a run would land on a screen
 * that had already gone and be lost; held here, the screen picks it back up
 * when it opens again. App.tsx needs no state for it.
 */
import {
  assembleEnduranceResult,
  baselineFromContention,
  enduranceRequest,
  type EnduranceOutcome,
  type EnduranceProgress,
  type EnduranceResult,
  type EnduranceRunReply,
  type EnduranceRunRequest,
} from './contextEndurance.ts';
import { addEnduranceResult, readEnduranceResults, saveEnduranceResults } from './enduranceHistory.ts';
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
  /** The context check (contextEndurance.ts). Stopped with cancelRigScore: it shares the speed test's slot. */
  runEndurance?: (request: EnduranceRunRequest) => Promise<EnduranceRunReply>;
  onEnduranceProgress?: (callback: (update: EnduranceProgress) => void) => () => void;
  /** What the graphics card is doing, read just before a context check to name its baseline. */
  getGpuContention?: () => Promise<Parameters<typeof baselineFromContention>[0]>;
};

export type RigSessionState = {
  history: RigResult[];
  running: { tier: RigTierId; progressId: string; queued: RigTierId[] } | null;
  progress: RigProgress | null;
  /** Why a tier has no new result: not installed, busy, stopped, failed. */
  messages: Partial<Record<RigTierId, string>>;
  /** The last result could not be written to storage. */
  saveFailed: boolean;
  /** The context check in progress. It holds the card like a tier does, so nothing else starts beside it. */
  endurance: { model: string; progressId: string } | null;
  enduranceProgress: EnduranceProgress | null;
  /** Each model's latest context check, newest first. */
  enduranceResults: EnduranceResult[];
  /** Why a model has no new context check: busy, stopped, failed. */
  enduranceMessages: Record<string, string>;
};

export type RigSession = {
  getState: () => RigSessionState;
  subscribe: (listener: () => void) => () => void;
  runTiers: (tiers: RigTier[]) => Promise<void>;
  /** The context check on one installed model. */
  checkContext: (model: string) => Promise<void>;
  stop: () => void;
};

/** The graphics card is taken by a speed test or a context check. */
export const rigScoreBusy = (state: RigSessionState): boolean => Boolean(state.running || state.endurance);

export function createRigSession(
  bridge: RigScoreBridge,
  options: {
    loadHistory?: () => RigResult[];
    saveHistory?: (history: RigResult[]) => boolean;
    loadEndurance?: () => EnduranceResult[];
    saveEndurance?: (results: EnduranceResult[]) => boolean;
    now?: () => string;
  } = {},
): RigSession {
  const save = options.saveHistory ?? saveRigHistory;
  const saveEndurance = options.saveEndurance ?? saveEnduranceResults;
  const now = options.now ?? (() => new Date().toISOString());
  let state: RigSessionState | null = null;
  const listeners = new Set<() => void>();
  let stopRequested = false;
  let unlisten: (() => void) | null = null;
  let unlistenEndurance: (() => void) | null = null;

  const getState = (): RigSessionState => {
    state ??= {
      history: (options.loadHistory ?? readRigHistory)(),
      running: null,
      progress: null,
      messages: {},
      saveFailed: false,
      endurance: null,
      enduranceProgress: null,
      enduranceResults: (options.loadEndurance ?? readEnduranceResults)(),
      enduranceMessages: {},
    };
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
    if (!run || tiers.length === 0 || rigScoreBusy(getState())) return;
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

  const recordEndurance = (model: string, outcome: EnduranceOutcome) => {
    const current = getState();
    const enduranceMessages = { ...current.enduranceMessages };
    if (outcome.kind === 'measured') {
      delete enduranceMessages[model];
      const enduranceResults = addEnduranceResult(current.enduranceResults, outcome.result);
      set({ enduranceResults, enduranceMessages, saveFailed: !saveEndurance(enduranceResults) });
    } else {
      enduranceMessages[model] = outcome.message;
      set({ enduranceMessages });
    }
  };

  const checkContext = async (model: string) => {
    const run = bridge.runEndurance;
    if (!run || rigScoreBusy(getState())) return;
    stopRequested = false;
    unlistenEndurance ??= bridge.onEnduranceProgress?.((update) => {
      if (update.id === getState().endurance?.progressId) set({ enduranceProgress: update });
    }) ?? null;
    const progressId = `endurance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const enduranceMessages = { ...getState().enduranceMessages };
    delete enduranceMessages[model];
    set({ endurance: { model, progressId }, enduranceProgress: null, enduranceMessages });
    let outcome: EnduranceOutcome;
    try {
      // The card, read before the model loads: where a model gives out moves with what else is using it.
      const reading = await bridge.getGpuContention?.().catch(() => null);
      const baseline = reading ? baselineFromContention(reading) : null;
      outcome = stopRequested
        ? { kind: 'stopped', message: 'Stopped. Nothing was saved for this check.' }
        : assembleEnduranceResult(model, await run(enduranceRequest(model, progressId)), baseline, now());
    } catch (error) {
      outcome = { kind: 'failed', message: `The check did not finish: ${getErrorMessage(error)}` };
    }
    recordEndurance(model, outcome);
    set({ endurance: null, enduranceProgress: null });
  };

  const stop = () => {
    const current = getState();
    const progressId = current.running?.progressId ?? current.endurance?.progressId;
    if (!progressId) return;
    stopRequested = true;
    void bridge.cancelRigScore?.(progressId);
  };

  return {
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    runTiers,
    checkContext,
    stop,
  };
}
