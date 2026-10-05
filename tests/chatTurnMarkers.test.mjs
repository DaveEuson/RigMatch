// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cutAtTurnMarker, safeToShow } from '../rigmatch-chat/src/lib/turnMarkers.ts';
import { buildContextMessages } from '../rigmatch-chat/src/lib/compaction.ts';

/**
 * deepseek-ocr:3b in RigMatch Chat answered "How can I assist you today?",
 * then printed "<|im_end|>", then "<|im_start|>system" and RigMatch's own
 * instructions. Its Ollama template is bare, so nothing told it where its turn
 * ended. Chat now cuts a reply at the first such marker and stops there.
 */

const leaked = 'Hi! How can I assist you today?<|im_end|>\n<|im_start|>system\nYou are currently powered by the local Ollama model "deepseek-ocr:3b".';

test('the reply is cut at the first marker, and the leaked turn after it goes', () => {
  assert.deepEqual(cutAtTurnMarker(leaked), { text: 'Hi! How can I assist you today?', ended: true });
  assert.deepEqual(cutAtTurnMarker('Please rephrase it?<|im_end|><|im_end|>'), { text: 'Please rephrase it?', ended: true });
  assert.deepEqual(cutAtTurnMarker('Plain answer.'), { text: 'Plain answer.', ended: false });
  // Other families' markers too.
  assert.equal(cutAtTurnMarker('Done.<|eot_id|><|start_header_id|>user').text, 'Done.');
  assert.equal(cutAtTurnMarker('Done.<end_of_turn>\n<start_of_turn>user').text, 'Done.');
});

test('a tail that could be a marker still arriving waits for the next token', () => {
  assert.equal(safeToShow('Hello <|im_'), 'Hello '.length);
  assert.equal(safeToShow('Hello <'), 'Hello '.length);
  assert.equal(safeToShow('Hello world'), 'Hello world'.length);
  // A "<" that cannot start a marker is shown.
  assert.equal(safeToShow('if a <b then'), 'if a <b then'.length);
});

test('a reply saved with a leaked marker is not sent back to the model', () => {
  const sent = buildContextMessages([
    { id: '1', role: 'user', content: 'Hello', ts: 1 },
    { id: '2', role: 'assistant', content: leaked, ts: 2 },
  ], undefined, 0);
  assert.equal(sent[1].content, 'Hi! How can I assist you today?');
});

test('the stream cuts and stops at a marker, and saved replies display cut', () => {
  const api = readFileSync(new URL('../rigmatch-chat/src/lib/ollamaApi.ts', import.meta.url), 'utf-8');
  assert.match(api, /const cut = cutAtTurnMarker\(received\);\s*if \(cut\.ended\) \{[\s\S]*?invoke\("cancel_chat", \{ streamId \}\)/);
  const app = readFileSync(new URL('../rigmatch-chat/src/App.tsx', import.meta.url), 'utf-8');
  assert.match(app, /renderMarkdown\(cutAtTurnMarker\(msg\.content\)\.text\)/);
});
