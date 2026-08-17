import { getPullProgressDetailLabel, getPullProgressPercent, getPullProgressStatusLabel, getPullTrackPercent } from '../lib/modelCatalog';
import type { PullProgressUpdate } from '../types';
import { X } from 'lucide-react';

export function DownloadProgressInline({
  model,
  queued,
  isActive,
  isStopping,
  progress,
  onCancel,
}: {
  model: string;
  queued: boolean;
  isActive: boolean;
  isStopping: boolean;
  progress?: PullProgressUpdate;
  onCancel?: () => void;
}) {
  const phase = progress?.phase ?? (queued ? 'queued' : 'started');
  const percent = getPullProgressPercent(progress, queued);
  const hasMeasuredPercent = typeof progress?.percent === 'number';
  const trackPercent = getPullTrackPercent(progress, { queued, paused: phase === 'paused' });
  const percentLabel = hasMeasuredPercent || phase === 'complete'
    ? `${Math.round(percent)}%`
    : queued
      ? '0%'
      : '--%';
  const statusLabel = getPullProgressStatusLabel(model, phase, queued, isActive, isStopping, progress);
  const detailLabel = getPullProgressDetailLabel(phase, queued, progress);
  const className = [
    'download-progress-inline',
    phase,
    isActive ? 'active' : '',
    isStopping ? 'stopping' : '',
    !hasMeasuredPercent && phase !== 'queued' ? 'indeterminate' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} aria-label={`${model} download status`}>
      <div className="download-progress-copy">
        <span>{statusLabel}</span>
        <div className="download-progress-copy-end">
          <strong>{percentLabel}</strong>
          {onCancel && phase !== 'complete' && (
            <button
              type="button"
              className="icon-action download-progress-cancel-button"
              onClick={onCancel}
              disabled={isStopping}
              title={isActive ? `Cancel the ${model} download and clear the queue` : `Remove ${model} from the download queue`}
              aria-label={isActive ? `Cancel the ${model} download` : `Remove ${model} from the download queue`}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="download-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i style={{ width: `${trackPercent}%` }} />
      </div>
      <em>{detailLabel}</em>
    </div>
  );
}
