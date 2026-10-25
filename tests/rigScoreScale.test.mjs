import test from 'node:test';
import assert from 'node:assert/strict';

const { RIG_SPEED_BANDS, speedBand, bandRange, promptWaitSeconds } = await import('../src/lib/rigScoreScale.ts');
const { GLOSSARY } = await import('../src/lib/glossary.ts');

test('the bands are on writing speed, fastest first, at 50, 20 and 5 tokens a second', () => {
  assert.deepEqual(RIG_SPEED_BANDS.map((band) => [band.id, band.minTps]), [['excellent', 50], ['fast', 20], ['usable', 5], ['slow', 0]]);
  const at = (tps) => speedBand(tps).id;
  assert.equal(at(250), 'excellent');
  assert.equal(at(50), 'excellent');
  assert.equal(at(49.9), 'fast');
  assert.equal(at(20), 'fast');
  assert.equal(at(19.9), 'usable');
  assert.equal(at(5), 'usable');
  assert.equal(at(4.9), 'slow');
  assert.equal(at(0), 'slow');
  assert.equal(at(Number.NaN), 'slow', 'no measure is not a fast one');
});

test('the words match what the app already says about speed', () => {
  assert.equal(speedBand(30).feel, 'Answers faster than you can read.');
  assert.match(speedBand(10).feel, /^Usable, a bit slow/);
  // The glossary's entry for words per second draws its lines at five and twenty.
  const entry = GLOSSARY.find((item) => item.id === 'tokens-per-second');
  assert.match(entry.because, /Below about five/);
  assert.match(entry.because, /Above twenty feels immediate/);
  assert.ok(RIG_SPEED_BANDS.some((band) => band.minTps === 5));
  assert.ok(RIG_SPEED_BANDS.some((band) => band.minTps === 20));
});

test('each band says its range', () => {
  assert.deepEqual(RIG_SPEED_BANDS.map(bandRange), ['50+ tok/s', '20 to 50 tok/s', '5 to 20 tok/s', 'under 5 tok/s']);
});

test('the wait before the first word is the prompt over the reading speed', () => {
  assert.equal(promptWaitSeconds(3000, 1500), 0.5);
  assert.equal(promptWaitSeconds(0, 1500), null);
});
