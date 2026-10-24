// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { activeShare, describeSpeed, footprintFit, gradeModel, gradeRow, measuredBandwidth, mixtureSpillFit, pullCommand, rigBandwidth } = await import('../src/lib/modelGrade.ts');
const { describeFitPlainly, getHardwareFit } = await import('../src/lib/modelCatalog.ts');
const { MATCH_GRADE_BANDS } = await import('../src/lib/scoring.ts');

/**
 * The Fit grade folds fit, speed, answer quality and room to chat into one
 * letter before any show is run. These lock what a newcomer reads off it:
 * it never contradicts the fit pill beside it, it says why in plain words,
 * and a test on this PC replaces the guesses it started from.
 */

const row = (name, params, sizeGb, extra = {}) => ({ name, displayName: name, params, sizeGb, ...extra });
const rtx4070 = { vramGb: 12 };

test('an 8B model on a 12 GB card is an A, explained in plain words', () => {
  const grade = gradeModel(row('qwen3:8b', '8B', 5.2), rtx4070);
  assert.equal(grade.letter, 'A');
  assert.equal(grade.verdict, 'runs-well');
  assert.equal(grade.spareGb, 6.8);
  assert.equal(grade.speedSource, 'estimate');
  assert.equal(grade.summary, 'Fits in your graphics memory with 6.8 GB spare · about 45 words a second · strong for its size');
  assert.equal(grade.reasons.join(' · '), grade.summary);
});

test('the grade never disagrees with the fit pill beside it', () => {
  const sizes = [null, 0.3, 1, 2.5, 4, 5.2, 7.4, 9.3, 11, 12.5, 13.8, 14, 19, 26, 43];
  const params = ['1B', '3B', '8B', '14B', '27B', '32B', '70B', 'Unknown'];
  for (const vramGb of [0, 0.5, 1.9, 2, 4, 8, 12, 16, 24, 48]) {
    for (const sizeGb of sizes) {
      for (const p of params) {
        const model = row(`probe:${p}`, p, sizeGb);
        const fit = getHardwareFit(model, vramGb);
        const grade = gradeModel(model, { vramGb });
        const where = `${p} ${sizeGb} GB on ${vramGb} GB`;
        assert.deepEqual(grade.fit, fit, where);
        if (fit.tone === 'out-of-league') assert.equal(grade.letter, 'F', where);
        if (fit.tone === 'unknown') assert.equal(grade.letter, '?', where);
        if (grade.letter === '?') assert.equal(grade.points, null, where);
        if (fit.tone === 'tight') assert.ok(grade.points <= 69, `a tight fit is a C at best: ${where}`);
        if (fit.recommend) assert.notEqual(grade.letter, '?', where);
      }
    }
  }
});

test('a carve-out under 2 GB grades exactly like no graphics card', () => {
  // A Radeon 610M's 512 MB, an Intel UHD's 128 MB, an old 1 GB card: graded
  // against that, llama3.2:3b was an F on a PC where it runs on the processor
  // fine, and a C on the same PC with no GPU at all.
  const sizes = [0.3, 1, 2, 2.5, 4, 5.2, 9.3, 20];
  for (const vramGb of [0.125, 0.5, 1, 1.9]) {
    for (const sizeGb of sizes) {
      const model = row(`probe:${sizeGb}`, `${Math.round(sizeGb / 0.6)}B`, sizeGb);
      const carve = gradeModel(model, { vramGb });
      const none = gradeModel(model, { vramGb: 0 });
      const where = `${sizeGb} GB on a ${vramGb} GB carve-out`;
      assert.equal(carve.tokensPerSecond, none.tokensPerSecond, where);
      if (none.letter === '?') {
        // No GPU at all might be a GPU nobody could read; a carve-out is known to be too small.
        assert.equal(carve.letter, 'F', where);
        assert.match(carve.summary, /^Too big for the processor alone, and your [\d.]+ GB of graphics memory is too little to help$/);
      } else {
        assert.equal(carve.letter, none.letter, where);
        assert.equal(carve.points, none.points, where);
      }
    }
  }
  const llama = gradeModel(row('llama3.2:3b', '3B', 2), { vramGb: 0.5 });
  assert.equal(llama.letter, gradeModel(row('llama3.2:3b', '3B', 2), { vramGb: 0 }).letter);
  assert.notEqual(llama.letter, 'F');
  assert.match(llama.summary, /^Your 0\.5 GB of graphics memory is too little to hold a model, so it runs on the processor · about \d+ words a second/);
  assert.equal(gradeModel(row('qwen3:1.7b', '1.7B', 1.4), { vramGb: 2 }).reasons[0], 'Fits in your graphics memory with 0.6 GB spare', '2 GB is a real card');
});

