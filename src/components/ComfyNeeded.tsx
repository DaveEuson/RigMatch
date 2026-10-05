// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { RefreshCw } from 'lucide-react';
import { readComfySettings } from '../lib/comfySettings';
import { useComfyStart } from '../hooks/useComfyStart';
import { ComfyStartButton } from './ComfyStartButton';
import { GetComfyLink } from './GetComfyLink';

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
          // Simple Mode has no Settings, and the start button only exists when a
          // launcher was found, so neither is promised here.
          : `${runs}, a separate free program. Open it and RigMatch finds it by itself. If you don't have it yet, it is a free download.`}
      </span>
      <div className="advanced-lab-actions">
        <ComfyStartButton folder={readComfySettings().folder} onStarted={onCheck} />
        {!starting && <GetComfyLink className="mini-button outline" />}
        <button type="button" className="mini-button outline" onClick={onCheck}>
          <RefreshCw aria-hidden="true" />
          Check again
        </button>
      </div>
    </div>
  );
}
