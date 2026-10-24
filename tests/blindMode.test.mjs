// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ELO_K, ELO_START, MAX_BLIND_PICKS, blindLabel, blindNames, emptyBlindTaste, eloExpected, maskName, maskText,
  rateTaste, recordBlindPick, removeModelsFromTaste,
} = await import('../src/lib/blindMode.ts');

const pick = (picked, contestants, at = '2026-10-24T10:00:00.000Z') => ({ at, picked, contestants });

test('an even game moves the winner up by half of K and the loser down by the same', () => {
  assert.equal(eloExpected(ELO_START, ELO_START), 0.5);
  const [winner, loser] = rateTaste([pick('a', ['a', 'b'])]);
  assert.deepEqual(winner, { model: 'a', rating: ELO_START + ELO_K / 2, wins: 1, shows: 1 });
  assert.deepEqual(loser, { model: 'b', rating: ELO_START - ELO_K / 2, wins: 0, shows: 1 });
});

test('a pick beats every other contestant, and the order they are listed in does not matter', () => {
  const one = rateTaste([pick('b', ['a', 'b', 'c'])]);
  const two = rateTaste([pick('b', ['c', 'b', 'a'])]);
  assert.deepEqual(one.map((r) => [r.model, r.rating]).sort(), two.map((r) => [r.model, r.rating]).sort());
  assert.equal(one[0].model, 'b');
  assert.equal(one[0].rating, ELO_START + ELO_K);
  // Points are only moved, never made: the ratings still average to the start.
  assert.equal(one.reduce((sum, r) => sum + r.rating, 0), ELO_START * 3);
});

test('beating a stronger model is worth more than beating a weaker one', () => {
  const picks = [pick('a', ['a', 'b']), pick('a', ['a', 'b']), pick('a', ['a', 'b'])];
  const upset = rateTaste([...picks, pick('b', ['a', 'b'])]);
  const expected = rateTaste([...picks, pick('a', ['a', 'b'])]);
  const gain = (rows, model, before) => rows.find((r) => r.model === model).rating - before.find((r) => r.model === model).rating;
  const before = rateTaste(picks);
  assert.ok(gain(upset, 'b', before) > ELO_K / 2, 'an upset should move more than an even game');
  assert.ok(gain(expected, 'a', before) < ELO_K / 2, 'an expected win should move less than an even game');
});

test('names that differ only in case are one model', () => {
  const rows = rateTaste([pick('Qwen3:8B', ['Qwen3:8B', 'llama3.2']), pick('qwen3:8b', ['qwen3:8b', 'llama3.2'])]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].wins, 2);
  assert.equal(rows[0].shows, 2);
});

test('recording a pick needs two contestants and a pick from among them', () => {
  const empty = emptyBlindTaste();
  assert.equal(recordBlindPick(empty, 'a', ['a']), empty, 'one contestant is not a contest');
  assert.equal(recordBlindPick(empty, 'a', ['a', 'A']), empty, 'the same model twice is one contestant');
  assert.equal(recordBlindPick(empty, 'z', ['a', 'b']), empty, 'a pick from outside the lineup cannot count');

  const next = recordBlindPick(empty, 'b', ['a', 'b', 'b', ''], '2026-10-24T11:00:00.000Z');
  assert.deepEqual(next.picks, [pick('b', ['a', 'b'], '2026-10-24T11:00:00.000Z')]);
  assert.equal(empty.picks.length, 0, 'the old taste is not changed in place');
});

test('only the newest picks are kept', () => {
  let taste = emptyBlindTaste();
  for (let i = 0; i < MAX_BLIND_PICKS + 5; i += 1) taste = recordBlindPick(taste, `m${i}`, [`m${i}`, 'x'], String(i));
  assert.equal(taste.picks.length, MAX_BLIND_PICKS);
  assert.equal(taste.picks[0].at, '5');
});

