// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { activeShare, describeSpeed, gradeModel, gradeRow, measuredBandwidth, pullCommand, rigBandwidth } = await import('../src/lib/modelGrade.ts');
const { getHardwareFit } = await import('../src/lib/modelCatalog.ts');
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
  for (const vramGb of [0, 0.5, 4, 8, 12, 16, 24, 48]) {
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

test('no graphics card: a small model runs on the processor, a big one waits for a known GPU', () => {
  const small = gradeModel(row('qwen3:1.7b', '1.7B', 1.4), { vramGb: 0 });
  assert.match(small.summary, /^No graphics memory found, so it runs on the processor · about \d+ words a second/);
  assert.ok(small.points <= 69, 'a "Small pick" is a tight fit');
  assert.ok(!small.summary.includes('long chats'), 'chat memory comes out of RAM, which nothing here measures');

  const big = gradeModel(row('qwen3:8b', '8B', 5.2), { vramGb: 0 });
  assert.equal(big.letter, '?');
  assert.equal(big.summary, 'Graphics memory unknown, so RigMatch cannot grade it yet');
});

test('an integrated GPU with a tiny carve-out is graded as what it is', () => {
  // A Radeon 610M's 512 MB: the case PR #119 stopped being picked over a real card.
  const igpu = { vramGb: 0.5 };
  const tiny = gradeModel(row('qwen3:0.6b', '0.6B', 0.5), igpu);
  assert.equal(tiny.verdict, 'barely-runs');
  assert.match(tiny.summary, /^Only just fits your 0\.5 GB of graphics memory/);
  assert.equal(gradeModel(row('qwen3:1.7b', '1.7B', 1.4), igpu).letter, 'F');
  assert.equal(gradeModel(row('qwen3:8b', '8B', 5.2), igpu).summary, 'Too big for your 0.5 GB of graphics memory');
  // The carve-out is system memory, so it is no faster than running on the processor.
  const onCpu = gradeModel(row('qwen3:0.6b', '0.6B', 0.5), { vramGb: 0 });
  assert.equal(tiny.tokensPerSecond, onCpu.tokensPerSecond);
});

test('a mixture of experts is faster than its size, but has to fit whole', () => {
  assert.equal(activeShare('qwen3:30b-a3b', 30), 0.1);
  assert.equal(activeShare('mixtral:8x7b', 47), 0.28);
  assert.equal(activeShare('llama3.2:3b', 3), 1, 'a plain size is not an active one');
  assert.equal(activeShare('qwen3:30b', 30), 1);

  const dense = gradeModel(row('qwen3:30b', '30B', 18), { vramGb: 24 });
  const moe = gradeModel(row('qwen3:30b-a3b', '30B', 18), { vramGb: 24 });
  assert.ok(moe.tokensPerSecond > dense.tokensPerSecond * 3, `${moe.tokensPerSecond} vs ${dense.tokensPerSecond}`);
  assert.deepEqual(moe.fit, dense.fit, 'the same file, the same fit');
  assert.ok(moe.tokensPerSecond <= 200, 'capped: small active slices are not free');

  assert.equal(gradeModel(row('qwen3:30b-a3b', '30B', 18), rtx4070).letter, 'F');
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

test('shared memory is described as shared, with room left for the system', () => {
  const mac = { vramGb: 16, unifiedMemory: true };
  assert.equal(gradeModel(row('qwen3:8b', '8B', 5.2), mac).reasons[0], 'Fits in your shared memory with 6 GB spare');
  assert.equal(gradeModel(row('x:20b', '20B', 12.5), mac).reasons[0], 'Fits, but leaves little of your 16 GB of shared memory for other apps');
  assert.equal(gradeModel(row('qwen3:30b-a3b', '30B', 18), mac).reasons[0], 'Bigger than your 16 GB of shared memory, so it will be slow');
});

test('a Models row is graded by its whole tag, with what the list has measured', () => {
  // A Models row keeps the family in name and the tag in displayName.
  const listRow = (family, tag, params, sizeGb, extra = {}) => ({
    id: `${family}:${tag}`, name: family, tag, params, sizeGb, pack: '', source: 'Ollama', live: false,
    displayName: `${family}:${tag}`, installed: false, ready: false, installLabel: '', ...extra,
  });
  const moe = listRow('qwen3', '30b-a3b', '30B', 18);
  const dense = listRow('qwen3', '30b', '30B', 18);
  const card = { vramGb: 24 };
  assert.ok(gradeRow(moe, card, {}).tokensPerSecond > gradeRow(dense, card, {}).tokensPerSecond * 3, 'the a3b in the tag is read');
  assert.doesNotMatch(gradeRow(listRow('llama2', '13b', '13B', 7.4), card, {}).summary, /strong/, 'the family in name is read');

  const tested = listRow('llama3.1', '8b', '8B', 4.9, { installed: true });
  const scores = { 'llama3.1:8b': { model: 'llama3.1:8b', total: 80, grade: 'B+', speed: 70, sobriety: 70, stability: 100, fit: 88, completedAt: '2026-10-24T00:00:00Z', tokensPerSecond: 80 } };
  assert.equal(measuredBandwidth([tested, moe], scores, 12), 392);
  assert.equal(measuredBandwidth([moe], scores, 12), null);
  const fromBenchmark = gradeRow(listRow('qwen3', '8b', '8B', 5.2), { vramGb: 12 }, { benchmark: { avgTokensPerSecond: 50 } });
  assert.equal(fromBenchmark.speedSource, 'measured');
  assert.equal(fromBenchmark.tokensPerSecond, 50);
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
