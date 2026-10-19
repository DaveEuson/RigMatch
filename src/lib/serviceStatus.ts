// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * How a local service answered the last time it was asked. 'off' is a service
 * that is not running and does not need to be: Ollama while LM Studio carries
 * the tests. 'missing' is one RigMatch looked for and found no sign of.
 */
export type ConnectionState = 'ok' | 'testing' | 'down' | 'untested' | 'off' | 'missing';

export const CONNECTION_WORDS: Record<ConnectionState, string> = {
  ok: 'connected',
  testing: 'checking',
  down: 'not answering',
  untested: 'not checked',
  off: 'not running',
  missing: 'not found',
};

/** What RigMatch knows about ComfyUI from its last look. */
export type ComfyLook = {
  /** Whether a look has come back yet. */
  checked: boolean;
  /** Whether ComfyUI answered at that look. */
  reachable: boolean;
  /** The models folder from Settings: set means ComfyUI was set up here. */
  folder: string;
};

/**
 * The top bar's ComfyUI dot. It said "not checked" while RigMatch had looked on
 * 8188 and 8000 and found nothing, which sent people looking for a check to
 * run. Grey either way: most people never install ComfyUI, and red would read
 * as something broken. Red is kept for a ComfyUI set up here that stopped.
 */
export function comfyConnection({ checked, reachable, folder }: ComfyLook): ConnectionState {
  if (reachable) return 'ok';
  if (!checked) return 'testing';
  return folder ? 'down' : 'missing';
}

/** The ComfyUI dot's tooltip: the state, and what My PC offers about it. */
export function comfyDotTitle(state: ConnectionState): string {
  const words = `ComfyUI: ${CONNECTION_WORDS[state]}`;
  if (state === 'missing') return `${words}. Open My PC to get it`;
  if (state === 'down') return `${words}. Open My PC to start it`;
  return words;
}

/**
 * What ComfyUI needs before someone downloads it, said up front rather than
 * discovered after a 5 GB install (docs.comfy.org). Simple Mode's Get ComfyUI
 * steps and My PC's Setup Doctor both say it.
 */
export function comfyRequirements(platform: string, arch: string): string {
  const mac = platform === 'darwin';
  if (mac && arch !== 'arm64') {
    return 'ComfyUI Desktop needs a Mac with Apple silicon (M1 or later). On this Mac it has to be installed by hand, and the download page links the steps.';
  }
  if (mac) return 'On a Mac it needs Apple silicon and macOS 13 or later.';
  return 'It runs best with an NVIDIA or AMD graphics card.';
}

export type ComfyDoctorKind = 'checking' | 'ready' | 'no-model' | 'busy' | 'not-running' | 'not-found';

/**
 * The ComfyUI row on My PC's Setup Doctor. Each kind wants a different next
 * step: nothing (ready, busy), a model (no-model), a start (not-running), or
 * the program itself (not-found). The row adds those actions; this says why.
 */
export function comfyDoctorRow(look: ComfyLook & {
  /** Picture models ComfyUI can draw with: checkpoints and complete split models. */
  pictureModels: number;
  /** Jobs already in ComfyUI's queue. */
  queue: number;
  platform: string;
  arch: string;
}): { kind: ComfyDoctorKind; value: string; detail: string; tone: 'ready' | 'warn' | 'info' } {
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  if (look.reachable && look.queue > 0) {
    return {
      kind: 'busy',
      value: 'Busy',
      detail: `Running, with ${plural(look.queue, 'job')} in its queue. Let ${look.queue === 1 ? 'it' : 'them'} finish before a picture or video test, so the time measures this PC.`,
      tone: 'info',
    };
  }
  if (look.reachable && look.pictureModels > 0) {
    return { kind: 'ready', value: 'Ready', detail: `Running, with ${plural(look.pictureModels, 'picture model')}.`, tone: 'ready' };
  }
  if (look.reachable) {
    return {
      kind: 'no-model',
      value: 'No picture model',
      detail: 'Running, but it has no picture model yet. Pick one on Models and RigMatch downloads it into ComfyUI.',
      tone: 'warn',
    };
  }
  if (!look.checked) {
    return { kind: 'checking', value: 'Checking', detail: 'Looking for ComfyUI on this PC.', tone: 'info' };
  }
  if (look.folder) {
    return {
      kind: 'not-running',
      value: 'Not running',
      detail: 'Set up on this PC, but not answering. Start it, and RigMatch notices within 15 seconds.',
      tone: 'warn',
    };
  }
  return {
    kind: 'not-found',
    value: 'Not found',
    detail: `Pictures, video and sound need ComfyUI, a separate free program of about 5 GB. Everything else works without it. ${comfyRequirements(look.platform, look.arch)}`,
    tone: 'info',
  };
}