test('clearing one model drops the picks it won and leaves it out of the rest', () => {
  const taste = {
    version: 1,
    picks: [
      pick('a', ['a', 'b', 'c']),
      pick('b', ['a', 'b', 'c']),
      pick('c', ['a', 'c']),
    ],
  };
  const next = removeModelsFromTaste(taste, ['A']);
  // a's win is gone; b's win keeps counting over c; c's win over a alone is gone.
  assert.deepEqual(next.picks, [pick('b', ['b', 'c'])]);
  assert.ok(!rateTaste(next.picks).some((r) => r.model === 'a'));
  assert.equal(removeModelsFromTaste(taste, ['nobody']), taste, 'nothing to clear leaves it untouched');
});

test('contestants are numbered by their place in the lineup', () => {
  assert.equal(blindLabel(0), 'Contestant 1');
  const names = blindNames(['qwen3:8b', 'Llama3.2:latest', 'gemma3:4b']);
  assert.equal(maskName('qwen3:8b', names), 'Contestant 1');
  assert.equal(maskName('llama3.2:latest', names), 'Contestant 2', 'normalized spelling still masks');
  assert.equal(maskName('gemma3:4b', names), 'Contestant 3');
  assert.equal(maskName('mistral', names), 'mistral', 'a model outside the show is left alone');
});

test('free text loses every spelling of a lineup name', () => {
  const names = blindNames(['qwen3:14b', 'qwen3:1.7b', 'llama3.2:latest']);
  assert.equal(
    maskText('qwen3:14b answered first, then QWEN3:1.7B; llama3.2 was last and llama3.2:latest again.', names),
    'Contestant 1 answered first, then Contestant 2; Contestant 3 was last and Contestant 3 again.',
  );
  assert.equal(maskText('Loading qwen3-14b into memory', names), 'Loading Contestant 1 into memory');
  assert.equal(maskText('Nothing to hide here.', names), 'Nothing to hide here.');
  assert.equal(maskText('qwen3:14b', new Map()), 'qwen3:14b');
});

test('only whole names are masked, never part of a word', () => {
  const names = blindNames(['phi:latest', 'yi:6b', 'qwen3:8b']);
  assert.equal(maskText('graphics and philosophy, playing', names), 'graphics and philosophy, playing');
  assert.equal(maskText('phi answered, then yi:6b, then qwen3:8b.', names), 'Contestant 1 answered, then Contestant 2, then Contestant 3.');
  assert.equal(maskText('(phi) and "yi-6b"', names), '(Contestant 1) and "Contestant 2"');
});

test('friendly names are masked too, and a name two seats share becomes "a contestant"', () => {
  // The failure line and the dropped-out toast print getFriendlyModelName: "Qwen3", not "qwen3:8b".
  const one = blindNames(['qwen3:8b', 'llama3.2:3b']);
  assert.equal(maskText("Qwen3 couldn't finish. It stopped answering.", one), "Contestant 1 couldn't finish. It stopped answering.");
  assert.equal(maskText("Llama3.2 couldn't finish, so the show went on without it.", one), "Contestant 2 couldn't finish, so the show went on without it.");
  // qwen3:8b and qwen3:14b are both "Qwen3": naming either seat would be a guess.
  const two = blindNames(['qwen3:8b', 'qwen3:14b', 'llama3.2:3b']);
  assert.equal(maskText("Qwen3 couldn't finish.", two), "A contestant couldn't finish.");
  assert.equal(maskText("Speed Dating went on. Qwen3 and Llama3.2 couldn't finish, so then qwen3 sat out.", two),
    "Speed Dating went on. A contestant and Contestant 3 couldn't finish, so then a contestant sat out.");
  // The full tags still name their own seats.
  assert.equal(maskText('qwen3:14b then qwen3:8b', two), 'Contestant 2 then Contestant 1');
});