test('Fit grade letters are their own scale, not the Match Score\'s', () => {
  const matchOnly = MATCH_GRADE_BANDS.map((band) => band.grade).filter((grade) => !/^[A-D]$/.test(grade));
  assert.deepEqual(matchOnly, ['S', 'B+'], 'the Match Score has S and B+');
  const seen = new Set();
  for (const vramGb of [0, 0.5, 6, 12, 24]) {
    for (const [p, size] of [['0.6B', 0.5], ['4B', 2.5], ['8B', 5.2], ['14B', 9.3], ['32B', 20]]) {
      seen.add(gradeModel(row(`m:${p}`, p, size), { vramGb }).letter);
    }
  }
  for (const letter of seen) assert.match(letter, /^[ABCDF?]$/);
  assert.ok(!seen.has('S') && !seen.has('B+'));
});

test('no graphics memory: a small model runs on the processor, a big one is too big', () => {
  const small = gradeModel(row('qwen3:1.7b', '1.7B', 1.4), { vramGb: 0 });
  assert.match(small.summary, /^No graphics memory found, so it runs on the processor · about \d+ words a second/);
  assert.ok(small.points <= 69, 'a "Small pick" is a tight fit');
  assert.ok(!small.summary.includes('long chats'), 'chat memory comes out of RAM, which nothing here measures');

  // It said "? Graphics memory unknown, cannot grade it yet" for every model
  // over 4 GB, deepseek-r1:70b included, beside "runs on the processor" rows.
  for (const [name, params, size] of [['qwen3:8b', '8B', 5.2], ['deepseek-r1:70b', '70B', 43]]) {
    const big = gradeModel(row(name, params, size), { vramGb: 0 });
    assert.equal(big.letter, 'F', name);
    assert.equal(big.summary, 'Too big to run without a graphics card');
    assert.equal(big.fit.tone, getHardwareFit(row(name, params, size), 0).tone, 'the pill says the same');
  }
});

test('a mixture of experts is faster than its size, but has to fit whole', () => {
  assert.equal(activeShare('qwen3:30b-a3b', 30), 0.1);
  assert.equal(activeShare('mixtral:8x7b', 47), 0.28);
  assert.equal(activeShare('llama3.2:3b', 3), 1, 'a plain size is not an active one');
  assert.equal(activeShare('qwen3:32b', 32), 1);
  // The library's own names say nothing; these are mixtures all the same.
  assert.equal(activeShare('qwen3:30b', 30), 0.11);
  assert.equal(activeShare('gpt-oss:20b', 20), 0.18);
  assert.equal(activeShare('deepseek-v2:16b', 16), 0.15);
  assert.equal(activeShare('glm-4.7-flash:latest', 31), 3 / 31, 'a one-size family by name alone');
  assert.equal(activeShare('qwen3:latest', 8), 1, 'latest is the 8b, which is dense');
  // Newer family pages say it in words.
  const nvidia = 'An open 30B MoE model from NVIDIA with 3B activated parameters that delivers strong reasoning.';
  assert.equal(activeShare('nemotron-cascade-2:30b', 30, nvidia), 0.1);
  assert.equal(activeShare('nemotron-cascade-2:4b', 4, nvidia), 1, 'a dense size on the same page is not the mixture');
  assert.equal(activeShare('laguna-s-2.1:latest', 118, 'Our most capable model, 70.2% on Terminal-Bench at 118B-A8B.'), 8 / 118);
  assert.equal(activeShare('phi4:14b', 14, 'Phi-4 is a 14B parameter, state-of-the-art open model with 128k context.'), 1);

  const card = { vramGb: 24 };
  const dense = gradeModel(row('qwen3:32b', '32B', 18), card);
  const moe = gradeModel(row('qwen3:30b', '30B', 18), card);
  assert.ok(moe.tokensPerSecond > dense.tokensPerSecond * 3, `${moe.tokensPerSecond} vs ${dense.tokensPerSecond}`);
  const tagged = gradeModel(row('qwen3:30b-a3b', '30B', 18), card).tokensPerSecond;
  assert.ok(Math.abs(moe.tokensPerSecond - tagged) < tagged * 0.1, `the same weights under either name: ${moe.tokensPerSecond} vs ${tagged}`);
  assert.deepEqual(moe.fit, dense.fit, 'the same file, the same fit');
  assert.ok(moe.tokensPerSecond <= 200, 'capped: small active slices are not free');

  assert.equal(gradeModel(row('qwen3:30b', '30B', 18), rtx4070).letter, 'F');
});

