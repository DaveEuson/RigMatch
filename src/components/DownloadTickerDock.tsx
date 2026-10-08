// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { getPullProgressDetailLabel, getPullProgressPercent, getPullTrackPercent, getQueueChipModelName, isVisiblePullProgress } from '../lib/modelCatalog';
import type { ModelRow, PullProgressUpdate } from '../types';
import { Download, Pause, Play, X } from 'lucide-react';

export function DownloadTickerDock({
  queuedRows,
  pullProgressByModel,
  isPulling,
  pullingModel,
  isPullCancelRequested,
  isPullPauseRequested,
  isPullPaused,
  onResumeQueue,
  onPauseQueue,
  onCancelQueue,
  onOpenDownloads,
}: {
  queuedRows: ModelRow[];
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isPulling: boolean;
  pullingModel: string | null;
  isPullCancelRequested: boolean;
  isPullPauseRequested: boolean;
  isPullPaused: boolean;
  onResumeQueue: () => void;
  onPauseQueue: () => void;
  onCancelQueue: () => void;
  onOpenDownloads: () => void;
}) {
  const visibleProgress = Object.values(pullProgressByModel).filter((progress) => isVisiblePullProgress(progress));
  const activeProgress = pullingModel ? pullProgressByModel[pullingModel] : visibleProgress[0];
  const activeModel = pullingModel ?? activeProgress?.model ?? queuedRows[0]?.displayName ?? null;
  const phase = activeProgress?.phase ?? (activeModel ? 'queued' : 'queued');
  const isPaused = phase === 'paused' || isPullPaused;
  const dockPhase = isPaused ? 'paused' : phase;
  const queuedBehindCount = queuedRows.filter((row) => row.displayName !== activeModel).length;
  const queued = phase === 'queued' || (!isPulling && !isPaused && queuedRows.some((row) => row.displayName === activeModel));
  const percent = getPullProgressPercent(activeProgress, queued);
  const hasMeasuredPercent = typeof activeProgress?.percent === 'number';
  const trackPercent = getPullTrackPercent(activeProgress, { queued, paused: isPaused });
  const percentLabel = isPaused
    ? hasMeasuredPercent ? `${Math.round(percent)}%` : 'Paused'
    : hasMeasuredPercent || phase === 'complete'
      ? `${Math.round(percent)}%`
      : queued
        ? 'Queued'
        : '--%';
  const detailLabel = activeProgress
    ? getPullProgressDetailLabel(phase, queued, activeProgress)
    : queuedRows.length > 0
      ? `${queuedRows.length} model${queuedRows.length === 1 ? '' : 's'} waiting to download.`
      : 'Waiting for download status.';
  const statusLabel = phase === 'failed'
    ? 'Download failed'
    : phase === 'complete'
      ? 'Download complete'
      : isPaused
        ? 'Download paused'
      : isPullCancelRequested
        ? 'Stopping download'
        : isPullPauseRequested
          ? 'Pausing download'
        : isPulling
          ? 'Downloading'
          : queuedRows.length > 0
            ? 'Download queued'
            : 'Download status';

  // The percentage has its own place beside the name, so the detail line does
  // not repeat it.
  const detailText = detailLabel.replace(/^\d+% · /, '');
  const showPause = !isPaused && isPulling;
  const showCancel = queuedRows.length > 0 || isPulling;

  return (
    <section className={`ticker-download-dock ${dockPhase}`} aria-label="Download status">
      <button type="button" className="ticker-download-main" onClick={onOpenDownloads} title="See all downloads">
        <Download aria-hidden="true" />
        <strong title={activeModel ?? undefined}>{activeModel ? getQueueChipModelName(activeModel) : 'Ollama queue'}</strong>
        <b>{percentLabel}</b>
      </button>
      <div className="ticker-download-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i style={{ width: `${trackPercent}%` }} />
      </div>
      <p className="ticker-download-detail">
        <span>{statusLabel}</span>
        {detailText ? ` · ${detailText}` : ''}
        {queuedBehindCount > 0 ? ` · ${queuedBehindCount} waiting` : ''}
      </p>
      {(isPaused || showPause || showCancel) && (
        <div className="ticker-download-actions">
          {isPaused ? (
            <button
              type="button"
              className="ticker-download-resume"
              onClick={onResumeQueue}
              disabled={isPullCancelRequested || isPulling}
              title="Resume the paused Ollama download through cached layers"
            >
              <Play aria-hidden="true" />
              Resume
            </button>
          ) : showPause && (
            <button
              type="button"
              className="ticker-download-pause"
              onClick={onPauseQueue}
              disabled={isPullPauseRequested || isPullCancelRequested}
              title="Pause the active Ollama pull and keep it queued"
            >
              <Pause aria-hidden="true" />
              {isPullPauseRequested ? 'Pausing' : 'Pause'}
            </button>
          )}
          {showCancel && (
            <button
              type="button"
              className="ticker-download-stop"
              onClick={onCancelQueue}
              disabled={isPullCancelRequested}
              title={isPulling ? 'Cancel the active Ollama pull and clear queued downloads' : 'Cancel all queued downloads'}
            >
              <X aria-hidden="true" />
              {isPullCancelRequested ? 'Canceling' : 'Cancel'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