test('the run sheet named the judge, so a blind show never does', async () => {
  const { maskProgress } = await import('../src/lib/blindMode.ts');
  // The usual judge is seat 3; on its own turn another model marks instead.
  const names = blindNames(['qwen3:8b', 'llama3.2:3b', 'qwen2.5-coder:7b']);
  const turn = (judge, model) => maskProgress({
    currentModel: model, label: 'Speed Dating', questionJudge: judge, message: `${judge} is marking ${model}'s answer.`,
  }, names);
  for (const masked of [turn('qwen2.5-coder:7b', 'qwen3:8b'), turn('gemma3:12b', 'qwen2.5-coder:7b')]) {
    assert.equal(masked.questionJudge, undefined, 'the podium falls back to "Being marked"');
    assert.doesNotMatch(masked.message, /gemma|qwen|is marking/i, masked.message);
  }
  assert.equal(turn('gemma3:12b', 'qwen2.5-coder:7b').message, "Contestant 3's answer is being marked.");
  assert.equal(
    maskProgress({ currentModel: 'qwen3:8b', label: '', message: "Judge gemma3:12b stopped answering; the rest of qwen3:8b's answers are marked without it" }, names).message,
    "The judge stopped answering; the rest of Contestant 1's answers are marked without it",
  );
});

