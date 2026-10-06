// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { formatGb, formatThroughput } from '../lib/format';
import type { ModelProfile } from '../lib/modelCatalog';
import { describeAbilities, describeFitPlainly, getFriendlyModelName, getHardwareFit, getSelectedContestantBlurb, isVisiblePullProgress } from '../lib/modelCatalog';
import { getModelOrigin } from '../lib/modelOrigins';
import type { RunDelta } from '../lib/runHistory';
import type { ModelRow, PullProgressUpdate, TestedModelScore } from '../types';
import { AvatarBust } from './Avatars';
import { describeModelTag, describeQuantization } from '../lib/modelVariants.ts';
import { DownloadProgressInline } from './DownloadProgressInline';
import { ScoreDeltaCell, ScoreRadar, ScoreSparkline } from './ScoreVisuals';

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
  // Ollama and LM Studio both report it for an installed model; most tags
  // never say it, so the download line was the only place it could go.
  const quantization = row.installedModel?.quantization;
  const tagFacts = describeModelTag(row.displayName);
  const quantFact = tagFacts.some((fact) => fact.kind === 'quant') ? null : describeQuantization(quantization);
  const variantFacts = quantFact ? [...tagFacts, quantFact] : tagFacts;
  const abilities = describeAbilities(row);
  // The fit line says what happens; the caution under it is only for a fit
  // that needs one. A comfortable one said the same thing twice.
  const fitCaution = hardwareFit.tone !== 'sweet-spot' && hardwareFit.tone !== 'good' ? hardwareFit.detail : null;
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
        <h2 className="contestant-name">{getFriendlyModelName(row.displayName)}</h2>
        <code className="contestant-tag">{row.displayName}</code>
        <em>{[row.params, profile.archetype].filter(Boolean).join(' · ')}</em>
        {/* What it is for, in its makers' words: the one line from its Ollama
            page, which the catalog has carried all along without showing. */}
        {row.description && <p className="contestant-description">{row.description}</p>}
        <p>{getSelectedContestantBlurb(row, profile, score, hardwareFit)}</p>
        {/* What the letters after the colon mean, next to the letters
            themselves. The line above says "e2b · Small-footprint helper",
            which is the family's archetype and identical for every variant —
            so without this the tag is the only thing telling two rows apart
            and the one thing nothing explains. */}
        {variantFacts.length > 0 && (
          <ul className="contestant-variant-facts" aria-label="What this version means">
            {variantFacts.map((fact) => (
              <li key={fact.kind}>
                <strong>{fact.label}</strong>
                <span>{fact.plain}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="contestant-facts" aria-label="Selected model details">
        <div><dt>Match</dt><dd>{matchLabel}</dd></div>
        <div className="says"><dt>Fit</dt><dd>{describeFitPlainly(row, vramGb)}</dd></div>
        {abilities.length > 0 && <div className="says"><dt>Can do</dt><dd>{abilities.join(' · ')}</dd></div>}
        <div title={`${origin.organization} · ${origin.country}`}><dt>Maker</dt><dd>{origin.organization}</dd></div>
        <div><dt>Download</dt><dd className="figure">{quantization ? `${sizeLabel} · ${quantization}` : sizeLabel}</dd></div>
        <div><dt>Status</dt><dd>{statusLabel}</dd></div>
      </dl>
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
      {vramHint && <p className="contestant-vram-hint">{vramHint}</p>}
      <div className="contestant-spotlight-actions">
        {fitCaution && <span>{fitCaution}</span>}
        <div>
          {installed ? (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => onScoreModel(row)}
              disabled={isBenchmarking}
              title={!hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? 'Size unknown: RigMatch cannot gauge the fit yet. Test anyway?' : 'Too big for your graphics memory, so it will be slow. Test anyway?') : undefined}
            >
              Test this model
            </button>
          ) : (
            <button
              type="button"
              className={queued ? 'btn btn-line' : 'btn btn-gold'}
              onClick={() => onQueueModel(row)}
              title={!hardwareFit.recommend && !queued ? (hardwareFit.tone === 'unknown' ? 'Size unknown: download to find out the footprint?' : 'Too big for your graphics memory. Download anyway?') : queued ? 'Remove this model from the download queue' : 'Add this model to the download queue'}
            >
              {queued ? 'Remove from the queue' : `Download${row.sizeGb ? ` · ${sizeLabel}` : ''}`}
            </button>
          )}
          {installed && (
            <button
              type="button"
              className="btn btn-line btn-sm"
              onClick={() => onQuickCheck(row)}
              disabled={isBenchmarking}
              title={!hardwareFit.recommend ? (hardwareFit.tone === 'unknown' ? 'Size unknown. Quick check anyway?' : 'Too big for your graphics memory. Quick check anyway?') : 'Three questions: coding, accuracy and format'}
            >
              Quick check
            </button>
          )}
          {(!speedDateLineupFull || shortlisted) && (
            <button
              type="button"
              className={shortlisted ? 'btn btn-line btn-sm contestant-date-button active' : 'btn btn-line btn-sm contestant-date-button'}
              onClick={() => onToggleShortlist(row)}
              disabled={isBenchmarking || !canChangeSpeedDateSlot}
              aria-pressed={shortlisted}
            >
              {shortlisted ? 'In the lineup · remove' : 'Add to lineup'}
            </button>
          )}
          <button type="button" className="btn btn-line btn-sm" onClick={onOpenSpeedDate}>
            Open Comparison
          </button>
          {installed && (
            <button
              type="button"
              className="btn btn-line btn-sm"
              onClick={() => onChooseModel(row.displayName)}
              title={`Set ${row.displayName} as your Top Match`}
            >
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
        <label htmlFor={`note-${row.displayName}`}>Your notes</label>
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
