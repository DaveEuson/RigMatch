// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { formatGb, formatThroughput } from '../lib/format';
import type { ModelProfile } from '../lib/modelCatalog';
import { getHardwareFit, getSelectedContestantBlurb, isVisiblePullProgress } from '../lib/modelCatalog';
import { getModelOrigin } from '../lib/modelOrigins';
import type { RunDelta } from '../lib/runHistory';
import type { ModelRow, PullProgressUpdate, TestedModelScore } from '../types';
import { AvatarBust } from './Avatars';
import { describeModelTag } from '../lib/modelVariants.ts';
import { DownloadProgressInline } from './DownloadProgressInline';
import { ScoreDeltaCell, ScoreRadar, ScoreSparkline } from './ScoreVisuals';
import { Download, Gauge, Heart, Trophy, X, Zap } from 'lucide-react';

export function SelectedContestantCard({
  row,
  profile,
  score,
  vramGb,
  installed,
  queued,
  shortlisted,
  speedDateLineupFull,
  pullProgress,
  isPulling,
  isPullStopping,
  isBenchmarking,
  onScoreModel,
  onQueueModel,
  onCancelQueue,
  onToggleShortlist,
  onOpenSpeedDate,
  modelNotes,
  onSaveModelNote,
  scoreTrend,
  scoreDeltas,
  onQuickCheck,
  onChooseModel,
}: {
  row?: ModelRow;
  profile: ModelProfile;
  score?: TestedModelScore;
  vramGb: number;
  installed: boolean;
  queued: boolean;
  shortlisted: boolean;
  speedDateLineupFull: boolean;
  pullProgress?: PullProgressUpdate;
  isPulling: boolean;
  isPullStopping: boolean;
  isBenchmarking: boolean;
  onChooseModel: (model: string) => void;
  onScoreModel: (row: ModelRow) => void;
  onQueueModel: (row: ModelRow) => void;
  onCancelQueue: () => void;
  onToggleShortlist: (row: ModelRow) => void;
  onOpenSpeedDate: () => void;
  modelNotes: Record<string, string>;
  onSaveModelNote: (model: string, note: string) => void;
  scoreTrend: Record<string, number[]>;
  scoreDeltas: Record<string, RunDelta>;
  onQuickCheck: (row: ModelRow) => void;
}) {
  if (!row) {
    return (
      <section className="contestant-spotlight empty" aria-label="Selected contestant">
        <div>
          <span>Selected Model</span>
          <strong>No model selected</strong>
          <em>Pick a model from the table to inspect its profile, fit, and next action.</em>
        </div>
      </section>
    );
  }

  const hardwareFit = getHardwareFit(row, vramGb);
  const noteValue = modelNotes[row.displayName] ?? '';
  const sizeLabel = row.sizeGb ? formatGb(row.sizeGb) : 'Size unknown';
  const matchLabel = score ? `${score.total} Match · ${score.grade}` : 'No score yet';
  const statusLabel = installed
    ? 'Installed locally'
    : queued
      ? 'In download queue'
      : row.live
        ? 'Available to download'
        : 'Catalog pick';
  const canJoinSpeedDate = installed && hardwareFit.recommend;
  const canChangeSpeedDateSlot = shortlisted || (canJoinSpeedDate && !speedDateLineupFull);
  const origin = getModelOrigin(row.displayName);
  const showDownloadProgress = !installed && (queued || isPulling || isVisiblePullProgress(pullProgress));
  const trend = scoreTrend[row.displayName] ?? [];
  const delta = scoreDeltas[row.displayName] ?? null;

  const vramNeeded = row.sizeGb ?? 0;
  const vramHint = !hardwareFit.recommend && vramNeeded > 0
    ? vramNeeded <= 8
      ? `A GPU with 8 GB VRAM (e.g. RTX 3060) would run this model.`
      : vramNeeded <= 16
        ? `A GPU with 16 GB VRAM (e.g. RTX 4080) would unlock this model.`
        : vramNeeded <= 24
          ? `A GPU with 24 GB VRAM (e.g. RTX 3090 or 4090) is needed.`
          : `This model needs high-end hardware (48 GB+ VRAM or Apple M-series with unified memory).`
    : null;

  return (
    <section className="contestant-spotlight" aria-label={`Selected contestant is ${row.displayName}`}>
      <AvatarBust generationKind={row.generationKind} model={row.displayName} size="small" />
      <div className="contestant-spotlight-copy">
        <span>Selected model</span>
        <strong>{row.displayName}</strong>
        <em>{row.params} · {profile.archetype}</em>
        <p>{getSelectedContestantBlurb(row, profile, score, hardwareFit)}</p>
        {/* What the letters after the colon mean, next to the letters
            themselves. The line above says "e2b · Small-footprint helper",
            which is the family's archetype and identical for every variant —
            so without this the tag is the only thing telling two rows apart
            and the one thing nothing explains. */}
        {describeModelTag(row.displayName).length > 0 && (
          <ul className="contestant-variant-facts" aria-label="What this version means">
            {describeModelTag(row.displayName).map((fact) => (
              <li key={fact.kind}>
                <strong>{fact.label}</strong>
                <span>{fact.plain}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="contestant-spotlight-stats" aria-label="Selected model details">
        <div>
          <span>Match</span>
          <strong>{matchLabel}</strong>
        </div>
        <div>
          <span>Fit</span>
          <strong>{hardwareFit.label}</strong>
        </div>
        <div title={`${origin.organization} · ${origin.country}`}>
          <span>By</span>
          <strong>{origin.organization}</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>{sizeLabel}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>
      {score && (
        <div className="contestant-radar-row">
          <ScoreRadar speed={score.speed} sobriety={score.sobriety} fit={score.fit} />
          <div className="contestant-radar-scores">
            {/* These are 0–100 sub-scores, not measurements. "Speed score" keeps it
                from being read as the tokens/sec figure shown in the models table. */}
            <div title="0–100 speed sub-score (not tokens/sec)"><span>Speed score</span><strong>{score.speed}</strong></div>
            {/* The sub-score above tops out at 100 tok/s, so most models on capable
                hardware tie at 100. Show the measured rate too, which keeps ranking. */}
            {score.tokensPerSecond != null && (
              <div title="Generation speed actually measured during the run">
                <span>Measured</span><strong>{formatThroughput(score)}</strong>
              </div>
            )}
            <div title="0–100 answer-quality sub-score"><span>Accuracy</span><strong>{score.sobriety}</strong></div>
            <div title="0–100 hardware-fit sub-score"><span>Fit</span><strong>{score.fit}</strong></div>
            {trend.length >= 2 && (
              <div className="contestant-sparkline-cell">
                <span>Trend</span>
                <ScoreSparkline values={trend} />
              </div>
            )}
            {delta && <ScoreDeltaCell delta={delta} />}
          </div>
        </div>
      )}
      {vramHint && (
        <div className="contestant-vram-hint">
          <span>Upgrade path</span>
          <p>{vramHint}</p>
        </div>
      )}
      <div className="contestant-spotlight-actions">
        <span>{hardwareFit.detail}</span>
        <div>
          {installed ? (
            <button
              type="button"
              className={`primary-button compact${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onScoreModel(row)}
              disabled={isBenchmarking}
              title={!hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? '⚠ Size unknown — RigMatch can\'t gauge fit yet, test anyway?' : '⚠ Too big for your VRAM — will be slow, test anyway?') : undefined}
            >
              <Gauge aria-hidden="true" />
              Test Model
            </button>
          ) : (
            <button
              type="button"
              className={queued ? 'primary-button compact queued' : `primary-button compact${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onQueueModel(row)}
              title={!hardwareFit.recommend && !queued ? (hardwareFit.tone === 'unknown' ? 'Size unknown — download to find out the footprint?' : '⚠ Too big for your VRAM — download anyway?') : queued ? 'Remove this model from the download queue' : 'Add this model to the download queue'}
            >
              {queued ? <X aria-hidden="true" /> : <Download aria-hidden="true" />}
              {queued ? 'Remove from Queue' : 'Get Model'}
            </button>
          )}
          {installed && (
            <button
              type="button"
              className={`mini-button outline${!hardwareFit.recommend ? ' warn' : ''}`}
              onClick={() => onQuickCheck(row)}
              disabled={isBenchmarking}
              title={!hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? '⚠ Size unknown — quick check anyway?' : '⚠ Too big for your VRAM — quick check anyway?') : 'Run a 3-question sanity check (coding, accuracy, format)'}
            >
              <Zap aria-hidden="true" />
              Quick Check
            </button>
          )}
          {(!speedDateLineupFull || shortlisted) && (
            <button
              type="button"
              className={shortlisted ? 'mini-button contestant-date-button active' : 'mini-button contestant-date-button'}
              onClick={() => onToggleShortlist(row)}
              disabled={isBenchmarking || !canChangeSpeedDateSlot}
              title={shortlisted ? 'Remove this model from Speed Dating' : 'Add this model to Speed Dating'}
            >
              <Heart aria-hidden="true" />
              {shortlisted ? 'Selected' : 'Add to Speed Dating'}
            </button>
          )}
          <button type="button" className="mini-button outline" onClick={onOpenSpeedDate}>
            <Trophy aria-hidden="true" />
            Lineup
          </button>
          {installed && (
            <button
              type="button"
              className="mini-button outline"
              onClick={() => onChooseModel(row.displayName)}
              title={`Set ${row.displayName} as your Top Match`}
            >
              <Heart aria-hidden="true" />
              Set as Top Match
            </button>
          )}
        </div>
        {showDownloadProgress && (
          <DownloadProgressInline
            model={row.displayName}
            queued={queued}
            isActive={isPulling}
            isStopping={isPullStopping}
            progress={pullProgress}
            onCancel={() => (isPulling ? onCancelQueue() : onQueueModel(row))}
          />
        )}
      </div>
      <div className="contestant-notes">
        <label htmlFor={`note-${row.displayName}`}>
          <span>Notes</span>
        </label>
        <textarea
          id={`note-${row.displayName}`}
          className="contestant-notes-area"
          placeholder="Add private notes about this model..."
          value={noteValue}
          onChange={(e) => onSaveModelNote(row.displayName, e.target.value)}
          rows={2}
        />
      </div>
    </section>
  );
}
