// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Download, RefreshCw } from 'lucide-react';
import type { AutoUpdateStatus, UpdateChannel, UpdateCheckResponse } from '../types';
import {
  getDirectUpdateDownloadLabel,
  getUpdateChannelLabel,
  getUpdateResultDetail,
  getUpdateStatusLabel,
} from '../lib/updateLabels';

export type ReleaseNoteEntry = {
  version: string;
  label: string;
  date: string;
  notes: string[];
};

export function UpdateCenter({
  channel,
  result,
  isChecking,
  autoUpdateStatus,
  onChannelChange,
  onCheck,
  onOpenPage,
  onDownload,
  onInstall,
}: {
  channel: UpdateChannel;
  result: UpdateCheckResponse | null;
  isChecking: boolean;
  autoUpdateStatus: AutoUpdateStatus;
  onChannelChange: (channel: UpdateChannel) => void;
  onCheck: () => void;
  onOpenPage: () => void;
  onDownload: () => void;
  onInstall: () => void;
}) {
  const status = result?.status ?? 'unknown';
  const statusLabel = getUpdateStatusLabel(result, isChecking);
  const channelLabel = getUpdateChannelLabel(channel);
  const directDownloadLabel = getDirectUpdateDownloadLabel(result, channel);
  const resultTitle = result?.hasUpdate
    ? result.latestName ?? `New ${channelLabel} build`
    : result?.status === 'current'
      ? `${channelLabel} channel current`
      : result?.latestName ?? 'No check yet';
  const au = autoUpdateStatus;

  return (
    <section className={`update-center ${status}`} aria-label="RigMatch update center">
      <div className="update-center-head">
        <div>
          <span>RigMatch</span>
          <strong>{statusLabel}</strong>
          <em>Choose public releases or nightly builds, then check what RigMatch can download.</em>
        </div>
        <div className="update-actions">
          <button type="button" className="btn btn-line btn-sm" onClick={onCheck} disabled={isChecking || au.phase === 'downloading'}>
            <RefreshCw className={isChecking ? 'spin' : ''} aria-hidden="true" />
            {isChecking ? 'Checking' : 'Check'}
          </button>
          {au.phase === 'downloaded' ? (
            <button type="button" className="btn btn-gold btn-sm" onClick={onInstall}>
              <Download aria-hidden="true" />
              Install and restart
            </button>
          ) : au.phase === 'available' ? (
            <button type="button" className="btn btn-gold btn-sm" onClick={onDownload}>
              <Download aria-hidden="true" />
              Download v{au.version}
            </button>
          ) : au.phase === 'downloading' ? (
            <button type="button" className="btn btn-line btn-sm" disabled>
              <RefreshCw className="spin" aria-hidden="true" />
              {au.percent ?? 0}%
            </button>
          ) : (
            <button type="button" className="btn btn-line btn-sm" onClick={onOpenPage}>
              <Download aria-hidden="true" />
              {directDownloadLabel}
            </button>
          )}
        </div>
      </div>

      <div className="update-channel-toggle chip-row" role="group" aria-label="Update channel">
        <button
          type="button"
          className="chip"
          onClick={() => onChannelChange('release')}
          aria-pressed={channel === 'release'}
        >
          Release <span>· public builds, best for most people</span>
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onChannelChange('nightly')}
          aria-pressed={channel === 'nightly'}
        >
          Nightly <span>· newest experiments, more risk</span>
        </button>
      </div>

      <div className="update-result">
        <span>{channelLabel} channel</span>
        <strong>{resultTitle}</strong>
        <em>{getUpdateResultDetail(result, channel)}</em>
        {result?.downloadKind === 'installer' && result.downloadName && (
          <span className="update-download-link">Direct download ready: {result.downloadName}</span>
        )}
        {result?.releaseNotes && <p>{result.releaseNotes}</p>}
        {result?.error && <p className="update-error">{result.error}</p>}
      </div>
    </section>
  );
}

export function ReleaseNotes({ releases }: { releases: ReleaseNoteEntry[] }) {
  return (
    <section className="release-notes" aria-label="Release notes">
      <div className="release-notes-head">
        <span>Release notes</span>
        <strong>What changed in this build</strong>
      </div>
      <ol>
        {releases.map((release) => (
          <li key={release.version}>
            <div>
              <span>v{release.version}</span>
              <strong>{release.label}</strong>
              <em>{release.date}</em>
            </div>
            <ul>
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
