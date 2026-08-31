// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { getModelTag, describeModelTag, summariseModelTag, compareModelTags } = await import('../src/lib/modelVariants.ts');

/**
 * "Why is one of these better than the other, and what does e2b even stand
 * for" is the first question a real user asks about two rows of the same
 * family, and the app had no answer: getModelProfile matches on the family
 * name, so every variant returned the same archetype and the same colour.
 */

const kinds = (name) => describeModelTag(name).map((fact) => fact.kind);
const labels = (name) => describeModelTag(name).map((fact) => fact.label);

test('the tag is whatever follows the colon', () => {
  assert.equal(getModelTag('gemma4:e2b'), 'e2b');
  assert.equal(getModelTag('qwen2.5-coder:7b'), '7b');
  assert.equal(getModelTag('lmstudio-community/qwen2.5-coder-7b-instruct:q4_k_m'), 'q4_k_m');
});

test('an untagged name is the latest tag, not an empty one', () => {
  assert.equal(getModelTag('gemma4'), 'latest');
  assert.equal(getModelTag(''), 'latest');
});

test('e2b is read as effective, not as two billion', () => {
  // The whole reason this module exists. "2b" is true of the string and false
  // of the model: an E2B needs a 2B model's memory and has far more behind it.
  assert.deepEqual(kinds('gemma4:e2b'), ['effective']);
  assert.deepEqual(labels('gemma4:e2b'), ['Effective 2B']);
  assert.match(describeModelTag('gemma4:e2b')[0].plain, /effective/i);
});

test('e4b too, and it says four rather than two', () => {
  assert.deepEqual(labels('gemma4:e4b'), ['Effective 4B']);
});

test('a plain size is still a plain size', () => {
  assert.deepEqual(labels('gemma4:12b'), ['12B']);
  assert.deepEqual(kinds('llama3.2:3b'), ['params']);
});

test('a decimal size survives', () => {
  assert.deepEqual(labels('qwen2.5:1.5b'), ['1.5B']);
});

test('millions are not read as billions', () => {
  assert.deepEqual(labels('gemma3:270m'), ['270M']);
});

test('the e rule wins over the plain-size rule, not the other way round', () => {
  // Ordering bug bait: /(\d+)b/ matches "2b" inside "e2b" perfectly well.
  const facts = describeModelTag('gemma4:e2b');
  assert.equal(facts.length, 1);
  assert.equal(facts[0].kind, 'effective');
});

test('compression is decoded, and Q4 is the one it recommends', () => {
  const facts = describeModelTag('mistral:7b-instruct-q4_k_m');
  const quant = facts.find((fact) => fact.kind === 'quant');
  assert.equal(quant.label, 'Q4');
  assert.match(quant.plain, /most people/i);
});

test('an unsqueezed copy says so rather than saying nothing', () => {
  assert.ok(labels('gemma4:12b-fp16').includes('Full size'));
});

test('instruction-tuned is called out, including Google’s bare -it', () => {
  assert.ok(kinds('mistral:7b-instruct').includes('tuning'));
  assert.ok(kinds('gemma4:12b-it').includes('tuning'));
});

test('a base model warns that it is not the one you want', () => {
  const facts = describeModelTag('llama3.1:8b-base');
  const tuning = facts.find((fact) => fact.kind === 'tuning');
  assert.match(tuning.plain, /not the one you want/i);
});

test('stripped guardrails are stated plainly, not softened', () => {
  const facts = describeModelTag('llama2:7b-uncensored');
  const guard = facts.find((fact) => fact.kind === 'guardrails');
  assert.ok(guard);
  assert.match(guard.plain, /refusals/i);
});

test('a tag with nothing to say summarises to nothing, not to an empty string', () => {
  assert.equal(summariseModelTag('someone/mystery-model'), null);
});

test('the summary is chip-sized and ordered', () => {
  assert.equal(summariseModelTag('mistral:7b-instruct-q4_k_m'), '7B · Q4 · Instruction-tuned');
});

// --- comparing two variants ------------------------------------------------

test('comparing lists only what actually differs', () => {
  const diff = compareModelTags('gemma4:e2b', 'gemma4:e4b');
  assert.deepEqual(diff, [{ kind: 'effective', left: 'Effective 2B', right: 'Effective 4B' }]);
});

test('two identical tags differ in nothing', () => {
  assert.deepEqual(compareModelTags('gemma4:12b', 'gemma4:12b'), []);
});

test('a trait only one side has still counts as a difference', () => {
  const diff = compareModelTags('gemma4:12b', 'gemma4:12b-q4_k_m');
  assert.deepEqual(diff, [{ kind: 'quant', left: null, right: 'Q4' }]);
});

test('an effective model against a plain one is a real difference, not a tie', () => {
  // Both "look like" 4B. Reporting no difference here would be the original bug
  // wearing a new hat.
  const diff = compareModelTags('gemma4:e4b', 'gemma3:4b');
  const kindsSeen = diff.map((entry) => entry.kind);
  assert.ok(kindsSeen.includes('effective'));
  assert.ok(kindsSeen.includes('params'));
});