test('an unknown size is "?", not a guess', () => {
  const grade = gradeModel(row('mystery:latest', 'Unknown', null), rtx4070);
  assert.equal(grade.letter, '?');
  assert.equal(grade.points, null);
  assert.equal(grade.summary, 'Download size unknown, so RigMatch cannot grade it yet');
  // Without a size but with a heavyweight label, the fit already says too big.
  assert.equal(gradeModel(row('big:70b', '70B', null), rtx4070).letter, 'F');
});

test('a test on this PC replaces the guesses', () => {
  const model = row('qwen3:8b', '8B', 5.2);
  const tested = gradeModel(model, rtx4070, { score: { sobriety: 41, tokensPerSecond: 72 } });
  assert.equal(tested.speedSource, 'measured');
  assert.equal(tested.tokensPerSecond, 72);
  assert.match(tested.summary, /· 55 words a second when tested here · answers scored 41 in its test here$/);
  assert.ok(tested.points < gradeModel(model, rtx4070).points, 'poor answers in a real test cost points');

  // A benchmark without a saved score still counts as measured.
  assert.equal(gradeModel(model, rtx4070, { tokensPerSecond: 30 }).speedSource, 'measured');

  // One measured model calibrates the estimate for every other one.
  const bandwidth = rigBandwidth([{ name: 'llama3.1:8b', params: '8B', sizeGb: 4.9, tokensPerSecond: 80 }], 12);
  assert.equal(bandwidth, 392);
  const calibrated = gradeModel(row('qwen3:14b', '14B', 9.3), rtx4070, { bandwidthGbps: bandwidth });
  assert.equal(calibrated.speedSource, 'this-pc');
  assert.match(calibrated.summary, /about 30 words a second, going by models tested here/);
  assert.equal(rigBandwidth([{ name: 'big:70b', params: '70B', sizeGb: 40, tokensPerSecond: 3 }], 12), null,
    'a model that spilled out of graphics memory says nothing about the card');
  assert.equal(rigBandwidth([], 12), null);
});

test('an older family is graded as the smaller model it answers like', () => {
  const older = gradeModel(row('llama2:13b', '13B', 7.4), rtx4070);
  const newer = gradeModel(row('newfamily:13b', '13B', 7.4), rtx4070);
  assert.ok(older.points < newer.points);
  assert.match(older.summary, /an older model: newer ones this size answer better$/);
  assert.match(newer.summary, /strong for its size$/);
  // Exact family names: llama3 is not llama2's generation.
  assert.doesNotMatch(gradeModel(row('llama3:8b', '8B', 4.7), rtx4070).summary, /older/);
});

test('a model that cannot chat is graded on its fit alone', () => {
  const embed = gradeModel(row('nomic-embed-text:latest', '137M', 0.3), rtx4070);
  assert.equal(embed.letter, 'A');
  assert.equal(embed.tokensPerSecond, null);
  assert.equal(embed.reasons.length, 1);

  // A video model's fit comes from the Video Lab's rules (fitOverride).
  const offload = { tone: 'tight', label: 'Fits with offloading', detail: 'Its 21 GB model is bigger than this card’s VRAM, so ComfyUI streams it from system memory. It runs, just slower.', recommend: true };
  const video = gradeModel(row('wan2.2-14b', '14B', 21, { generationKind: 'video', fitOverride: offload }), rtx4070);
  assert.equal(video.letter, 'C');
  assert.equal(video.summary, offload.detail);
});

