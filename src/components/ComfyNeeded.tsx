// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { RefreshCw } from 'lucide-react';
import { readComfySettings } from '../lib/comfySettings';
import { useComfyStart } from '../hooks/useComfyStart';
import { ComfyStartButton } from './ComfyStartButton';

/**
 * What a test that runs on ComfyUI shows while ComfyUI is not answering: that
 * it is starting, or how to start it, and a way to look again.
 */
export function ComfyNeeded({
  runs,
  onCheck,
}: {
  /** What needs it, as the start of a sentence: "SDXL Turbo runs on ComfyUI". */
  runs: string;
  onCheck: () => void;
}) {
  const start = useComfyStart();
  const starting = start.phase === 'starting';
  return (
    <div className="utility-empty compact">
      <strong>{starting ? 'Starting ComfyUI…' : 'ComfyUI is not running'}</strong>
      <span>
        {starting
          ? 'Loading takes a moment. This can run as soon as ComfyUI answers.'
          : `${runs}, a separate free program. Start it here, or let Settings start it whenever a test needs it.`}
      </span>
      <div className="advanced-lab-actions">
        <ComfyStartButton folder={readComfySettings().folder} onStarted={onCheck} />
        <button type="button" className="mini-button outline" onClick={onCheck}>
          <RefreshCw aria-hidden="true" />
          Check again
        </button>
      </div>
    </div>
  );
}
