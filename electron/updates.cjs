// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

/**
 * Pure release-channel helpers for the RigMatch update check, extracted from
 * main.cjs so they can be unit tested. History note: the 0.2.4 installer
 * shipped while the release workflow still marked -beta tags as prereleases,
 * so those installs report v0.2.2 as "latest" until manually upgraded once.
 * The tests in tests/updateCheck.test.mjs pin the fixed behavior.
 */

function normalizeUpdateChannel(channel) {
  return channel === 'nightly' ? 'nightly' : 'release';
}

function isNightlyRelease(release) {
  return /nightly|alpha|canary|preview/i.test(`${release?.tag_name || ''} ${release?.name || ''}`);
}

function normalizeReleaseVersion(value) {
  const match = String(value || '').match(/v?(\d+(?:\.\d+){1,3})/i);
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const left = String(a || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function pickLatestRigmatchRelease(releases, channel) {
  const published = releases
    .filter((release) => release && !release.draft)
    .sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));

  if (channel === 'nightly') {
    return published.find(isNightlyRelease) || published.find((release) => release.prerelease) || published[0] || null;
  }

  return published.find((release) => !release.prerelease && !isNightlyRelease(release)) || null;
}

function hasNewerRigmatchRelease({ currentVersion, latestVersion, currentTag, latestTag, channel, isPrerelease }) {
  if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) return true;
  if (channel === 'nightly' && isPrerelease && latestTag && latestTag !== currentTag) return true;
  return false;
}

function summarizeReleaseNotes(body) {
  const text = String(body || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  return text.length > 420 ? `${text.slice(0, 420).trim()}...` : text;
}

module.exports = {
  normalizeUpdateChannel,
  isNightlyRelease,
  normalizeReleaseVersion,
  compareVersions,
  pickLatestRigmatchRelease,
  hasNewerRigmatchRelease,
  summarizeReleaseNotes,
};
