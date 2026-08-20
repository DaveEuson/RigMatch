// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Catch what nothing else catches.
 *
 * Run Logs records everything that travels through the main process — IPC
 * failures, skill-test outcomes. What it never saw was the renderer itself
 * falling over: an uncaught exception or an unhandled rejection threw, React
 * unmounted to a blank panel, and nothing was written anywhere. The first
 * report of that class of crash was a user with an audio test failing and,
 * in their words, no clue how to troubleshoot it.
 *
 * These handlers forward both to the same log file (userData/rigmatch-log.jsonl,
 * visible in Run Logs and via "Open logs folder"). Everything is wrapped in
 * its own try/catch, because a crash reporter that can itself crash during a
 * crash is worse than none.
 */

import { agentArcadeApi } from '../api.ts';

/** Rejections often carry non-Errors: strings, DOMExceptions, undefined. */
function describe(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }
  try {
    return { message: typeof value === 'string' ? value : JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
}

function forward(kind: string, detail: { message: string; stack?: string; source?: string }) {
  try {
    void agentArcadeApi.appendLog?.({
      level: 'error',
      source: 'renderer',
      message: `${kind}: ${detail.message}`,
      details: {
        stack: detail.stack?.split('\n').slice(0, 12).join('\n'),
        at: detail.source,
      },
    });
  } catch {
    // The bridge itself may be what broke. The console line below still fires.
  }
  // Also to the devtools console, for anyone running from source.
  console.error(`[rigmatch ${kind}]`, detail.message, detail.stack ?? '');
}

let installed = false;

export function installCrashLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    const base = describe(event.error ?? event.message);
    forward('uncaught error', {
      ...base,
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    forward('unhandled rejection', describe(event.reason));
  });
}
