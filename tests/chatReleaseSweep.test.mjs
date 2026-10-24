// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lostAttachment, parseStore, serializeStore, startSplit } from '../rigmatch-chat/src/lib/conversationStore.ts';

/**
 * RigMatch Chat fixes from the 0.9.10 pre-release sweep. App.tsx is a React
 * component that needs Tauri to run, so its parts are checked in the source;
 * what could move into a library module is imported and run.
 */

const app = readFileSync(new URL('../rigmatch-chat/src/App.tsx', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../rigmatch-chat/src/styles.css', import.meta.url), 'utf-8');
const rust = readFileSync(new URL('../rigmatch-chat/src-tauri/src/lib.rs', import.meta.url), 'utf-8');
/** The body of one `const name = useCallback(...)` in App.tsx. */
const callback = (name) => {
  const start = app.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} not found in App.tsx`);
  return app.slice(start, app.indexOf('\n  }, [', start));
};
/** The body of one plain `const name = () => {` in App.tsx. */
const handler = (name) => {
  const start = app.indexOf(`const ${name} = () => {`);
  assert.notEqual(start, -1, `${name} not found in App.tsx`);
  return app.slice(start, app.indexOf('\n  };', start));
};

test('a long code line stays inside its half of a chat asking two', () => {
  // An implicit auto column let a 999 px line push the bubble out of a 353 px
  // column, over the other answer and off the window.
  assert.match(css, /\.rm-split-cell \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  // Wide tables scroll inside the bubble and pictures shrink to it, like code.
  assert.match(css, /\.rm-message-md table \{ display: block; max-width: 100%; overflow-x: auto;/);
  assert.match(css, /\.rm-message-md img \{ max-width: 100%;/);
});

test('deleting a chat, or all of them, stops what they were still answering', () => {
  assert.match(callback('deleteConversation'), /stopColumns\(id, \["main", "split"\]\);/);
  const clear = handler('clearAllHistory');
  assert.match(clear, /for \(const controller of Object\.values\(abortRefs\.current\)\) controller\.abort\(\);/);
  assert.match(clear, /setStreaming\(\{\}\);/);
});

test('a question whose attachment did not survive a restart is not asked again without it', () => {
  const asked = { id: 'u1', role: 'user', content: 'What is wrong here?', ts: 1, attachmentName: 'leak.jpg', images: ['QUJD'] };
  assert.equal(lostAttachment(asked), null, 'this session still holds the bytes');
  const chat = { ...startSplit({ id: 'c', modelName: 'a', personalityId: 'p', title: 't', titleIsAuto: true, createdAt: 1, updatedAt: 1, messages: [] }, 'b'), messages: [asked] };
  const reopened = parseStore(serializeStore([chat]), { makeId: String, now: 1, defaultPersonalityId: 'p' })[0];
  assert.equal(lostAttachment(reopened.messages[0]), 'leak.jpg');
  assert.equal(lostAttachment({ id: 'u2', role: 'user', content: 'hi', ts: 1 }), null);
  assert.equal(lostAttachment(null), null);
  // Regenerate skips it, both buttons are disabled, and the reason is shown.
  assert.match(callback('regenerate'), /if \(lostAttachment\(asked\[asked\.length - 1\]\)\) continue;/);
  assert.match(app, /disabled=\{!answering && Boolean\(missing\)\}/);
  assert.match(app, /disabled=\{Boolean\(lostAttachment\(splitView\?\.turns\[splitView\.turns\.length - 1\]\?\.ask\)\)\}/);
  assert.match(app, /\{missing\} is not kept once Chat closes/);
});

test('the second-model picker closes when the open chat changes', () => {
  assert.match(app, /if \(pickerChatKey !== openChatKey\) \{\s*setPickerChatKey\(openChatKey\);\s*setPickingSecond\(false\);\s*\}/);
});

test('Add says why it waits while the open chat is answering', () => {
  assert.match(app, /onClick=\{\(\) => askSecondModel\(chosenSecond\)\}\s*disabled=\{busyHere\}\s*aria-describedby=\{busyHere \? "rm-split-wait" : undefined\}/);
  assert.match(app, /\{busyHere && <span id="rm-split-wait" className="rm-split-wait">Once this answer finishes<\/span>\}/);
});

test('the may-take-turns note measures against usable memory and can be put away', () => {
  assert.match(app, /const usable = kvBudgetFromVram\(vram, 0\) \?\? 0;/);
  assert.match(app, /more than the \$\{formatGib\(usable\)\} of/);
  assert.doesNotMatch(app, /this PC has \$\{formatGib\(vram\.totalBytes\)\}/);
  assert.match(app, /setDismissedFitNotes\(\(prev\) => new Set\(prev\)\.add\(splitFitNote\.key\)\)/);
});

test('deleting a chat asking two counts and names both models', () => {
  assert.match(app, /confirmDelete\.messages\.length \+ \(confirmDelete\.split\?\.messages\.filter\(\(m\) => m\.role !== "user"\)\.length \?\? 0\)/);
  assert.match(app, /\{confirmDelete\.split \? ` and \$\{getDisplayName\(confirmDelete\.split\.modelName\)\}` : ""\}/);
});

test("a link in an answer opens in the system's browser, never in Chat's window", () => {
  assert.match(app, /document\.addEventListener\("click", onLinkClick, true\);/);
  assert.match(app, /event\.preventDefault\(\);\s*const url = new URL\(link\.href, window\.location\.href\);/);
  assert.match(app, /void invoke\("open_link", \{ url: url\.href \}\)/);
  // The Rust side opens web addresses only, and is registered.
  assert.match(rust, /fn web_link\(link: &str\) -> Result<String, String> \{[\s\S]*?matches!\(parsed\.scheme\(\), "http" \| "https"\)/);
  assert.match(rust, /fn open_link\(url: String\) -> Result<\(\), String> \{\s*open_in_browser\(&web_link\(&url\)\?\)\s*\}/);
  assert.match(rust, /open_odysseus,\s*odysseus_running,\s*open_link,/);
});
