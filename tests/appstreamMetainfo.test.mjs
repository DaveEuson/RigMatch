// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Linux software centers and the AppImage catalog read RigMatch's description
 * and screenshots from its AppStream metainfo. Without it the catalog took its
 * own screenshot: the first-run dialog on a blank 800x600 test machine. These
 * keep the file wired to the app it describes, and its screenshots real.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const META = 'build/linux/ai.rigmatch.app.metainfo.xml';
const metainfo = read(`../${META}`);
const pkg = JSON.parse(read('../package.json'));

test('the metainfo describes this app', () => {
  assert.match(metainfo, new RegExp(`<id>${pkg.build.appId.replace(/\./g, '\\.')}</id>`), 'the AppStream id is not the app id');
  // The .deb and the AppImage install rigmatch-ai.desktop.
  assert.match(metainfo, /<launchable type="desktop-id">rigmatch-ai\.desktop<\/launchable>/);
  assert.match(metainfo, /<project_license>LicenseRef-proprietary<\/project_license>/, 'RigMatch is not open source; the metadata must not say otherwise');
});

test('the Linux packages carry it where AppStream looks', () => {
  const entry = pkg.build.linux.extraFiles.find((f) => f.from === META);
  assert.ok(entry, `${META} is not in linux.extraFiles`);
  assert.equal(entry.to, 'usr/share/metainfo/ai.rigmatch.app.metainfo.xml');
});

test('every screenshot it names is a file in this repository', () => {
  const urls = [...metainfo.matchAll(/<image>https:\/\/raw\.githubusercontent\.com\/DaveEuson\/RigMatch\/main\/([^<]+)<\/image>/g)].map((m) => m[1]);
  assert.ok(urls.length >= 1, 'no screenshots');
  assert.equal(urls.length, (metainfo.match(/<image>/g) ?? []).length, 'a screenshot points somewhere other than this repository');
  for (const path of urls) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} does not exist`);
  assert.match(metainfo, /<screenshot type="default">/, 'no default screenshot for the catalog to show');
});
