// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The image and video judge asks a vision model for one word, with a 24-token
 * budget. A thinking model given that spends all 24 tokens thinking and answers
 * with nothing — qwen3.5:9b did, on every frame of a live three-model lineup,
 * and every run came back unjudged. Two halves had to agree for the fix to land:
 * the judge asks for no thinking, and the bridge passes that on to the endpoint
 * the judge actually uses.
 */

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('the frame judge asks a thinking model not to think', () => {
  const judge = between(source('../src/lib/imageGenRunner.ts'), 'export function createOllamaJudge', 'export type ImageChallengeOptions');
  assert.match(judge, /think:\s*false/);
});

test('the generate bridge passes the thinking toggle to /api/generate, not only to chat', () => {
  const generate = between(source('../electron/main.cjs'), 'async function runAdvancedGenerate', 'async function streamAdvancedGenerate');
  assert.match(generate, /body\.think = request\.think/, 'the toggle reaches the generate body');
  assert.match(generate, /isUnsupportedThinkError\(error\)/, 'an Ollama that refuses the toggle is asked again without it');
});