test('shared memory is described as shared, and a model past its share is a C at best', () => {
  const mac = { vramGb: 16, unifiedMemory: true };
  assert.equal(gradeModel(row('qwen3:8b', '8B', 5.2), mac).reasons[0], 'Fits in your shared memory with 6 GB spare');
  assert.equal(gradeModel(row('x:14b', '14B', 10.5), mac).reasons[0], 'Fits, but leaves little of your 16 GB of shared memory for other apps');
  assert.equal(gradeModel(row('qwen3:30b-a3b', '30B', 18), mac).reasons[0], 'Bigger than your 16 GB of shared memory, so it will be slow');

  // 12.5 GB is past the 11.2 GB a 16 GB Mac can give a model (70%), though
  // the fit pill, sized against all 16, calls it a good fit.
  const over = gradeModel(row('x:20b', '20B', 12.5), mac);
  assert.equal(over.fit.tone, 'good');
  assert.equal(over.verdict, 'barely-runs');
  assert.ok(over.points <= 69, `${over.letter} ${over.points}`);
  assert.equal(over.reasons[0], 'Needs more of your 16 GB of shared memory than a model can have beside the system, so it will be slow');
  const within = gradeModel(row('x:20b', '20B', 11), mac);
  assert.ok(over.tokensPerSecond < within.tokensPerSecond * 0.75, `spills: ${over.tokensPerSecond} vs ${within.tokensPerSecond}`);
});

test('on the processor, a measured speed is used, not called one and ignored', () => {
  const cpu = { vramGb: 0 };
  const model = row('qwen3:1.7b', '1.7B', 1.4);
  const guessed = gradeModel(model, cpu);
  const measured = gradeModel(model, cpu, { bandwidthGbps: 70 });
  assert.equal(guessed.speedSource, 'estimate');
  assert.equal(measured.speedSource, 'this-pc');
  assert.equal(measured.tokensPerSecond, 50);
  assert.equal(guessed.tokensPerSecond, 25);
  assert.match(measured.summary, /about 40 words a second, going by models tested here/);
  // A carve-out PC measures on the processor too, so every run counts.
  assert.equal(rigBandwidth([{ name: 'llama3.2:3b', params: '3B', sizeGb: 2, tokensPerSecond: 20 }], 0.5), 40);
});

test('a Models row is graded by its whole tag, with what the list has measured', () => {
  // A Models row keeps the family in name and the tag in displayName.
  const listRow = (family, tag, params, sizeGb, extra = {}) => ({
    id: `${family}:${tag}`, name: family, tag, params, sizeGb, pack: '', source: 'Ollama', live: false,
    displayName: `${family}:${tag}`, installed: false, ready: false, installLabel: '', ...extra,
  });
  const moe = listRow('qwen3', '30b-a3b', '30B', 18);
  const dense = listRow('qwen3', '32b', '32B', 18);
  const card = { vramGb: 24 };
  assert.ok(gradeRow(moe, card, {}).tokensPerSecond > gradeRow(dense, card, {}).tokensPerSecond * 3, 'the a3b in the tag is read');
  assert.doesNotMatch(gradeRow(listRow('llama2', '13b', '13B', 7.4), card, {}).summary, /strong/, 'the family in name is read');

  const tested = listRow('llama3.1', '8b', '8B', 4.9, { installed: true });
  const scores = { 'llama3.1:8b': { model: 'llama3.1:8b', total: 80, grade: 'B+', speed: 70, sobriety: 70, stability: 100, fit: 88, completedAt: '2026-10-24T00:00:00Z', tokensPerSecond: 80 } };
  assert.equal(measuredBandwidth([tested, moe], scores, { vramGb: 12 }), 392);
  assert.equal(measuredBandwidth([moe], scores, { vramGb: 12 }), null);
  const fromBenchmark = gradeRow(listRow('qwen3', '8b', '8B', 5.2), { vramGb: 12 }, { benchmark: { avgTokensPerSecond: 50 } });
  assert.equal(fromBenchmark.speedSource, 'measured');
  assert.equal(fromBenchmark.tokensPerSecond, 50);
});