test('the host calls a blind contestant by seat, never by name', async () => {
  const { getHostBanter } = await import('../src/lib/hostBanter.ts');
  for (const phase of ['warming', 'asking', 'answering', 'scored']) {
    for (const stage of ['studio', 'trojan']) {
      for (let index = 0; index < 4; index += 1) {
        const line = getHostBanter({ contestantNumber: 2, model: 'qwen3:8b', questionLabel: 'Q', phase, index, stage, blind: true });
        assert.ok(!line.includes('qwen3'), line);
        assert.ok(line.includes('Contestant 2'), line);
      }
    }
  }
  const unknownSeat = getHostBanter({ contestantNumber: 0, model: 'qwen3:8b', questionLabel: 'Q', phase: 'warming', index: 0, blind: true });
  assert.ok(!unknownSeat.includes('qwen3'), unknownSeat);
  // Off, the line is what it always was.
  assert.match(getHostBanter({ contestantNumber: 2, model: 'qwen3:8b', questionLabel: 'Q', phase: 'warming', index: 0 }), /Contestant #2 \(qwen3:8b\)/);
});

test('a blind lineup is drawn in seat order, each row renamed to its seat', async () => {
  const { maskRows } = await import('../src/lib/blindMode.ts');
  const rows = [
    { displayName: 'llama3.2:latest', installed: true },
    { displayName: 'qwen3:8b', installed: true },
    { displayName: 'mistral', installed: false },
    { displayName: 'gemma3:4b', installed: true },
  ];
  // Seated at random: gemma first.
  const lineup = ['gemma3:4b', 'llama3.2:latest', 'qwen3:8b'];
  const masked = maskRows(rows, lineup, blindNames(lineup));
  assert.deepEqual(masked.map((row) => row.displayName), ['Contestant 1', 'Contestant 2', 'Contestant 3', 'mistral']);
  assert.equal(masked[0].installed, true, 'the rest of the row is untouched');
  assert.equal(rows[0].displayName, 'llama3.2:latest', 'the real rows are not changed');
});

test('blind progress is renamed and carries no score', async () => {
  const { maskProgress } = await import('../src/lib/blindMode.ts');
  const names = blindNames(['qwen3:8b', 'llama3.2']);
  const progress = {
    mode: 'speed-date',
    phase: 'running',
    label: 'Speed Dating',
    currentModel: 'qwen3:8b',
    completed: 1,
    total: 2,
    percent: 50,
    message: 'Coding scored 78.',
    lastResult: { model: 'llama3.2', total: 81, grade: 'B+' },
    questionScores: { q1: 78 },
    questionJudge: 'llama3.2',
    failedModels: [{ model: 'llama3.2', kind: 'crashed', reason: 'llama3.2 stopped answering.' }],
  };
  const masked = maskProgress(progress, names);
  assert.equal(masked.currentModel, 'Contestant 1');
  assert.equal(masked.questionJudge, undefined);
  assert.equal(masked.message, 'Coding has been marked.');
  assert.equal(masked.lastResult, undefined);
  assert.equal(masked.questionScores, undefined);
  assert.deepEqual(masked.failedModels, [{ model: 'Contestant 2', kind: 'crashed', reason: 'Contestant 2 stopped answering.' }]);
  assert.equal(maskProgress({ ...progress, message: 'qwen3:8b scored 82 (A-).' }, names).message, 'Contestant 1 has been marked.');
  assert.equal(progress.currentModel, 'qwen3:8b', 'the real progress is not changed');
});

test('seats are a shuffle of the lineup: everyone seated once', async () => {
  const { shuffleLineup } = await import('../src/lib/blindMode.ts');
  const lineup = ['a', 'b', 'c', 'd', 'e'];
  // random() always 0 moves each last item to the front in turn.
  assert.deepEqual(shuffleLineup(lineup, () => 0), ['b', 'c', 'd', 'e', 'a']);
  assert.deepEqual(shuffleLineup(lineup, () => 0.999), lineup);
  for (let i = 0; i < 20; i += 1) assert.deepEqual([...shuffleLineup(lineup)].sort(), lineup);
  assert.deepEqual(lineup, ['a', 'b', 'c', 'd', 'e'], 'the lineup itself is not reordered');
});

test('picks are saved, survive a bad row, and go with Clear scores', async () => {
  const store = new Map();
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: (event) => events.push(event.type),
  };
  try {
    const {
      BLIND_TASTE_EVENT, BLIND_TASTE_STORAGE_KEY, clearBlindTaste, clearModelFromBlindTaste, readBlindModeOn, readBlindTaste,
      saveBlindPick, writeBlindModeOn,
    } = await import('../src/lib/blindMode.ts');

    assert.equal(readBlindModeOn(), false, 'off until switched on');
    writeBlindModeOn(true);
    assert.equal(readBlindModeOn(), true);

    saveBlindPick('qwen3:8b', ['qwen3:8b', 'llama3.2']);
    saveBlindPick('llama3.2', ['qwen3:8b', 'llama3.2', 'gemma3:4b']);
    assert.equal(readBlindTaste().picks.length, 2);
    assert.ok(events.includes(BLIND_TASTE_EVENT), 'an open ranking hears about it');

    const saved = JSON.parse(store.get(BLIND_TASTE_STORAGE_KEY));
    store.set(BLIND_TASTE_STORAGE_KEY, JSON.stringify({ ...saved, picks: [...saved.picks, { picked: 7 }] }));
    assert.equal(readBlindTaste().picks.length, 2, 'one bad row costs only itself');
    store.set(BLIND_TASTE_STORAGE_KEY, '{not json');
    assert.deepEqual(readBlindTaste().picks, [], 'unreadable storage reads as no picks');

    store.set(BLIND_TASTE_STORAGE_KEY, JSON.stringify(saved));
    clearModelFromBlindTaste(['qwen3:8b']);
    assert.deepEqual(readBlindTaste().picks.map((pick) => pick.contestants), [['llama3.2', 'gemma3:4b']]);
    clearBlindTaste();
    assert.equal(store.has(BLIND_TASTE_STORAGE_KEY), false);
    assert.deepEqual(readBlindTaste().picks, []);
  } finally {
    delete globalThis.window;
  }
});

test('the reveal takes focus, so it is read out when the pick step goes', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/BlindShow.tsx', import.meta.url), 'utf8');
  assert.match(source, /<h2 id="blind-overlay-title" ref=\{headingRef\} tabIndex=\{-1\}>You picked/);
  assert.match(source, /useEffect\(\(\) => headingRef\.current\?\.focus\(\), \[\]\);/);
});
