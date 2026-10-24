// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DRAWING_SVG_MAX_CHARS,
  extractSvg,
  parseSvg,
  sanitizeSvg,
  checkDrawing,
  drawingJudgeMode,
  drawingNote,
} = require('../electron/drawingRound.cjs');
const { buildJudgePrompt, scoreQualityWithJudge, rubricForType, GENERAL_RUBRIC } = require('../electron/judgeScoring.cjs');
const { scoreSobriety, heuristicCanGrade } = require('../electron/benchmarkScoring.cjs');

const { DEFAULT_BENCHMARK_QUESTIONS, DRAWING_SUBJECTS, buildBenchmarkPromptPlan, upgradeSavedQuestions } = await import('../src/benchmarkSuite.ts');
const { questionMarker } = await import('../src/lib/runSheet.ts');

// lib/drawings.ts imports the API, which reads `window` on import.
globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };
const { drawingDataUrl, drawingSubject, showIdOf, lineupDrawings } = await import('../src/lib/drawings.ts');

const PELICAN = '<svg viewBox="0 0 200 160" width="400" height="320"><circle cx="55" cy="115" r="25" fill="none" stroke="#333"/><path d="M55 115 L95 115" stroke="#c00"/></svg>';

// ── Finding the SVG ─────────────────────────────────────────────────────────

test('the SVG is found in a code fence, with the chat around it left behind', () => {
  const answer = `Sure! Here is a pelican:\n\n\`\`\`svg\n${PELICAN}\n\`\`\`\n\nI hope you like it.`;
  assert.equal(extractSvg(answer), PELICAN);
});

test('the SVG is found in the open too, and a nested <svg> does not end it early', () => {
  const nested = '<svg viewBox="0 0 10 10"><svg x="1"><rect width="2" height="2"/></svg><circle r="1"/></svg>';
  assert.equal(extractSvg(`Drawing: ${nested} done`), nested);
});

test('thinking written inline does not count as the drawing', () => {
  const answer = `<think>I should start with <svg> and a viewBox...</think>\n${PELICAN}`;
  assert.equal(extractSvg(answer), PELICAN);
});

test('an answer cut off mid-drawing gives what there is, and an answer with none gives null', () => {
  assert.equal(extractSvg('```svg\n<svg viewBox="0 0 10 10"><rect width="5"\n```'), '<svg viewBox="0 0 10 10"><rect width="5"');
  assert.equal(extractSvg('I cannot draw, but a pelican is a large water bird.'), null);
  assert.equal(extractSvg(''), null);
});

// ── Cleaning ────────────────────────────────────────────────────────────────

const HOSTILE = [
  '<svg viewBox="0 0 100 100" onload="alert(1)" xmlns:ev="http://www.w3.org/2001/xml-events">',
  '<script>alert(2)</script>',
  '<script href="https://evil.example/x.js"/>',
  '<foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(3)">hi</div></foreignObject>',
  '<image href="https://evil.example/track.png" width="10" height="10"/>',
  '<use xlink:href="https://evil.example/sprite.svg#a"/>',
  '<a href="javascript:alert(4)"><rect width="10" height="10"/></a>',
  '<animate attributeName="href" to="javascript:alert(5)"/>',
  '<style>@import url(https://evil.example/a.css); .x { fill: url(https://evil.example/p.svg#p) } .y { fill: url(#g) }</style>',
  '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>',
  '<circle cx="50" cy="50" r="40" fill="url(#g)" onmouseover="alert(6)" style="stroke: url(http://evil.example/s)"/>',
  '<rect class="y" x="5" y="5" width="20" height="20" fill="url(&quot;https://evil.example/q&quot;)"/>',
  '<text x="10" y="90" ONCLICK="alert(7)">pelican</text>',
  '</svg>',
].join('');

test('a hostile SVG loses every script, handler, embedded page and outside link', () => {
  const clean = sanitizeSvg(HOSTILE);
  assert.ok(clean, 'the hostile SVG is well formed, so it is cleaned rather than rejected');
  for (const banned of ['<script', 'alert', 'onload', 'onclick', 'onmouseover', 'foreignObject', '<image', '<use', '<a ', '<animate', '@import', 'evil.example', 'javascript:', 'xmlns:ev', '<div']) {
    assert.ok(!clean.toLowerCase().includes(banned.toLowerCase()), `the cleaned drawing still contains ${banned}: ${clean}`);
  }
});

