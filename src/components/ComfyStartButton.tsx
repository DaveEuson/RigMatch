// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Play } from 'lucide-react';
import { agentArcadeApi } from '../api';

/**
 * Offer to start ComfyUI, in the two places someone would look for it.
 *
 * It lived only at the bottom of Settings first, which is the right place to
 * configure ComfyUI and the wrong place to notice it is not running — you find
 * that out at the top of the app, where everything else reports whether it is
 * up. One component rather than two so the rule and the wording cannot drift
 * apart between them.
 *
 * The rule: only ever offer a launcher that exists on disk. A Start button that
 * cannot start anything is the same empty promise as an image offer with no
 * checkpoint behind it, so a source checkout with no .bat gets nothing here
 * rather than a guessed Python interpreter.
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
  onStarted?: () => void;
}) {
  const [launchers, setLaunchers] = useState<{ path: string; label: string; file: string }[]>([]);
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState('');

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

  const start = useCallback(async () => {
    if (!agentArcadeApi.comfyLaunch) return;
    setLaunching(true);
    setMessage('');
    try {
      await agentArcadeApi.comfyLaunch(folder, launchers[0]?.path);
      // Deliberately not "ComfyUI is running". It has been asked to start, and
      // loading torch and a checkpoint takes tens of seconds — the status probe
      // is the only thing that can honestly say when it is ready.
      setMessage('ComfyUI is starting. It takes a moment to load, and RigMatch will notice on its own.');
      onStarted?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ComfyUI could not be started.');
    } finally {
      setLaunching(false);
    }
  }, [folder, launchers, onStarted]);

  if (!launchers.length) return null;

  const label = launching
    ? 'Starting ComfyUI…'
    : variant === 'deck'
      ? 'Start ComfyUI'
      : `Start ComfyUI (${launchers[0].label})`;

  return (
    <>
      <button
        type="button"
        className={variant === 'deck' ? 'primary-button compact' : 'mini-button'}
        onClick={() => void start()}
        disabled={launching}
        title={`Runs ${launchers[0].file}`}
      >
        <Play aria-hidden="true" />
        {label}
      </button>
      {message && variant === 'settings' && (
        <div className="advanced-lab-warning">
          <AlertTriangle aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
    </>
  );
}
