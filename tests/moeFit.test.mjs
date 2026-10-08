import test from 'node:test';
import assert from 'node:assert/strict';

const { getHardwareFit, isMixtureOfExperts } = await import('../src/lib/modelCatalog.ts');

const row = (displayName, params, sizeGb) => ({ displayName, params, sizeGb });

test('MoE names are recognised by their active slice or expert count', () => {
  assert.equal(isMixtureOfExperts('qwen3:30b-a3b'), true);
  assert.equal(isMixtureOfExperts('mixtral:8x7b'), true);
  assert.equal(isMixtureOfExperts('qwen3:32b'), false);
  assert.equal(isMixtureOfExperts('llama3.1:70b'), false);
  assert.equal(isMixtureOfExperts(undefined), false);
});

test('a 30B MoE is judged by its size on a 16 GB card, a dense 32B is not', () => {
  const moe = getHardwareFit(row('qwen3:30b-a3b', '30B', 18), 16);
  assert.notEqual(moe.label, 'Too big');
  assert.match(moe.label, /RAM assist/);
  assert.equal(getHardwareFit(row('qwen3:32b', '32B', 20), 16).tone, 'out-of-league');
});

test('an MoE too large for the card is still too big', () => {
  assert.equal(getHardwareFit(row('qwen3:235b-a22b', '235B', 142), 24).tone, 'out-of-league');
  assert.equal(getHardwareFit(row('qwen3:30b-a3b', '30B', 18), 8).tone, 'out-of-league');
});
