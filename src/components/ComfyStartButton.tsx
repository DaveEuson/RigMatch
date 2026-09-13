// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Play, RefreshCw } from 'lucide-react';
import { agentArcadeApi } from '../api';
import type { ComfyStartSkip } from '../lib/comfyAutoStart';
import { ensureComfyRunning } from '../lib/comfyStarter';
import { useComfyStart } from '../hooks/useComfyStart';
import { Elapsed } from './Elapsed';

/** What a click on Start could not do, and what to do instead. */
const SKIPPED: Partial<Record<ComfyStartSkip, string>> = {
  'no-bridge': 'This build cannot start ComfyUI. Start it the way you normally do.',
  'no-folder': 'Choose the ComfyUI folder in Settings first, so RigMatch can find its launcher.',
  'no-launcher': 'No launcher was found beside the ComfyUI folder. Start ComfyUI the way you normally do.',
};

/**
 * Offer to start ComfyUI wherever someone would notice it is not running.
 *
 * It lived only at the bottom of Settings first, which is the right place to
 * configure ComfyUI and the wrong place to notice it is not running. One
 * component rather than several so the rule and the wording cannot drift apart.
 *
 * The rule: only ever offer a launcher that exists on disk. A Start button that
 * cannot start anything is the same empty promise as an image offer with no
 * checkpoint behind it, so a source checkout with no .bat gets nothing here
 * rather than a guessed Python interpreter.
 *
 * Every copy shows the one start in flight, whoever began it: a click here, a
 * Test on the Models screen, or the Images channel opening. It says "starting"
 * until ComfyUI answers, never "running" on the strength of a launched process.
 */
export function ComfyStartButton({
  folder,
  variant = 'settings',
  onStarted,
}: {
  /** The verified models root. Launchers are looked for beside it. */
  folder: string;
  /** `deck` is the compact form for the status strip at the top. */
  variant?: 'settings' | 'deck';
  /** Called once ComfyUI answers after this button started it. */
  onStarted?: () => void;
}) {
  const [launchers, setLaunchers] = useState<{ path: string; label: string; file: string }[]>([]);
  const [message, setMessage] = useState('');
  const [answered, setAnswered] = useState(false);
  const start = useComfyStart();

  useEffect(() => {
    let live = true;
    // One asynchronous path whether or not there is a folder to search, so the
    // "nothing to offer" case does not set state synchronously inside the
    // effect and trigger a cascading render.
    const find = agentArcadeApi.comfyFindLaunchers;
    const lookup = folder && find ? find(folder) : Promise.resolve({ launchers: [] });
    void lookup
      .then((result) => { if (live) setLaunchers(result?.launchers ?? []); })
      .catch(() => { if (live) setLaunchers([]); });
    return () => { live = false; };
  }, [folder]);

  const begin = useCallback(async () => {
    setMessage('');
    const result = await ensureComfyRunning('button');
    if (result.outcome === 'running') {
      setAnswered(true);
      onStarted?.();
    } else if (result.outcome === 'skipped') {
      setMessage(SKIPPED[result.reason] ?? 'ComfyUI could not be started from here.');
    }
    // A failure is held in the shared state, where every copy of this shows it.
  }, [onStarted]);

  if (start.phase === 'starting') {
    return (
      <span className={`comfy-start-status ${variant}`} role="status" title={`Running ${start.launcher}`}>
        <RefreshCw className="spin" aria-hidden="true" />
        <span>Starting ComfyUI… <Elapsed since={start.since} /></span>
      </span>
    );
  }
  if (answered) {
    return (
      <span className={`comfy-start-status ${variant} ready`} role="status">
        <Check aria-hidden="true" />
        <span>ComfyUI is running.</span>
      </span>
    );
  }
  if (!launchers.length) return null;

  const failure = start.phase === 'failed' ? start.message : '';
  const note = failure || message;
  const label = failure
    ? 'Try starting ComfyUI again'
    : variant === 'deck'
      ? 'Start ComfyUI'
      : `Start ComfyUI (${launchers[0].label})`;

  return (
    <>
      <button
        type="button"
        className={variant === 'deck' ? 'primary-button compact' : 'mini-button'}
        onClick={() => void begin()}
        title={note || `Runs ${launchers[0].file}`}
      >
        <Play aria-hidden="true" />
        {label}
      </button>
      {note && variant === 'settings' && (
        <div className="advanced-lab-warning">
          <AlertTriangle aria-hidden="true" />
          <span>{note}</span>
        </div>
      )}
    </>
  );
}
