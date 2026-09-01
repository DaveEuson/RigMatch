// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { getCountryCode, getModelOrigin } = await import('../src/lib/modelOrigins.ts');

/**
 * Where a model was made, beside who made it.
 *
 * Deliberately two letters and not a flag emoji. Measured in this app's own
 * runtime on Windows 11: the seven flags for the countries below rendered as
 * "US CN FR CA KR AE SG" — Chromium has no flag glyphs there and falls back to
 * the two regional-indicator letters a flag is built from. Emoji flags would be
 * letter pairs for most people running this, so the letters are drawn on
 * purpose rather than arrived at by accident.
 */

test('every country the origins table can return is either coded or deliberately not', () => {
  // The guard that matters: a new maker added with a new country should show
  // up here rather than silently rendering no badge.
  const countries = new Set();
  for (const model of [
    'deepseek-r1:7b', 'qwen2.5:7b', 'mistral:7b', 'llama3.2:3b', 'gemma3:4b', 'phi3:mini',
    'granite3.2:8b', 'starcoder2:3b', 'aya:8b', 'yi:6b', 'smollm:1.7b', 'falcon:7b',
    'solar:10.7b', 'neural-chat:7b', 'wizardlm:7b', 'openhermes:7b', 'dolphin:7b',
    'llava:7b', 'moondream:2b', 'minicpm:2b', 'tinyllama:1.1b', 'orca-mini:3b', 'vicuna:7b',
    'totally-unknown-model:1b',
  ]) countries.add(getModelOrigin(model).country);

  const uncoded = [...countries].filter((c) => getCountryCode(c) === null);
  // Only these two may go uncoded, because neither is a country.
  assert.deepEqual(uncoded.sort(), ['International', 'Unknown']);
});

test('the codes are the real ones', () => {
  assert.equal(getCountryCode('United States'), 'US');
  assert.equal(getCountryCode('China'), 'CN');
  assert.equal(getCountryCode('France'), 'FR');
  assert.equal(getCountryCode('Canada'), 'CA');
  assert.equal(getCountryCode('South Korea'), 'KR');
  assert.equal(getCountryCode('United Arab Emirates'), 'AE');
  assert.equal(getCountryCode('Singapore'), 'SG');
});

test('a non-country gets no badge rather than an invented one', () => {
  // "International" and "Unknown" are real answers. A made-up code for either
  // would be worse than showing nothing.
  assert.equal(getCountryCode('International'), null);
  assert.equal(getCountryCode('Unknown'), null);
});

test('junk in gives nothing out rather than throwing', () => {
  assert.equal(getCountryCode(''), null);
  assert.equal(getCountryCode('  '), null);
  assert.equal(getCountryCode(undefined), null);
  assert.equal(getCountryCode('Atlantis'), null);
});

test('surrounding whitespace does not lose a real country', () => {
  assert.equal(getCountryCode('  France  '), 'FR');
});

test('every code is exactly two uppercase letters', () => {
  for (const country of ['United States', 'China', 'France', 'Canada', 'South Korea', 'United Arab Emirates', 'Singapore']) {
    assert.match(getCountryCode(country), /^[A-Z]{2}$/, country);
  }
});

test('a model and its variants report the same origin', () => {
  // The family row shows this once for the whole group, which is only honest
  // if every version under it agrees.
  const a = getModelOrigin('gemma4:e2b');
  const b = getModelOrigin('gemma4:12b');
  assert.equal(a.organization, b.organization);
  assert.equal(a.country, b.country);
  assert.equal(getCountryCode(a.country), 'US');
});

// --- when the maker and the model name disagree ------------------------------

const { getDisplayCountry, getCountryForOrganization } = await import('../src/lib/modelOrigins.ts');

test('a publisher the model name does not recognise still gets its country', () => {
  // "T5-XXL text encoder (fp8)" matches no family, so the name lookup returns
  // Unknown — while the row displayed "Google" as the maker from the catalogue
  // and then had nothing to say about where. Two sources, one row.
  assert.equal(getModelOrigin('T5-XXL text encoder (fp8)').country, 'Unknown');
  assert.equal(getDisplayCountry('T5-XXL text encoder (fp8)', 'Google'), 'United States');
});

test('the model name wins when it knows, because it is the more specific match', () => {
  assert.equal(getDisplayCountry('qwen2.5:7b', 'Some Reseller'), 'China');
});

test('a publisher nobody has heard of gets no country rather than a guess', () => {
  assert.equal(getDisplayCountry('mystery-model:1b', 'Acme Models Inc'), null);
});

test('no publisher and no match is null, not the string "Unknown"', () => {
  // Null is what the badge checks. Returning "Unknown" would render a badge
  // reading nothing useful.
  assert.equal(getDisplayCountry('mystery-model:1b'), null);
});

test('every organisation named here is one getModelOrigin already returns', () => {
  // The point of this map is the same facts keyed the other way round, not a
  // second place where countries get invented.
  const known = new Set();
  for (const model of [
    'deepseek-r1:7b', 'qwen2.5:7b', 'mistral:7b', 'llama3.2:3b', 'gemma3:4b', 'phi3:mini',
    'granite3.2:8b', 'starcoder2:3b', 'aya:8b', 'yi:6b', 'smollm:1.7b', 'falcon:7b',
    'solar:10.7b', 'neural-chat:7b', 'openhermes:7b', 'dolphin:7b', 'llava:7b',
    'moondream:2b', 'minicpm:2b', 'tinyllama:1.1b', 'vicuna:7b',
  ]) known.add(getModelOrigin(model).organization);
  known.add('Alibaba'); // the catalogue's shorter spelling of Alibaba Cloud

  for (const org of ['Google', 'Meta', 'Microsoft', 'IBM', 'DeepSeek', 'Mistral AI', 'Cohere', 'TII', 'Upstage']) {
    assert.ok(known.has(org), `${org} is not an organisation getModelOrigin returns`);
    assert.ok(getCountryForOrganization(org), `${org} has no country`);
  }
});

test('an organisation and a model of theirs agree on the country', () => {
  const origin = getModelOrigin('gemma3:4b');
  assert.equal(getCountryForOrganization(origin.organization), origin.country);
});
