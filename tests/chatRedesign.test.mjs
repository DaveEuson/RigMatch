// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/**
 * RigMatch Chat in the redesign's look: the same faces, icons and stage colors
 * as RigMatch, a header with Light mode and Back to RigMatch, a "Chats" list
 * of buddy rows, a thread header with a More menu, and memory beside the
 * thread rather than inside Settings.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const chat = read('../rigmatch-chat/src/App.tsx');
const css = read('../rigmatch-chat/src/styles.css');

test('Chat draws with the same icons as RigMatch, copied rather than redrawn', () => {
  assert.equal(
    read('../rigmatch-chat/src/lib/uiIconArt.ts'),
    read('../src/components/icons/uiIconArt.ts'),
    'the chat copy of the icon art has drifted from RigMatch\'s',
  );
});

test('Chat ships the three faces offline, with their licences', () => {
  const fonts = readdirSync(new URL('../rigmatch-chat/src/assets/fonts', import.meta.url));
  assert.deepEqual(fonts.sort(), readdirSync(new URL('../src/assets/fonts', import.meta.url)).sort());
  assert.match(read('../rigmatch-chat/src/main.tsx'), /import "\.\/fonts\.css";\nimport "\.\/styles\.css";/);
  for (const face of ['YoungSerif', 'AtkinsonHyperlegible', 'SplineSansMono']) {
    assert.ok(existsSync(new URL(`../rigmatch-chat/public/licenses/fonts/${face}-OFL.txt`, import.meta.url)), `${face} licence missing`);
  }
});

test('the stage colors match RigMatch\'s themes, and light mode is its own switch', () => {
  const settings = read('../rigmatch-chat/src/lib/settings.ts');
  for (const id of ['plum', 'avocado', 'mustard', 'teal', 'chocolate']) assert.match(settings, new RegExp(`id: "${id}"`));
  // An unknown stored stage falls back rather than painting nothing.
  assert.match(settings, /STAGES\.some\(\(entry\) => entry\.id === settings\.stage\) \? settings\.stage : "plum"/);
  const appCss = read('../src/index.css');
  for (const id of ['avocado', 'mustard', 'teal', 'chocolate']) {
    const mine = css.match(new RegExp(`\\[data-stage="${id}"\\] \\{ --bg: (#[0-9a-f]{6})`))?.[1];
    const theirs = appCss.match(new RegExp(`\\[data-theme="${id}"\\] \\{\\s*--bg: (#[0-9a-f]{6})`))?.[1];
    assert.ok(mine && theirs && mine === theirs, `${id}: chat ${mine} vs app ${theirs}`);
  }
  assert.match(css, /\[data-chat-light\] \{/);
  assert.match(chat, /onClick=\{\(\) => updateLook\(\{ theme: settings\.theme === "light" \? "dark" : "light" \}\)\}/);
});

test('Send is the gold button, and the header still moves and closes the frameless window', () => {
  assert.match(chat, /className="rm-btn rm-btn-gold rm-send-btn"/);
  assert.match(chat, /<header className="rm-header" data-tauri-drag-region>/);
  assert.match(chat, /getCurrentWindow\(\)\.minimize\(\)/);
  assert.match(chat, /writerRef\.current\?\.flush\(\)\.finally\(\(\) => getCurrentWindow\(\)\.close\(\)\)/);
});

test('no emoji stand in for words', () => {
  // Medals, stars, lightning and the coffee cup said things a newcomer had to decode.
  assert.doesNotMatch(chat, /[\u{1F300}-\u{1FAFF}⭐⚡☕]/u);
});

test('the thread\'s actions are in More, and memory sits beside the thread', () => {
  const more = chat.slice(chat.indexOf('<div className="rm-more-menu" role="menu">'), chat.indexOf('{/* What it remembers about you'));
  for (const item of ['What it remembers', 'Edit this personality', 'New personality', 'Delete this chat']) {
    assert.ok(more.includes(item), `More has no "${item}"`);
  }
  assert.match(more, /CHAT_TESTS/);
  assert.match(chat, /<aside className="rm-memory-panel"/);
  // Settings points there rather than keeping a second editor.
  const settings = chat.slice(chat.indexOf('{/* ── Settings Modal'));
  assert.doesNotMatch(settings, /rm-memory-row/);
});

test('the sidebar becomes an overlay behind "Chats" on a narrow window', () => {
  assert.match(css, /@media \(max-width: 920px\) \{[\s\S]*\.rm-chats-btn \{ display: inline-flex; \}/);
  assert.match(chat, /className=\{sidebarOpen \? "rm-buddy-panel open" : "rm-buddy-panel"\}/);
});
