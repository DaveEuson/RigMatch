import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTO_CONTEXT_CEILING,
  CONTEXT_STEPS,
  DEFAULT_KV_BUDGET_BYTES,
  OLLAMA_DEFAULT_CONTEXT,
  chooseContextSize,
  estimateTokens,
  formatContextSize,
  formatGib,
  getContextUsage,
  kvBudgetFromVram,
  kvBytesPerToken,
  kvCacheBytes,
} from '../rigmatch-chat/src/lib/contextWindow.ts';

/**
 * RigMatch Chat sent no `options` block, so every model ran at Ollama's default
 * 4096 tokens. Measured against a live Ollama 0.32.7: a 5602-token conversation
 * came back with prompt_eval_count 82 — the middle silently discarded, the
 * passcode from turn one gone, while the transcript still showed every message.
 *
 * The metadata below was read from `/api/show` on real installed models, not
 * invented, so these numbers are the ones the sizing actually has to handle.
 */
const MODELS = {
  // Supports 131072 but its KV cache is expensive: 112 KiB per token.
  'llama3.2:3b': { maxContext: 131072, blockCount: 28, headCountKv: 8, keyLength: 128, valueLength: 128 },
  // Cheap KV (12 KiB/token) — its own 32768 limit binds before any budget does.
  'qwen2.5:0.5b': { maxContext: 32768, blockCount: 24, headCountKv: 2, keyLength: 64, valueLength: 64 },
  'qwen2.5:7b': { maxContext: 32768, blockCount: 28, headCountKv: 4, keyLength: 128, valueLength: 128 },
};

test('KV cost per token comes from the model metadata, not the parameter count', () => {
  // 28 layers x 8 KV heads x (128 + 128) x 2 bytes for f16.
  assert.equal(kvBytesPerToken(MODELS['llama3.2:3b']), 114688);
  assert.equal(kvBytesPerToken(MODELS['qwen2.5:0.5b']), 12288);
  // A 7B model with fewer KV heads is *cheaper* per token than the 3B above,
  // which is exactly why this cannot be guessed from model size.
  assert.equal(kvBytesPerToken(MODELS['qwen2.5:7b']), 57344);
});

test('every model gets more memory than the 4096 it had, without blowing the budget', () => {
  const chosen = Object.fromEntries(
    Object.entries(MODELS).map(([name, info]) => [name, chooseContextSize(info)]),
  );

  assert.deepEqual(chosen, {
    'llama3.2:3b': 16384,   // 32768 would cost 3.5 GiB of KV, over budget
    'qwen2.5:0.5b': 32768,  // cheap KV, so it reaches its own maximum
    'qwen2.5:7b': 32768,    // 1.75 GiB, just inside budget
  });

  for (const [name, size] of Object.entries(chosen)) {
    assert.ok(size > OLLAMA_DEFAULT_CONTEXT, `${name} should improve on the default`);
    assert.ok(
      kvCacheBytes(MODELS[name], size) <= DEFAULT_KV_BUDGET_BYTES,
      `${name} KV cache must stay inside the budget`,
    );
  }
});

test('the model’s own limit is never exceeded', () => {
  // Asking past what a model declares is clamped by Ollama anyway, and would
  // make the meter promise memory that does not exist.
  for (const [name, info] of Object.entries(MODELS)) {
    assert.ok(chooseContextSize(info) <= info.maxContext, `${name} exceeded its declared maximum`);
  }
  // A model that supports less than Ollama's default keeps its own smaller one.
  const tiny = { maxContext: 2048, blockCount: 12, headCountKv: 2, keyLength: 64, valueLength: 64 };
  assert.equal(chooseContextSize(tiny), 2048);
});

test('a cheap model still stops at the automatic ceiling', () => {
  // Free memory is not free: prompt processing slows as the window grows, so
  // going beyond the ceiling should be a deliberate choice in Settings.
  const cheapAndHuge = { maxContext: 1_000_000, blockCount: 4, headCountKv: 1, keyLength: 32, valueLength: 32 };
  assert.equal(chooseContextSize(cheapAndHuge), AUTO_CONTEXT_CEILING);
});

test('missing or broken metadata falls back rather than dividing by zero', () => {
  assert.equal(chooseContextSize(null), OLLAMA_DEFAULT_CONTEXT);
  assert.equal(chooseContextSize({ maxContext: 0, blockCount: 0, headCountKv: 0, keyLength: 0, valueLength: 0 }), OLLAMA_DEFAULT_CONTEXT);
  // Zero-cost metadata must not be read as "everything fits" — the ceiling and
  // the model's own maximum still apply.
  const noCost = { maxContext: 131072, blockCount: 0, headCountKv: 0, keyLength: 0, valueLength: 0 };
  assert.equal(chooseContextSize(noCost), AUTO_CONTEXT_CEILING);
});

test('a tighter budget steps the context down instead of failing', () => {
  const info = MODELS['llama3.2:3b'];
  const half = DEFAULT_KV_BUDGET_BYTES / 2;      // 1 GiB
  assert.equal(chooseContextSize(info, half), 8192);
  const tiny = 64 * 1024 * 1024;                  // 64 MiB, smaller than one step
  assert.equal(chooseContextSize(info, tiny), OLLAMA_DEFAULT_CONTEXT);
});