test('a score from another computer is not "tested here"', () => {
  const listRow = (family, tag, params, sizeGb) => ({
    id: `${family}:${tag}`, name: family, tag, params, sizeGb, pack: '', source: 'Ollama', live: false,
    displayName: `${family}:${tag}`, installed: true, ready: true, installLabel: '',
  });
  const llama = listRow('llama3.1', '8b', '8B', 4.9);
  const card = { vramGb: 12, gpu: 'NVIDIA GeForce RTX 4070' };
  const scored = (rig) => ({
    model: 'llama3.1:8b', total: 80, grade: 'B+', speed: 70, sobriety: 41, stability: 100, fit: 88,
    completedAt: '2026-10-24T00:00:00Z', tokensPerSecond: 80, rig: { appVersion: '0.9.9', ...rig },
  });
  const benchmark = { avgTokensPerSecond: 80 };

  const here = gradeRow(llama, card, { score: scored({ gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12 }), benchmark });
  assert.equal(here.speedSource, 'measured');
  assert.match(here.summary, /when tested here · answers scored 41 in its test here$/);

  for (const [why, rig] of [
    ['on a networked computer', { host: 'gaming-pc.local' }],
    ['before a GPU swap', { gpu: 'NVIDIA GeForce RTX 3060', vramGb: 12 }],
    ['on a card with other memory', { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 8 }],
  ]) {
    const elsewhere = gradeRow(llama, card, { score: scored(rig), benchmark });
    assert.equal(elsewhere.speedSource, 'estimate', why);
    assert.doesNotMatch(elsewhere.summary, /tested here/, why);
    assert.equal(measuredBandwidth([llama], { 'llama3.1:8b': scored(rig) }, card), null, `${why}: no calibration from it either`);
  }
  // A new build of the same model on the same card is still this computer's measurement.
  assert.equal(gradeRow(llama, card, { score: scored({ gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, modelDigest: 'old' }) }).speedSource, 'measured');
  // An older score with no stamp at all is taken as this computer's, as the app's badges take it.
  assert.equal(gradeRow(llama, card, { score: { ...scored({}), rig: undefined } }).speedSource, 'measured');
});

test('speeds read as rounded words, because they are forecasts', () => {
  assert.equal(describeSpeed(60), '45 words a second');
  assert.equal(describeSpeed(9), '7 words a second');
  assert.equal(describeSpeed(1), '1 word a second');
});

test('the copy button and the CLI print the same download command', () => {
  assert.equal(pullCommand('qwen3:8b'), 'ollama pull qwen3:8b');
  assert.equal(pullCommand('qwen3:8b', 'lm-studio'), 'lms get qwen3-8b');
  assert.equal(pullCommand('gemma3:latest', 'lm-studio'), 'lms get gemma3');
  assert.equal(pullCommand('qwen/qwen3-4b', 'lm-studio'), 'lms get qwen/qwen3-4b', "LM Studio's own key is kept");
});

test('the fit pill itself treats a carve-out under 2 GB as no graphics card', () => {
  // The pill, the download guard and Simple Mode all read getHardwareFit, so
  // they agree with the grade: llama3.2:3b on a 0.5 GB Radeon 610M is a small
  // pick for the processor, not "Too big".
  const small = getHardwareFit({ params: '3B', sizeGb: 2 }, 0.5);
  assert.equal(small.tone, 'tight');
  assert.equal(small.label, 'Small pick');
  assert.equal(small.recommend, true);
  const big = getHardwareFit({ params: '8B', sizeGb: 5.2 }, 0.5);
  assert.equal(big.tone, 'out-of-league', 'the card is known, so a big model is too big, not unknown');
  assert.equal(big.recommend, false);
  assert.equal(describeFitPlainly({ params: '3B', sizeGb: 2 }, 0.5), 'Small enough to run on the processor. Your graphics card is too small to hold a model');
  assert.equal(getHardwareFit({ params: '1B', sizeGb: 1 }, 2).tone, 'sweet-spot', '2 GB is a real card');
});

test('told there is no graphics card, the grades are the same and only the words differ', () => {
  const none = { vramGb: 0, noGpu: true };
  const big = gradeModel(row('qwen3:14b', '14B', 9.3), none);
  assert.equal(big.letter, 'F');
  assert.equal(big.summary, 'Too big to run without a graphics card');
  assert.match(gradeModel(row('llama3.2:3b', '3B', 2), none).summary, /^No graphics card, so it runs on the processor/);
  for (const [name, params, size] of [['qwen3:14b', '14B', 9.3], ['llama3.2:3b', '3B', 2], ['qwen3:0.6b', '0.6B', 0.5]]) {
    assert.equal(gradeModel(row(name, params, size), { vramGb: 0 }).points, gradeModel(row(name, params, size), none).points, name);
  }
});

test('a model that can do more ranks above one the same size that cannot', () => {
  const plain = gradeModel(row('older:9b', '9B', 5.5, { capabilities: ['completion'] }), rtx4070);
  const current = gradeModel(row('current:9b', '9B', 5.5, { capabilities: ['completion', 'tools', 'thinking'] }), rtx4070);
  assert.ok(current.points > plain.points, `${current.points} vs ${plain.points}`);
  // Enough to put an 8B that calls tools and thinks above a 12B that does neither.
  const eight = gradeModel(row('qwen3:8b', '8B', 4.8, { capabilities: ['completion', 'tools', 'thinking'] }), rtx4070);
  const twelve = gradeModel(row('stablelm2:12b', '12B', 6.5, { capabilities: ['completion'] }), rtx4070);
  assert.ok(eight.points > twelve.points, `${eight.points} vs ${twelve.points}`);
});

