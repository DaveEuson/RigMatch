import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The real functions, cut out of main.cjs and run against a pretend platform,
// so this cannot drift from what ships.
const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const from = main.indexOf('function pickRigmatchDownloadAsset');
const to = main.indexOf('function isRigmatchReleasePageUrl');
const end = main.indexOf('\n}\n', to) + 3;
const source = `${main.slice(from, end)}
function getReleaseAssetTerms() { return TERMS; }`;
const calls = main.slice(main.indexOf('function scoreReleaseAsset'), main.indexOf('function isRigmatchInstallerAsset'));

function load(platform, arch, env = {}) {
  const terms = platform === 'linux'
    ? ['linux', 'x64', 'x86_64', 'amd64', 'appimage', 'deb']
    : ['win', 'windows', 'x64', 'exe', 'nsis', 'zip'];
  const context = { process: { platform, arch, env }, URL, TERMS: terms };
  vm.createContext(context);
  vm.runInContext(`${source.replace('function getReleaseAssetTerms() { return TERMS; }', '')}\n${calls}\nfunction getReleaseAssetTerms() { return TERMS; }`, context);
  return context;
}

const names = [
  'latest-linux.yml', 'RigMatch-0.9.6-linux-amd64.deb', 'RigMatch-0.9.6-linux-arm64.deb',
  'RigMatch-0.9.6-linux-arm64.AppImage', 'RigMatch-0.9.6-linux-x86_64.AppImage',
  'RigMatch-0.9.6-win-x64.exe', 'RigMatch-0.9.6-win-x64.zip', 'SHA256SUMS.txt',
];
const release = { assets: names.map((name) => ({ name })) };

test('the real release assets are recognised', () => {
  assert.equal(load('win32', 'x64').pickRigmatchDownloadAsset(release).name, 'RigMatch-0.9.6-win-x64.exe');
});

test('a .deb install is offered the .deb, an AppImage the AppImage', () => {
  assert.equal(load('linux', 'x64').pickRigmatchDownloadAsset(release).name, 'RigMatch-0.9.6-linux-amd64.deb');
  assert.equal(
    load('linux', 'x64', { APPIMAGE: '/home/x/RigMatch.AppImage' }).pickRigmatchDownloadAsset(release).name,
    'RigMatch-0.9.6-linux-x86_64.AppImage',
  );
});

test('release links are accepted for RigMatch, and still for the old RigMatch.AI name', () => {
  const { isRigmatchReleaseDownloadUrl, isRigmatchReleasePageUrl } = load('linux', 'x64');
  assert.equal(isRigmatchReleaseDownloadUrl('https://github.com/DaveEuson/RigMatch/releases/download/v0.9.6-beta/RigMatch-0.9.6-win-x64.exe'), true);
  assert.equal(isRigmatchReleaseDownloadUrl('https://github.com/DaveEuson/RigMatch.AI/releases/download/v0.9/RigMatch.AI-0.9-win-x64.exe'), true);
  assert.equal(isRigmatchReleaseDownloadUrl('https://github.com/evil/RigMatch/releases/download/v1/RigMatch-1.exe'), false);
  assert.equal(isRigmatchReleasePageUrl('https://github.com/DaveEuson/RigMatch/releases/tag/v0.9.6-beta'), true);
});
