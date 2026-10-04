// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { HostBanterPhase } from '../lib/hostBanter';
import { getHostBanter } from '../lib/hostBanter';
import { getFriendlyModelName } from '../lib/modelCatalog';
import type { ModelRow, RunProgress } from '../types';
import { useShowExtras, useShowStage } from '../lib/showExtras';
import { useShowTheme } from '../hooks/useShowTheme';
import { CompareScreen, HostStrip } from './SimpleWizard';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Advanced Mode's live show: Simple Mode's show, laid over the screen while a
 * run goes, with a way to tuck it away and keep working.
 *
 * It used to be a stage of its own in the pre-redesign style (capitals, a
 * "Dating Game" sign, a "tonight's date" card and a second set of CPU and GPU
 * meters beside the ones in the top bar), and it had drifted from the show
 * Simple Mode puts on for the same run.
 */
export function LiveFlirtSpotlight({
  progress,
  rows,
  onStop,
}: {
  progress: RunProgress;
  rows?: ModelRow[];
  onStop?: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  // The theme song, if it is on, for as long as this is up: it is mounted only
  // while a run goes. Speed Dating only; a single model's test is not a show.
  const extras = useShowExtras();
  const stage = useShowStage();
  const isShow = progress.mode === 'speed-date';
  useShowTheme(isShow ? 'running' : 'idle', extras.music);

  const stageRows = rows?.length ? rows : [{ displayName: progress.currentModel } as ModelRow];
  // The name the stage shows, not the raw tag: "Llama3.2", not "llama3.2:1b".
  const activeShortName = getFriendlyModelName(progress.currentModel);
  const phase: HostBanterPhase = progress.questionPhase === 'prompt-start'
    ? 'asking'
    : progress.questionPhase === 'prompt-complete'
      ? 'scored'
      : (progress.questionPhase === 'prompt-run' || progress.questionPhase === 'prompt-token')
        ? 'answering'
        : 'warming';
  const hostLine = getHostBanter({
    contestantNumber: stageRows.findIndex((row) => row?.displayName === progress.currentModel) + 1,
    model: activeShortName,
    questionLabel: progress.questionLabel ?? 'Question',
    phase,
    index: Math.max(0, progress.questionIndex ?? 0),
    stage,
  });

  if (minimized) {
    return (
      <aside className="live-mini-bar" role="status" aria-live="polite" aria-label="Run in progress (minimized)">
        <span className="live-mini-dot" aria-hidden="true" />
        <div className="live-mini-info">
          <strong>{activeShortName} is answering</strong>
          <div className="live-mini-track" aria-hidden="true"><i style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <span className="live-mini-percent">{progress.percent}%</span>
        <button type="button" className="btn btn-line btn-sm" onClick={() => setMinimized(false)}>
          <Maximize2 aria-hidden="true" />
          Show
        </button>
      </aside>
    );
  }

  return (
    <section
      className={stage === 'trojan' ? 'live-show sw-shell stage-trojan' : 'live-show sw-shell'}
      aria-label={isShow ? 'Speed Dating, live' : 'Model test, live'}
    >
      <div className="live-show-body">
        <div className="live-show-top">
          <HostStrip line={hostLine} />
          <button type="button" className="btn btn-line btn-sm" onClick={() => setMinimized(true)} title="Keep the run going and use the rest of RigMatch">
            <Minimize2 aria-hidden="true" />
            Minimize
          </button>
        </div>
        <CompareScreen
          shortlistedRows={stageRows}
          runProgress={progress}
          benchmarkActive
          onStopShow={() => onStop?.()}
        />
      </div>
    </section>
  );
}
