// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// settings.ts keeps its blob in the page's localStorage, which Node lacks.
const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => { stored.set(key, String(value)); },
  removeItem: (key) => { stored.delete(key); },
  clear: () => { stored.clear(); },
};

const { PERSONALITY_INSTRUCTIONS_MAX_CHARS, loadSettings, saveSettings } = await import('../rigmatch-chat/src/lib/settings.ts');

const chat = readFileSync(new URL('../rigmatch-chat/src/App.tsx', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

const saveProfile = (instructions) => {
  const settings = loadSettings();
  saveSettings({
    ...settings,
    activePersonalityId: 'custom-long',
    personalityProfiles: [...settings.personalityProfiles, { id: 'custom-long', name: 'Long', instructions }],
  });
  return loadSettings().personalityProfiles.find((profile) => profile.id === 'custom-long')?.instructions;
};

test('the instructions box stops where saving stops, and says so', () => {
  // The box took any length and the open session used all of it, but
  // saveSettings kept only the first 4,000 characters, so after a restart the
  // end of a long personality was gone without a word.
  assert.equal(typeof PERSONALITY_INSTRUCTIONS_MAX_CHARS, 'number', 'one limit, shared by the box and the save');
  const start = chat.indexOf('<span>Personality instructions</span>');
  assert.ok(start > 0, 'the instructions box moved');
  const box = chat.slice(start, chat.indexOf('</label>', start));
  assert.match(box, /<textarea[\s\S]*maxLength=\{PERSONALITY_INSTRUCTIONS_MAX_CHARS\}/, 'the box takes no more than is saved');
  assert.match(
    box,
    /\{personalityEditor\.instructions\.length >= PERSONALITY_INSTRUCTIONS_MAX_CHARS && \(\s*<em>[^<]*\{PERSONALITY_INSTRUCTIONS_MAX_CHARS\.toLocaleString\(\)\}[^<]*<\/em>/,
    'a note says the limit was reached',
  );
});

test('whatever the box can hold is saved whole; only a longer stored value is trimmed', () => {
  assert.equal(typeof PERSONALITY_INSTRUCTIONS_MAX_CHARS, 'number');
  const full = `${'a'.repeat(PERSONALITY_INSTRUCTIONS_MAX_CHARS - 3)}END`;
  assert.equal(saveProfile(full), full, 'kept to the last character');

  // The cap in saveSettings stays as a safety net for a hand-edited blob.
  const over = `${'b'.repeat(PERSONALITY_INSTRUCTIONS_MAX_CHARS)}LOST`;
  assert.equal(saveProfile(over).length, PERSONALITY_INSTRUCTIONS_MAX_CHARS);
});
