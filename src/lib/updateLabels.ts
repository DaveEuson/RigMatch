// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { UpdateChannel, UpdateCheckResponse } from '../types';

export function getUpdateChannelLabel(channel: UpdateChannel) {
  return channel === 'nightly' ? 'Nightly' : 'Release';
}

export function getUpdateStatusLabel(result: UpdateCheckResponse | null, isChecking: boolean) {
  if (isChecking) return 'Checking for upgrades';
  if (!result) return 'Ready to check for upgrades';
  if (result.hasUpdate) return 'New build available';
  if (result.status === 'current') return 'You are up to date';
  return 'Update status unknown';
}

export function getDirectUpdateDownloadLabel(result: UpdateCheckResponse | null, channel: UpdateChannel) {
  if (result?.downloadKind !== 'installer' || !result.downloadUrl) return 'View Downloads';
  const channelLabel = getUpdateChannelLabel(channel);

  if (result.downloadName?.endsWith('.exe')) return `Download ${channelLabel} EXE`;
  if (result.downloadName?.endsWith('.dmg')) return `Download ${channelLabel} DMG`;
  if (result.downloadName?.endsWith('.AppImage')) return `Download ${channelLabel} AppImage`;
  if (result.downloadName?.endsWith('.deb')) return `Download ${channelLabel} DEB`;
  return `Download ${channelLabel}`;
}

export function getUpdateResultDetail(result: UpdateCheckResponse | null, channel: UpdateChannel) {
  if (!result) {
    return channel === 'nightly'
      ? 'Nightly checks look for prerelease or nightly-tagged builds.'
      : 'Release checks look for the newest public build.';
  }

  const latest = result.latestVersion ? `latest v${result.latestVersion}` : 'latest version unknown';
  const checked = result.checkedAt ? `checked ${formatReleaseDate(result.checkedAt)}` : 'not checked';
  const date = result.latestDate ? `published ${formatReleaseDate(result.latestDate)}` : 'publish date unknown';

  if (result.error) {
    return `Current v${result.currentVersion}; ${checked}. Downloads still open manually.`;
  }

  if (result.status === 'current') {
    const relation = compareVersionStrings(result.latestVersion, result.currentVersion);
    if (relation < 0) {
      return `Current v${result.currentVersion}; ${latest}; ${date}. The ${getUpdateChannelLabel(channel).toLowerCase()} channel currently trails this installed build.`;
    }

    return `Current v${result.currentVersion}; ${latest}; ${date}. No newer ${getUpdateChannelLabel(channel).toLowerCase()} build found.`;
  }

  const download = result.downloadKind === 'installer' && result.downloadName
    ? `Direct installer: ${result.downloadName}.`
    : 'Open the release page to choose a download.';

  return `Current v${result.currentVersion}; ${latest}; ${date}. ${download}`;
}

export function formatReleaseDate(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function compareVersionStrings(a: string | null | undefined, b: string | null | undefined): number {
  const normalize = (value: string | null | undefined) =>
    String(value ?? '')
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part));
  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}
