// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AJAX_LINES, TROJAN_HOST_COPY, ajaxHostLine, isStockQwen35_9b } from '../src/lib/trojanStage.ts';
import { getHostBanter } from '../src/lib/hostBanter.ts';
import { resolveStage } from '../src/lib/showExtras.ts';

/**
 * The host's lines for Ajax and the Trojan stage. Each Ajax line is about
 * something true on stage right now, and none of them borrow a real person's
 * name or catchphrase.
 */

const lineup = ['ajax-qwen35', 'qwen3.5:9b', 'llama3.2:3b'];

test('Ajax and the model it came from make a family reunion, and nobody else does', () => {
  for (const step of ['pick', 'download', 'compare']) {
    assert.equal(ajaxHostLine({ step, lineup }), AJAX_LINES.family, step);
  }
  assert.equal(ajaxHostLine({ step: 'setup', lineup }), null);
  assert.equal(ajaxHostLine({ step: 'pick', lineup: ['ajax-qwen35', 'qwen3:8b'] }), null);
  assert.equal(ajaxHostLine({ step: 'pick', lineup: ['ajax-qwen35', 'qwen3.5:4b'] }), null);
  assert.equal(ajaxHostLine({ step: 'pick', lineup: ['qwen3.5:9b', 'llama3.2:3b'] }), null);
  assert.ok(isStockQwen35_9b('Qwen3.5-9B'));
  assert.ok(!isStockQwen35_9b('ajax-qwen35-9b'), 'Ajax is not its own base model');
});

test('making up the landlord\'s address gets the emails line, a refusal of tools does not', () => {
  const answering = { step: 'compare', lineup, currentModel: 'ajax-qwen35' };
  assert.equal(ajaxHostLine({ ...answering, questionScores: { pre_agent_search: 100, pre_agent_missing: 0 } }), AJAX_LINES.emails);
  // Ollama gave it no tools: every tool question scored 0, nothing was invented.
  assert.equal(ajaxHostLine({ ...answering, questionScores: { pre_agent_search: 0, pre_agent_missing: 0 } }), AJAX_LINES.family);
  // Asked for the address instead.
  assert.equal(ajaxHostLine({ ...answering, questionScores: { pre_agent_search: 100, pre_agent_missing: 100 } }), AJAX_LINES.family);
  // Another model making it up is not Ajax's line.
  assert.equal(ajaxHostLine({ ...answering, currentModel: 'qwen3.5:9b', questionScores: { pre_agent_search: 100, pre_agent_missing: 0 } }), AJAX_LINES.family);
});

test('once a judge has marked Ajax, the host remembers the armor', () => {
  assert.equal(ajaxHostLine({ step: 'compare', lineup: ['ajax:latest'], currentModel: 'ajax:latest', judged: true }), AJAX_LINES.judges);
  assert.equal(ajaxHostLine({ step: 'compare', lineup: ['ajax:latest'], currentModel: 'ajax:latest', judged: false }), null);
  assert.match(AJAX_LINES.judges, /Odysseus got Achilles' armor/);
});

test('the Trojan stage host talks to the bros, in the studio host\'s length', () => {
  const wizard = readFileSync(new URL('../src/components/SimpleWizard.tsx', import.meta.url), 'utf-8');
  for (const [step, line] of Object.entries(TROJAN_HOST_COPY)) {
    assert.match(line, /bros/, step);
    // The host bubble holds the narration at a fixed height.
    assert.ok(line.length <= 160, `${step} is ${line.length} characters, too long for the bubble`);
  }
  assert.match(wizard, /TROJAN_HOST_COPY\[step\]/, 'the Trojan stage host never speaks in Simple Mode');
  const ctx = { contestantNumber: 2, model: 'ajax', questionLabel: 'Web search', phase: 'scored', index: 0 };
  assert.notEqual(getHostBanter({ ...ctx, stage: 'trojan' }), getHostBanter(ctx));
});

test('no line borrows a real person\'s name or catchphrase', () => {
  const banter = readFileSync(new URL('../src/lib/hostBanter.ts', import.meta.url), 'utf-8');
  const everything = [...Object.values(TROJAN_HOST_COPY), ...Object.values(AJAX_LINES), banter].join('\n');
  assert.doesNotMatch(everything, /pewdie|pewds|felix|brofist|subscribe|how['’]?s it goin/i);
});

test('the Trojan stage is drawn only once it has been earned', () => {
  assert.equal(resolveStage('trojan', true), 'trojan');
  // Picked in storage, never earned (copied settings, a hand edit): the studio.
  assert.equal(resolveStage('trojan', false), 'studio');
  assert.equal(resolveStage('studio', true), 'studio');
});

test('the Trojan stage re-dresses the show inside the wizard and leaves gold alone', () => {
  const css = readFileSync(new URL('../src/components/TrojanStage.css', import.meta.url), 'utf-8');
  // The Constant Gold Rule: the stage light is the same in every episode.
  assert.doesNotMatch(css, /--gold(-rgb)?\s*:/, 'the Trojan stage recolors gold');
  for (const selector of css.match(/^[^@/\s{}][^{}]*(?=\{)/gm) ?? []) {
    for (const part of selector.split(',')) {
      assert.match(part, /stage-trojan|\.sw-heart-burst i svg/, `"${part.trim()}" reaches outside the Trojan stage`);
    }
  }
  const wizard = readFileSync(new URL('../src/components/SimpleWizard.tsx', import.meta.url), 'utf-8');
  assert.match(wizard, /stage === 'trojan' \? 'sw-shell stage-trojan' : 'sw-shell'/);
  assert.match(wizard, /import '\.\/TrojanStage\.css';/);
});
