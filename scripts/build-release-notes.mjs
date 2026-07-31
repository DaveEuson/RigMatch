#!/usr/bin/env node

// Single source of truth for "what's new": src/data/releaseNotes.ts feeds the
// in-app Update Center, the GitHub release body, and CHANGELOG.md. Before this
// script the GitHub release body was a static heredoc in release.yml, so the
// download page never mentioned what actually changed in a build.
//
//   node scripts/build-release-notes.mjs --version 0.3.7   # writes both files
//   node scripts/build-release-notes.mjs --check           # validate only
//
// Node 24 imports the .ts module directly (type stripping), same as the tests.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { releaseNotes } from '../src/data/releaseNotes.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { check: false, version: '', githubOut: 'RELEASE_NOTES.md', changelogOut: 'CHANGELOG.md' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--version') args.version = argv[i += 1] ?? '';
    else if (arg === '--github-out') args.githubOut = argv[i += 1] ?? '';
    else if (arg === '--changelog-out') args.changelogOut = argv[i += 1] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

// Accepts the raw tag (v0.3.7-beta), a bare version, or nothing (use package.json).
export function normalizeVersion(input) {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : trimmed.replace(/^v/, '');
}

export function findEntry(entries, version) {
  return entries.find((entry) => entry.version === version);
}

export function renderWhatsNew(entry) {
  const heading = entry.label ? `## What's new in ${entry.version} — ${entry.label}` : `## What's new in ${entry.version}`;
  return [heading, '', ...entry.notes.map((note) => `- ${note}`)].join('\n');
}

const DOWNLOAD_SECTIONS = `## Downloads

- **Windows**: \`RigMatch.AI-*-win-x64.exe\`
- **macOS Apple Silicon**: \`RigMatch.AI-*-mac-arm64.dmg\`
- **macOS Intel**: \`RigMatch.AI-*-mac-x64.dmg\`
- **Linux x64**: \`RigMatch.AI-*-linux-x86_64.AppImage\` or \`RigMatch.AI-*-linux-amd64.deb\`
- **Linux ARM64 / Jetson**: \`RigMatch.AI-*-linux-arm64.AppImage\` or \`RigMatch.AI-*-linux-arm64.deb\`

Downloads still carry the \`RigMatch.AI\` filename so existing installs keep updating cleanly. The app is just called RigMatch.

## macOS first launch

RigMatch for macOS is currently an unsigned beta distributed outside the App Store. On first launch, macOS may say the developer cannot be verified or that the app was downloaded from the internet.

1. Download **RigMatch.AI-*-mac-arm64.dmg** for Apple Silicon/M-series Macs, or **RigMatch.AI-*-mac-x64.dmg** for Intel Macs.
2. Open the \`.dmg\` and drag **RigMatch.AI** to **Applications**.
3. First launch only: right-click or Control-click **RigMatch.AI.app**, choose **Open**, then choose **Open** again.
4. If macOS still blocks it, open **System Settings > Privacy & Security**, scroll to **Security**, and choose **Open Anyway** for RigMatch.

After that first approval, RigMatch opens normally by double-clicking. If macOS says the app is damaged after copying it to Applications, run this Terminal command once:

\`\`\`bash
xattr -cr /Applications/RigMatch.AI.app
\`\`\`

Apple reference: https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac`;

export function renderGithubBody(entry) {
  return `${renderWhatsNew(entry)}\n\n${DOWNLOAD_SECTIONS}\n`;
}

export function renderChangelog(entries) {
  const header = [
    '# Changelog',
    '',
    'Every RigMatch release, newest first. These are the same notes the app shows in',
    'Update Center — this file and the GitHub release pages are generated from',
    '`src/data/releaseNotes.ts`, so there is only one place to write them.',
    '',
  ].join('\n');

  const body = entries
    .map((entry) => {
      const title = entry.label ? `## ${entry.version} — ${entry.label}` : `## ${entry.version}`;
      const date = entry.date ? `_${entry.date}_\n` : '';
      return [title, '', date, ...entry.notes.map((note) => `- ${note}`)].filter(Boolean).join('\n');
    })
    .join('\n\n');

  return `${header}\n${body}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let version = normalizeVersion(args.version);
  if (!version) {
    const pkg = await import(pathToFileURL(path.join(repoRoot, 'package.json')), { with: { type: 'json' } });
    version = pkg.default.version;
  }

  const entry = findEntry(releaseNotes, version);
  if (!entry) {
    console.error(
      `No release notes found for ${version}.\n` +
        `Add an entry to src/data/releaseNotes.ts before tagging — the in-app Update Center,\n` +
        `the GitHub release body, and CHANGELOG.md are all generated from it.\n` +
        `Newest entry on file: ${releaseNotes[0]?.version ?? '(none)'}`,
    );
    process.exit(1);
  }

  if (!entry.notes.length) {
    console.error(`Release notes for ${version} exist but list no changes.`);
    process.exit(1);
  }

  if (args.check) {
    console.log(`Release notes OK for ${version} — ${entry.notes.length} item(s): "${entry.label}"`);
    return;
  }

  await writeFile(path.resolve(repoRoot, args.githubOut), renderGithubBody(entry), 'utf8');
  await writeFile(path.resolve(repoRoot, args.changelogOut), renderChangelog(releaseNotes), 'utf8');
  console.log(`Wrote ${args.githubOut} for ${version} and ${args.changelogOut} (${releaseNotes.length} versions).`);
}

// Only run when invoked directly, so the tests can import the renderers.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