test('a mixture of experts spills into system memory only when it would still run well', () => {
  const card = { vramGb: 12, ramGb: 32 };
  const qwen30 = row('qwen3:30b', '30B', 17.7);
  const spill = mixtureSpillFit(qwen30, card);
  assert.equal(spill.tone, 'tight');
  assert.equal(spill.label, 'RAM assist · 17.7 GB');
  assert.equal(spill.recommend, true);
  assert.match(spill.detail, /^Bigger than your 12 GB of graphics memory, but it runs only part of itself per word/);
  const graded = gradeModel({ ...qwen30, fitOverride: spill }, card);
  assert.equal(graded.letter, 'C');
  assert.ok(graded.tokensPerSecond >= 10);
  assert.equal(mixtureSpillFit(row('qwen3:32b', '32B', 18.8), card), null, 'dense: every word reads all of it');
  assert.equal(mixtureSpillFit(row('mixtral:8x7b', '47B', 24.2), card), null, 'under 10 tokens a second spilled');
  assert.equal(mixtureSpillFit(qwen30, { vramGb: 12, ramGb: 8 }), null, 'no room in system memory');
  assert.equal(mixtureSpillFit(qwen30, { vramGb: 12 }), null, 'system memory unknown');
  assert.equal(mixtureSpillFit(qwen30, { vramGb: 16, unifiedMemory: true, ramGb: 16 }), null, 'a Mac swaps rather than spills');
  assert.equal(mixtureSpillFit(row('qwen3:8b', '8B', 4.8), card), null, 'it fits already');
});

test('a Mac is as fast as its chip', () => {
  const speed = (gpu) => gradeModel(row('qwen3:14b', '14B', 8.7), { vramGb: 64, unifiedMemory: true, gpu }).tokensPerSecond;
  const [base, pro, max, ultra] = ['Apple M3', 'Apple M3 Pro', 'Apple M3 Max', 'Apple M2 Ultra'].map(speed);
  assert.ok(pro > base * 1.8 && max > base * 3.5 && ultra > base * 7, `${base} ${pro} ${max} ${ultra}`);
  assert.equal(speed(undefined), base, 'no name: a base chip');
  // A discrete card's name says nothing here: "Radeon Pro" is not an M-series Pro.
  assert.equal(gradeModel(row('qwen3:14b', '14B', 8.7), { vramGb: 16, gpu: 'AMD Radeon Pro W6800' }).tokensPerSecond,
    gradeModel(row('qwen3:14b', '14B', 8.7), { vramGb: 16 }).tokensPerSecond);
});

test('a picture or video model says which part of its download has to fit', () => {
  // Z-Image Turbo: a 14.58 GB download in the Size column, sized by the 8 GB
  // it holds at once. The reason used to say only "8 GB should fit".
  const picture = footprintFit(getHardwareFit({ params: '6B', sizeGb: 8.04 }, 12), 8.04, 14.58);
  assert.equal(picture.detail, 'Of its 14.58 GB download, about 8 GB has to be in graphics memory at once. 8 GB should fit 12 GB with useful headroom.');
  assert.equal(picture.tone, 'good', 'the fit itself is unchanged');
  const zImage = gradeModel(row('Z-Image Turbo', '6B', 14.58, { generationKind: 'image', fitOverride: picture }), rtx4070);
  assert.equal(zImage.summary, picture.detail, 'the grade gives the same reason as the Size column');

  const offload = { tone: 'tight', label: 'Fits with offloading', detail: 'Its 14.3 GB model is bigger than this card’s VRAM, so ComfyUI streams it from system memory. It runs, just slower.', recommend: true };
  assert.match(footprintFit(offload, 14.3, 38.03).detail, /^Of its 38\.03 GB download, about 14\.3 GB has to be in graphics memory at once\. Its 14\.3 GB model/);
  const token = { tone: 'unknown', label: 'Needs a token', detail: 'Its publisher gates the download.', recommend: true };
  assert.equal(footprintFit(token, 14.3, 38.03), token, 'nothing to say about size until it can be downloaded');
  assert.equal(footprintFit(offload, 14.3, 14.5), offload, 'when the two are the same, there is nothing to explain');
});