test('cleaning keeps the picture: shapes, in-document paint and text', () => {
  const clean = sanitizeSvg(HOSTILE);
  assert.match(clean, /<circle cx="50" cy="50" r="40" fill="url\(#g\)"><\/circle>/);
  assert.match(clean, /\.y \{ fill: url\(#g\) \}/);
  assert.match(clean, /<linearGradient id="g">/);
  assert.match(clean, /<text x="10" y="90">pelican<\/text>/);
});

test('the cleaned root declares its namespace, so an <img> draws it, and drops its fixed size', () => {
  const clean = sanitizeSvg(PELICAN);
  assert.ok(clean.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), clean);
  assert.match(clean, /viewBox="0 0 200 160"/);
  assert.doesNotMatch(clean.slice(0, clean.indexOf('>')), /width=|height=/);
  assert.equal(sanitizeSvg(clean), clean, 'cleaning a clean drawing changes nothing');
});

// ── The checks before any judge ────────────────────────────────────────────

test('a good drawing passes, cleaned, with a placeholder score left for the judge', () => {
  const check = checkDrawing(`\`\`\`svg\n${PELICAN}\n\`\`\``);
  assert.equal(check.ok, true);
  assert.equal(check.problem, null);
  assert.equal(check.svg, sanitizeSvg(PELICAN));
});

test('each failed check is a low score of its own, and only a viewBox-less drawing keeps a picture', () => {
  const cases = [
    ['missing', 'A pelican is a bird with a big beak.'],
    ['broken', '<svg viewBox="0 0 10 10"><rect width="5" height="5"/>'],
    ['broken', '<svg viewBox="0 0 10 10"><g><rect width="5"/></svg>'],
    ['broken', '<svg viewBox="0 0 10 10"><rect width=5 height="5"/></svg>'],
    ['broken', '<svg viewBox="0 0 10 10"><rect width="5" width="6"/></svg>'],
    ['broken', '<svg viewBox="0 0 10 10"><text>fish & chips</text></svg>'],
    ['broken', '<svg viewBox="0 0 10 10"><text>a&nbsp;b</text></svg>'],
    ['broken', '<!DOCTYPE svg [<!ENTITY lol "lol">]><svg viewBox="0 0 10 10"><text>&lol;</text></svg>'],
    ['too-big', `<svg viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(Math.ceil(DRAWING_SVG_MAX_CHARS / 20))}</svg>`],
    ['empty', '<svg viewBox="0 0 10 10"></svg>'],
    ['empty', '<svg viewBox="0 0 10 10"><defs><rect width="5" height="5"/></defs><text> </text></svg>'],
    ['empty', '<svg viewBox="0 0 10 10"><script>draw()</script></svg>'],
    ['no-viewbox', '<svg width="10" height="10"><rect width="5" height="5"/></svg>'],
    ['no-viewbox', '<svg viewBox="0 0 0 0"><rect width="5" height="5"/></svg>'],
  ];
  for (const [problem, answer] of cases) {
    const check = checkDrawing(answer);
    assert.equal(check.ok, false, `${problem}: ${answer.slice(0, 60)}`);
    assert.equal(check.problem, problem, `${answer.slice(0, 60)} should be ${problem}, was ${check.problem}`);
    assert.ok(check.score <= 30, `${problem} scores low by rule`);
    assert.equal(check.svg === null, problem !== 'no-viewbox', `${problem}: only a drawing with something to show keeps it`);
    assert.ok(check.note.length > 0);
  }
});

test('the scorer and the grader agree with the checks', () => {
  const prompt = { type: 'drawing', prompt: DEFAULT_BENCHMARK_QUESTIONS.find((q) => q.type === 'drawing').prompt };
  assert.equal(scoreSobriety(prompt, 'no svg here'), 0);
  // A failed check is a real finding, so it counts as graded; a drawing that
  // passed needs a judge, and before there is an answer it is assumed to.
  assert.equal(heuristicCanGrade('drawing', prompt.prompt, 'no svg here'), true);
  assert.equal(heuristicCanGrade('drawing', prompt.prompt, PELICAN), false);
  assert.equal(heuristicCanGrade('drawing', prompt.prompt), false);
  assert.equal(questionMarker(prompt), 'judge');
});

test('a parse that never closes, or a root that is not svg, does not parse', () => {
  assert.equal(parseSvg('<svg viewBox="0 0 1 1"><g>'), null);
  assert.equal(parseSvg('<SVG viewBox="0 0 1 1"></SVG>'), null);
  assert.ok(parseSvg('<?xml version="1.0"?><!-- hi --><svg viewBox="0 0 1 1"><style><![CDATA[ .a > b { fill: red } ]]></style></svg>'));
});

// ── How the judge sees it ───────────────────────────────────────────────────

test('only a local Ollama judge that reports vision is shown the picture', () => {
  assert.equal(drawingJudgeMode({ local: true, provider: 'ollama', capabilities: ['completion', 'vision'] }), 'picture');
  assert.equal(drawingJudgeMode({ local: true, provider: 'ollama', capabilities: ['completion'] }), 'code');
  assert.equal(drawingJudgeMode({ local: true, provider: 'ollama', capabilities: undefined }), 'code');
  assert.equal(drawingJudgeMode({ local: true, provider: 'lm-studio', capabilities: ['vision'] }), 'code');
  assert.equal(drawingJudgeMode({ local: false, provider: 'ollama', capabilities: ['vision'] }), 'code', 'the cloud judge is sent text only');
});

test('a picture judge is asked about the attached image; a code judge is given the SVG', () => {
  const prompt = { type: 'drawing', prompt: 'Generate an SVG of a pelican riding a bicycle.' };
  const svg = sanitizeSvg(PELICAN);
  const withPicture = buildJudgePrompt(prompt, svg, { picture: true });
  assert.match(withPicture, /attached image/);
  assert.ok(!withPicture.includes(svg), 'the picture judge is not also handed the code');
  const withCode = buildJudgePrompt(prompt, svg);
  assert.ok(withCode.includes(svg));
  assert.notEqual(rubricForType('drawing'), GENERAL_RUBRIC);
  assert.match(rubricForType('drawing'), /recognizable/);
});

test('scoreQualityWithJudge passes the picture choice through to the prompt it sends', async () => {
  const prompt = { type: 'drawing', prompt: 'Generate an SVG of a pelican riding a bicycle.' };
  let sent = '';
  const generate = async (judgePrompt) => { sent = judgePrompt; return '{"score": 77, "reason": "A clear pelican."}'; };
  const verdict = await scoreQualityWithJudge({ prompt, response: PELICAN, generate, picture: true });
  assert.deepEqual(verdict, { score: 77, reason: 'A clear pelican.', source: 'judge' });
  assert.match(sent, /attached image/);
});

test('the note under a drawing says which way it was judged', () => {
  const passed = checkDrawing(PELICAN);
  assert.match(drawingNote({ check: passed, judgedFrom: 'picture', judged: true, reason: 'Clear.' }), /^Judged from the picture\. Clear\.$/);
  assert.match(drawingNote({ check: passed, judgedFrom: 'code', judged: true, reason: '' }), /^Judged from the SVG code/);
  assert.match(drawingNote({ check: passed, judgedFrom: 'code', judged: false }), /^Not marked/);
  assert.match(drawingNote({ check: checkDrawing('nothing'), judgedFrom: 'code', judged: false }), /^No drawing/);
});

test('the run asks a drawing once, on its own budget, and an empty one never drags speed down', async () => {
  // main.cjs needs Electron to load, so its wiring is checked in the source,
  // as the other show tests do.
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  assert.match(main, /const repeats = prompt\.type === 'drawing' \? 1 : BENCHMARK_REPEATS;/);
  assert.match(main, /prompt\.type === 'drawing'\s*\?\s*await runDrawingPrompt\(/);
  assert.match(main, /num_predict: DRAWING_ANSWER_TOKENS/);
  assert.match(main, /setTimeout\(stop, DRAWING_TIMEOUT_MS\)/);
  assert.match(main, /!\(result\.type === 'drawing' && result\.status === 'no-response'\)/);
  // The drawing reaches the stage as soon as it is drawn.
  assert.match(main, /phase: 'prompt-complete',[\s\S]{0,400}drawing: completedPrompt\.drawing/);
});

// ── The question set ────────────────────────────────────────────────────────

test('the General set asks one drawing, the pelican, and still asks ten questions', () => {
  const drawings = DEFAULT_BENCHMARK_QUESTIONS.filter((q) => q.type === 'drawing');
  assert.equal(DEFAULT_BENCHMARK_QUESTIONS.length, 10);
  assert.equal(drawings.length, 1);
  assert.match(drawings[0].prompt, /^Generate an SVG of a pelican riding a bicycle\./);
  assert.match(drawings[0].prompt, /viewBox/);
  assert.match(drawings[0].prompt, /no scripts, and nothing loaded from outside it/);
});

test('a longer show alternates the drawing with Summaries, a new subject each time it draws', () => {
  const slot = (count) => buildBenchmarkPromptPlan(count, DEFAULT_BENCHMARK_QUESTIONS).filter((_, index) => index % 10 === 5);
  const twenty = slot(20);
  assert.deepEqual(twenty.map((q) => q.type), ['drawing', 'format']);
  assert.equal(twenty[1].label, 'Summaries');
  // A hundred questions draw each subject exactly once.
  const hundred = slot(100);
  assert.deepEqual(hundred.filter((q) => q.type === 'drawing').map((q) => drawingSubject(q.prompt)), DRAWING_SUBJECTS);
  assert.equal(hundred.filter((q) => q.type === 'format').length, 5);
  const ids = buildBenchmarkPromptPlan(100, DEFAULT_BENCHMARK_QUESTIONS).map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  // A user's own drawing question is asked as written, every round.
  const own = [{ id: 'mine', label: 'Mine', type: 'drawing', prompt: 'Draw my cat as an SVG.' }];
  assert.ok(buildBenchmarkPromptPlan(10, own).every((q) => q.prompt === 'Draw my cat as an SVG.'));
});

test('a saved General set from before the drawing becomes today’s, and an edited one is kept', () => {
  const old = DEFAULT_BENCHMARK_QUESTIONS.map((q) => (q.type === 'drawing'
    ? { id: 'summarize_plan_1', label: 'Summaries', type: 'format', prompt: 'Summarize this plan in exactly three numbered steps: prepare the kitchen timer and music request, check constraints, and confirm with the user before acting.' }
    : q));
  assert.deepEqual(upgradeSavedQuestions(old), DEFAULT_BENCHMARK_QUESTIONS);
  const edited = old.map((q, i) => (i === 0 ? { ...q, prompt: 'Something of my own' } : q));
  assert.equal(upgradeSavedQuestions(edited), edited);
  assert.equal(upgradeSavedQuestions(DEFAULT_BENCHMARK_QUESTIONS), DEFAULT_BENCHMARK_QUESTIONS);
});

// ── Showing it ──────────────────────────────────────────────────────────────

test('only a cleaned SVG becomes an image source', () => {
  const clean = sanitizeSvg(PELICAN);
  assert.ok(drawingDataUrl(clean).startsWith('data:image/svg+xml;charset=utf-8,%3Csvg'));
  assert.equal(drawingDataUrl(null), null);
  assert.equal(drawingDataUrl('<script>alert(1)</script>'), null);
  assert.equal(drawingDataUrl(`<svg>${'x'.repeat(70000)}</svg>`), null);
});

test('the stage groups drawings by show, and the results take each model’s first drawing', () => {
  assert.equal(showIdOf('speed-date-1729000000000-ab12cd-3'), 'speed-date-1729000000000-ab12cd');
  assert.equal(showIdOf('speed-date-1729000000000-ab12cd-complete'), 'speed-date-1729000000000-ab12cd');
  assert.equal(showIdOf(undefined), null);
  const drawing = { svg: sanitizeSvg(PELICAN), note: 'Judged from the picture.' };
  const results = {
    'qwen3:8b': { model: 'qwen3:8b', prompts: [{ id: 'a', type: 'json', sobrietyScore: 90 }, { id: 'drawing_1', type: 'drawing', sobrietyScore: 81, drawing }] },
    'gemma3:4b': { model: 'gemma3:4b', prompts: [{ id: 'a', type: 'json', sobrietyScore: 70 }] },
  };
  const found = lineupDrawings(['gemma3:4b', 'qwen3:8b'], results);
  assert.equal(found.length, 1);
  assert.equal(found[0].model, 'qwen3:8b');
  assert.equal(found[0].drawing, drawing);
  assert.equal(found[0].prompt.sobrietyScore, 81);
});
