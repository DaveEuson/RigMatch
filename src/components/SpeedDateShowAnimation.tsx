// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { MIN_CONTESTANTS } from '../lib/downloadStatus';
import { lineupStanding } from '../lib/lineupStanding';
import { getShortModelName } from '../lib/modelCatalog';
import type { ModelRow, NetworkHost, RunProgress } from '../types';
import { AvatarBust, MachineAvatar } from './Avatars';
import { Plus } from 'lucide-react';

export function SpeedDateShowAnimation({
  rows,
  runProgress,
  winner,
  host,
}: {
  rows: ModelRow[];
  runProgress: RunProgress | null;
  winner?: string;
  host?: NetworkHost;
}) {
  // The saved winner only counts as the current one if it is actually on this
  // stage; otherwise the podium highlights a model the lineup does not contain.
  const standing = lineupStanding(winner, rows.map((row) => row.displayName));
  const activeModel = runProgress?.phase === 'running'
    ? runProgress.currentModel
    : (standing.kind === 'leading' ? standing.model : rows[0]?.displayName ?? '');
  const stageStatus = runProgress?.phase === 'running'
    ? `Now testing ${getShortModelName(runProgress.currentModel)}`
    : standing.kind === 'leading'
      ? `${getShortModelName(standing.model)} is holding the top score`
      : rows.length >= MIN_CONTESTANTS
        ? `${rows.length} contestants ready for the same questions`
        : 'Pick at least two contestants to start the show';
  const cue = runProgress?.questionLabel
    ? `Question: ${runProgress.questionLabel}`
    : runProgress?.phase === 'running'
      ? 'Same questions, one model at a time.'
      : 'When the show starts, each model gets the same prompt set.';
  const slots = Array.from({ length: 5 }, (_item, index) => rows[index]);

  return (
    <section
      className={runProgress?.phase === 'running' ? 'speed-date-show-stage running' : 'speed-date-show-stage'}
      aria-label="Speed Dating stage animation"
    >
      <div className="speed-date-host">
        <MachineAvatar host={host} size="small" />
        <div>
          <span>This computer</span>
          <strong>{host?.hostname ?? 'Local rig'}</strong>
        </div>
      </div>
      <ol className="speed-date-stage-lineup" aria-label="Speed Dating contestants on stage">
        {slots.map((row, index) => {
          const isActive = Boolean(row && row.displayName === activeModel);
          return (
            <li
              key={row?.displayName ?? `empty-stage-${index}`}
              className={isActive ? 'active' : row ? 'filled' : 'empty'}
            >
              {row ? (
                <>
                  <AvatarBust generationKind={row.generationKind} model={row.displayName} size="tiny" />
                  <span>{index + 1}</span>
                </>
              ) : (
                <Plus aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="speed-date-stage-cue">
        <span>{runProgress?.phase === 'running' ? 'Live Speed Dating' : winner ? 'Current Winner' : 'Ready Check'}</span>
        <strong>{stageStatus}</strong>
        <em>{cue}</em>
      </div>
    </section>
  );
}
