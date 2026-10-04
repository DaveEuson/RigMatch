// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * "Want to go deeper?" in RigMatch Chat points people at Odysseus, a separate
 * open-source AI workspace that can use the same Ollama. It is described and
 * linked, never bundled: Odysseus is AGPL and a server you install. These pin
 * that the link can only ever open Odysseus, and that the dialog keeps saying
 * RigMatch is not part of it.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const rust = read('../rigmatch-chat/src-tauri/src/lib.rs');
const app = read('../rigmatch-chat/src/App.tsx');

test('the page cannot make Chat open anything but Odysseus', () => {
  // The command takes a yes/no, never an address.
  assert.match(rust, /fn open_odysseus\(local: bool\) -> Result<\(\), String> \{\s*open_in_browser\(if local \{ ODYSSEUS_LOCAL \} else \{ ODYSSEUS_SITE \}\)/);
  assert.match(rust, /const ODYSSEUS_SITE: &str = "https:\/\/odysseus-dev\.github\.io\/odysseus";/);
  assert.match(rust, /const ODYSSEUS_LOCAL: &str = "http:\/\/localhost:7000";/);
  // open_in_browser is private to the Rust side: only the two commands reach it.
  assert.doesNotMatch(rust, /#\[tauri::command\]\s*(pub )?(async )?fn open_in_browser/);
  for (const command of ['open_odysseus', 'odysseus_running']) {
    assert.match(rust, new RegExp(`generate_handler!\\[[\\s\\S]*\\b${command},[\\s\\S]*\\]\\)`), `${command} is not registered`);
  }
});

test('something else on port 7000 is not mistaken for Odysseus', () => {
  // macOS's AirPlay receiver listens on 7000 as well.
  const probe = rust.slice(rust.indexOf('async fn odysseus_running'), rust.indexOf('pub fn run()'));
  assert.match(probe, /body\.contains\("Odysseus"\)/);
  assert.match(probe, /from_millis\(800\)/, 'opening the dialog must not wait on a slow port');
});

test('the dialog says what Odysseus is, how to connect it, and that RigMatch is not part of it', () => {
  const dialog = app.slice(app.indexOf('{deeperOpen && ('), app.indexOf('{confirmDelete && ('));
  assert.match(dialog, /Want to go deeper\?/);
  assert.match(dialog, /http:\/\/localhost:11434\/v1/);
  assert.match(dialog, /RigMatch is not affiliated with it\./);
  assert.match(dialog, /invoke\("open_odysseus", \{ local: odysseusUp \}\)/);
  assert.doesNotMatch(dialog, /window\.open/, 'a webview window is not the browser');
  assert.match(app, /className="rm-btn rm-btn-link rm-deeper-btn" onClick=\{openDeeper\}>Want to go deeper\?<\/button>/, 'nothing opens the dialog');
});
