import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { licenseLinksForModels, modelFamilyName } from '../src/lib/modelLicenses.ts';

/**
 * The download consent dialog is the app's only legal gate: it asks the user to
 * confirm they understand the models' terms, and links to them.
 *
 * It shipped with a fixed list, so downloading DeepSeek showed Gemma's terms,
 * Gemma's prohibited-use policy and the Gemma 3 licence — three documents that
 * do not apply, and none that do. These tests are about that dialog telling the
 * truth about what is being downloaded.
 */

const hrefs = (models) => licenseLinksForModels(models).map((link) => link.href);
const labels = (models) => licenseLinksForModels(models).map((link) => link.label);

test('a model gets its own terms, not another family’s', () => {
  const shown = hrefs(['deepseek-r1:7b']);
  assert.ok(shown.includes('https://ollama.com/library/deepseek-r1'),
    'DeepSeek should link to its own licence');
  assert.ok(!shown.some((href) => href.includes('gemma')),
    'Gemma terms must not appear when Gemma is not being downloaded');
});

test('Gemma still gets its prohibited-use policy, because that one really applies', () => {
  const shown = hrefs(['gemma3:4b']);
  assert.ok(shown.includes('https://ai.google.dev/gemma/prohibited_use_policy'));
  assert.ok(shown.includes('https://ai.google.dev/gemma/terms'));
});

test('the provider doing the downloading is always named', () => {
  // Ollama performs the download whatever the model is, so its terms apply to
  // every case including the empty one.
  for (const models of [[], ['gemma3:4b'], ['deepseek-r1:7b', 'phi3:mini']]) {
    assert.ok(hrefs(models).includes('https://ollama.com/terms'));
  }
});

test('a mixed lineup shows every family once and no duplicates', () => {
  const shown = hrefs(['gemma3:4b', 'gemma3:12b', 'deepseek-r1:7b', 'phi3:mini', 'phi3:medium']);
  assert.equal(new Set(shown).size, shown.length, 'a repeated link is noise on a consent dialog');
  assert.ok(shown.includes('https://ollama.com/library/deepseek-r1'));
  assert.ok(shown.includes('https://ollama.com/library/phi3'));
  assert.ok(shown.includes('https://ai.google.dev/gemma/terms'));
});

test('tags and registry prefixes resolve to the same family', () => {
  assert.equal(modelFamilyName('qwen2.5-coder:7b'), 'qwen2.5-coder');
  assert.equal(modelFamilyName('lmstudio-community/qwen2.5-coder-7b-instruct'), 'qwen2.5-coder-7b-instruct');
  assert.equal(modelFamilyName('gemma3:4b'), 'gemma3');
});

test('a model name cannot break out of the library URL', () => {
  // Model names arrive from a remote catalogue and from Ollama's own tag list,
  // so a name with a slash or a space must not build a link to somewhere else.
  const shown = hrefs(['../../evil:7b', 'weird name:1b']);
  for (const href of shown) {
    assert.ok(href.startsWith('https://ollama.com/') || href.startsWith('https://ai.google.dev/'),
      `${href} left the allowed hosts`);
  }
  assert.ok(!shown.some((href) => href.includes('../')), 'path traversal survived into a link');
});

test('every host used is one the app is allowed to open', () => {
  // A link to a host outside ALLOWED_EXTERNAL_HOSTS opens nothing at all, which
  // on this dialog means terms the user is told to read and cannot.
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const allowlist = main.match(/ALLOWED_EXTERNAL_HOSTS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
  const allowed = [...allowlist.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  const models = ['gemma3:4b', 'deepseek-r1:7b', 'llama3.2:3b', 'mistral:7b', 'phi3:mini'];
  for (const link of licenseLinksForModels(models)) {
    const host = new URL(link.href).hostname;
    assert.ok(allowed.includes(host), `${host} is not in ALLOWED_EXTERNAL_HOSTS, so "${link.label}" is a dead link`);
  }
});

test('every link is https', () => {
  for (const link of licenseLinksForModels(['gemma3:4b', 'deepseek-r1:7b'])) {
    assert.ok(link.href.startsWith('https://'), `${link.href} is not https`);
  }
});

test('labels name the thing being linked', () => {
  // "Gemma terms" next to a DeepSeek download was readable and wrong; a label
  // that does not name its model is how that happens.
  assert.ok(labels(['deepseek-r1:7b']).some((label) => label.toLowerCase().includes('deepseek-r1')));
});
