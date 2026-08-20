// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Activity } from 'lucide-react';

import type { GpuContention } from '../types';

/**
 * "Something else is using your graphics card", wherever a run can start.
 *
 * This lived inside RunWarningModal, which meant only the benchmark and Speed
 * Dating flows ever said it. The capability lab — Listening, Vision, Code, App
 * Builder — never asked, so a run started while a game held the GPU simply hung
 * for four minutes and then reported a connection timeout. The model was loaded
 * and the service was reachable; it was starved of compute, and nothing on
 * screen said so.
 *
 * Renders nothing when the GPU is clear, so it can sit unconditionally
 * wherever a run begins.
 */
export function GpuContentionNote({ contention }: { contention: GpuContention | null }) {
  if (!contention || contention.level === 'clear') return null;

  return (
    <div className={`gpu-contention-note level-${contention.level}`} role="status">
      <Activity aria-hidden="true" />
      <div>
        <strong>
          {contention.level === 'heavy' ? 'Your graphics card is busy'
            : contention.level === 'busy' ? 'Something else is using your graphics card'
              : 'Graphics card not checked'}
        </strong>
        <p>{contention.message}</p>
      </div>
    </div>
  );
}