test('usage reports truncation before it happens, not after', () => {
  // The old failure was silent: Ollama dropped the middle of the conversation
  // and nothing in the app knew. Headroom is reserved for the reply, because a
  // prompt that exactly fills the window leaves nothing to answer with.
  const roomy = getContextUsage(1000, 16384);
  assert.equal(roomy.willTruncate, false);
  assert.equal(roomy.nearLimit, false);

  const tight = getContextUsage(15_500, 16384);
  assert.equal(tight.willTruncate, true, 'within reply headroom of the limit');
  assert.equal(tight.nearLimit, true);

  assert.equal(getContextUsage(12_288, 16384).nearLimit, true, '75% should warn');
  assert.equal(getContextUsage(12_287, 16384).nearLimit, false);

  // Over the limit clamps rather than reporting a bar wider than the track.
  assert.equal(getContextUsage(99_999, 16384).fraction, 1);
  assert.equal(getContextUsage(0, 0).limit, OLLAMA_DEFAULT_CONTEXT);
});

/** Real figures: an RTX 4070's 12282 MiB, and weights from `/api/tags`. */
const RTX_4070 = { totalBytes: 12282 * 1024 * 1024, unified: false };
const WEIGHTS = {
  'llama3.2:3b': 2_019_393_189,
  'qwen2.5:7b': 4_683_087_332,
  'granite4:3b': 2_099_521_385,
};

test('a real card lifts the context above the hardware-blind default', () => {
  // The fixed 2 GiB budget knew nothing about the machine, so it was miserly on
  // a big card: llama3.2:3b was held at 16384 when 32768 was measured to sit
  // entirely on this GPU at 5.98 GB.
  const info = MODELS['llama3.2:3b'];
  const blind = chooseContextSize(info);
  const aware = chooseContextSize(info, kvBudgetFromVram(RTX_4070, WEIGHTS['llama3.2:3b']));

  assert.equal(blind, 16384);
  assert.equal(aware, 32768);
  assert.ok(aware > blind, 'knowing the hardware should never make it smaller here');
});

test('the weights come out of the same pool as the context', () => {
  // A flat byte budget cannot express this: on one card a 7B leaves far less
  // room for context than a 3B, and granite4 costs 400 KiB per token because it
  // publishes no grouped-query metadata.
  const budget = (model) => kvBudgetFromVram(RTX_4070, WEIGHTS[model]);
  const smaller = budget('llama3.2:3b');
  const larger = budget('qwen2.5:7b');
  assert.ok(larger < smaller, 'heavier weights must leave less room for KV');

  // granite4 was stuck at the 4096 default under the flat budget.
  const granite = { maxContext: 131072, blockCount: 40, headCountKv: 40, keyLength: 64, valueLength: 64 };
  assert.equal(chooseContextSize(granite), OLLAMA_DEFAULT_CONTEXT);
  assert.equal(chooseContextSize(granite, budget('granite4:3b')), 16384);
});

test('a smaller card steps the context down rather than spilling to the CPU', () => {
  // Overshooting does not fail loudly, it moves layers onto the CPU and the
  // model crawls — so the budget has to shrink with the card.
  const info = MODELS['llama3.2:3b'];
  const card = (mib) => chooseContextSize(info, kvBudgetFromVram({ totalBytes: mib * 1024 * 1024, unified: false }, WEIGHTS['llama3.2:3b']));

  assert.equal(card(12282), 32768); // RTX 4070
  assert.equal(card(8192), 32768);  // 8 GB
  assert.equal(card(6144), 16384);  // 6 GB
  assert.equal(card(4096), 8192);   // 4 GB
  // A card that cannot even hold the weights gets the floor, never less.
  assert.equal(card(2048), OLLAMA_DEFAULT_CONTEXT);
});

test('unified memory keeps more back, because the OS is living in it too', () => {
  const info = MODELS['llama3.2:3b'];
  const bytes = 16 * 1024 * 1024 * 1024;
  const dedicated = kvBudgetFromVram({ totalBytes: bytes, unified: false }, WEIGHTS['llama3.2:3b']);
  const unified = kvBudgetFromVram({ totalBytes: bytes, unified: true }, WEIGHTS['llama3.2:3b']);
  assert.ok(unified < dedicated, 'shared memory must reserve more than a dedicated card');
  assert.equal(chooseContextSize(info, unified), 32768, '16 GB of unified memory still comfortably clears the ceiling');
});

test('unknown hardware falls back instead of guessing', () => {
  // No NVIDIA card and not a Mac: the caller keeps the fixed budget rather than
  // sizing a KV cache against a number nothing could check.
  assert.equal(kvBudgetFromVram(null, 2e9), null);
  assert.equal(kvBudgetFromVram({ totalBytes: 0, unified: false }, 2e9), null);
  assert.equal(chooseContextSize(MODELS['llama3.2:3b'], undefined), 16384);
  // null in particular: it is what kvBudgetFromVram returns on unknown
  // hardware, and a default parameter does not fill in for it. Compared as a
  // number it is zero, so every size would look unaffordable and every model
  // would drop back to 4096 — the exact bug this whole change exists to fix.
  assert.equal(chooseContextSize(MODELS['llama3.2:3b'], null), 16384);
});

test('token estimates are only for text not yet sent', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
});

test('sizes read the way people say them', () => {
  assert.equal(formatContextSize(16384), '16K');
  assert.equal(formatContextSize(131072), '128K');
  assert.equal(formatContextSize(1234), '1,234');
  assert.equal(formatGib(1_879_048_192), '1.8 GB'); // 1.75 GiB, rounded for display
  assert.equal(formatGib(50 * 1024 * 1024), '50 MB');
});

test('the offered steps are ordered and reach the largest common context', () => {
  assert.deepEqual([...CONTEXT_STEPS], [...CONTEXT_STEPS].sort((a, b) => a - b));
  assert.equal(CONTEXT_STEPS[0], OLLAMA_DEFAULT_CONTEXT);
  assert.ok(CONTEXT_STEPS.includes(131072));
});
