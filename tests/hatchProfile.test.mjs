import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildHatchProfile, isValidOllamaPullTag } from '../src/lib/hatchProfile.ts';

// ── isValidOllamaPullTag ────────────────────────────────────────────────────

test('accepts real ollama pull tags', () => {
  for (const tag of ['qwen3:1.7b', 'mistral:7b', 'llama3.2:3b', 'qwen2.5-coder:7b', 'x/flux2-klein:4b', 'gemma2', 'phi3:mini']) {
    assert.equal(isValidOllamaPullTag(tag), true, `${tag} should be valid`);
  }
});

test('rejects non-tags, URLs, injection, and overlong strings', () => {
  assert.equal(isValidOllamaPullTag(''), false);
  assert.equal(isValidOllamaPullTag(null), false);
  assert.equal(isValidOllamaPullTag('has space'), false);
  assert.equal(isValidOllamaPullTag('../etc/passwd'), false);
  assert.equal(isValidOllamaPullTag('http://evil.com/model'), false);
  assert.equal(isValidOllamaPullTag('model;rm -rf'), false);
  assert.equal(isValidOllamaPullTag('a'.repeat(121)), false);
});

// ── fixtures ────────────────────────────────────────────────────────────────

function scoreOf(model, total) {
  return {
    model, total, grade: total >= 92 ? 'S' : total >= 82 ? 'A' : 'B',
    speed: total, sobriety: total, stability: total, fit: total,
    completedAt: '2026-01-01T00:00:00.000Z',
  };
}

const base = { device: 'RTX 3060 · 12 GB', gpuLabel: 'RTX 3060', vramGb: 12, ramGb: 32 };

// ── buildHatchProfile ───────────────────────────────────────────────────────

test('builds a valid profile from the rig pick with the required field', () => {
  const result = buildHatchProfile({
    ...base,
    recommendedTag: 'qwen3:1.7b',
    candidates: [
      { tag: 'qwen3:1.7b', sizeGb: 1.4, score: scoreOf('qwen3:1.7b', 93) },
      { tag: 'qwen2.5:1.5b', sizeGb: 1.0, score: null },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile.source, 'rigmatch');
  assert.equal(result.profile.recommendedLocalModel, 'qwen3:1.7b'); // REQUIRED field
  assert.equal(isValidOllamaPullTag(result.profile.recommendedLocalModel), true);
  assert.equal(result.profile.fallbackModel, 'qwen2.5:1.5b'); // smaller second choice
  assert.equal(result.profile.confidence, 'high'); // 93 -> high
  assert.equal(result.profile.device, 'RTX 3060 · 12 GB');
  assert.ok(result.profile.note.length > 0 && result.profile.note.length <= 200);
  assert.equal(JSON.parse(result.json).recommendedLocalModel, 'qwen3:1.7b'); // JSON round-trips
});

test('falls back to the best candidate when the pick is not Ollama-pullable', () => {
  const result = buildHatchProfile({
    ...base,
    recommendedTag: null, // caller passes null when the pick was LM Studio / cloud
    candidates: [{ tag: 'mistral:7b', sizeGb: 4.1, score: null }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.profile.recommendedLocalModel, 'mistral:7b');
  assert.equal(result.profile.confidence, 'estimated'); // no score
  assert.equal(result.profile.fallbackModel, undefined); // only one candidate
});

test('picks the highest-scoring candidate when no valid pick is given', () => {
  const result = buildHatchProfile({
    ...base,
    recommendedTag: null,
    candidates: [
      { tag: 'llama3.2:3b', sizeGb: 2, score: scoreOf('llama3.2:3b', 80) },
      { tag: 'qwen2.5:7b', sizeGb: 4.7, score: scoreOf('qwen2.5:7b', 91) },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.profile.recommendedLocalModel, 'qwen2.5:7b'); // higher score wins
  assert.equal(result.profile.fallbackModel, 'llama3.2:3b'); // smaller second choice
});

test('rejects a candidate tag that is not a valid ollama pull target', () => {
  const result = buildHatchProfile({
    ...base,
    recommendedTag: 'lmstudio-community/model with space',
    candidates: [{ tag: 'lmstudio-community/model with space', sizeGb: 4, score: null }],
  });
  assert.equal(result.ok, false); // filtered out -> no valid candidate remains
  assert.match(result.reason, /No Ollama chat model/);
});

test('reports a clear reason when there are no candidates', () => {
  const result = buildHatchProfile({ ...base, recommendedTag: null, candidates: [] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /No Ollama chat model/);
});
