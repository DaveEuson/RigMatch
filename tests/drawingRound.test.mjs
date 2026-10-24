// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DRAWING_SVG_MAX_CHARS,
  DRAWING_MAX_USES,
  KEPT_ELEMENTS,
  KEPT_ATTRIBUTES,
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

const BANNED = ['<script', 'alert', 'onload', 'onclick', 'onmouseover', 'onbegin', 'foreignObject', '<image', '<use', '<a ', '<animate', '<set', '<style', '@import', 'evil.example', 'javascript', '&#', 'xmlns:ev', '<div'];

function assertClean(clean, input) {
  for (const banned of BANNED) {
    assert.ok(!clean.toLowerCase().includes(banned.toLowerCase()), `cleaning ${input.slice(0, 80)} left ${banned}: ${clean}`);
  }
  // The structural guarantee, whatever the input: read back, the cleaned
  // drawing holds only listed elements and listed attributes.
  const walk = (node) => {
    assert.ok(KEPT_ELEMENTS.has(node.name), `<${node.name}> is not on the list`);
    for (const [name] of node.attrs) {
      assert.ok(KEPT_ATTRIBUTES.has(name) || (node.name === 'svg' && (name === 'xmlns' || name === 'xmlns:xlink')), `${name} on <${node.name}> is not on the list`);
    }
    node.children.filter((child) => typeof child !== 'string').forEach(walk);
  };
  walk(parseSvg(clean));
}

test('a hostile SVG loses every script, handler, embedded page and outside link', () => {
  const clean = sanitizeSvg(HOSTILE);
  assert.ok(clean, 'the hostile SVG is well formed, so it is cleaned rather than rejected');
  assertClean(clean, HOSTILE);
});

test('cleaning keeps the picture: shapes, in-document paint and text', () => {
  const clean = sanitizeSvg(HOSTILE);
  assert.match(clean, /<circle cx="50" cy="50" r="40" fill="url\(#g\)"><\/circle>/);
  assert.match(clean, /<linearGradient id="g">/);
  assert.match(clean, /<text x="10" y="90">pelican<\/text>/);
  assert.match(sanitizeSvg('<svg viewBox="0 0 9 9"><rect width="9" height="9" style="fill: #fc0; stroke: url(#g)"/></svg>'), /style="fill: #fc0; stroke: url\(#g\)"/);
});

test('tags split or doubled to slip past a single strip do not parse at all', () => {
  for (const input of [
    '<svg viewBox="0 0 9 9"><scr<script>ipt>alert(1)</script></svg>',
    '<svg viewBox="0 0 9 9"><<script>script>alert(1)<</script>/script></svg>',
    '<svg viewBox="0 0 9 9"><rect width="9" height="9" on<script>load="alert(1)"/></svg>',
    '<svg viewBox="0 0 9 9"><rect width="9" height="9"/><script>alert(1)</svg>',
  ]) {
    assert.equal(sanitizeSvg(input), null, input);
    assert.equal(checkDrawing(input).svg, null, `${input} must not reach the screen`);
  }
});

test('mixed case, encoded and animated ways in are all removed', () => {
  const inputs = [
    // Mixed case: SVG names are case-sensitive, and only exact ones are kept.
    '<svg viewBox="0 0 9 9"><ScRiPt>alert(1)</ScRiPt><SCRIPT>alert(2)</SCRIPT><rect width="9" height="9" OnLoad="alert(3)" ONCLICK="alert(4)"/></svg>',
    // Entity-encoded javascript: in links, decimal and hex.
    '<svg viewBox="0 0 9 9"><linearGradient id="g" href="&#106;avascript:alert(1)"/><linearGradient id="h" xlink:href="&#x6A;&#x61;vascript:alert(2)"/><rect width="9" height="9"/></svg>',
    // An encoded outside url() in a paint, and a CSS escape in a style.
    '<svg viewBox="0 0 9 9"><rect width="9" height="9" fill="u&#114;l(https://evil.example/p)" style="fill: u\\72l(https://evil.example/q)"/></svg>',
    // <set> and <animate> that would turn a link into javascript: once drawn.
    '<svg viewBox="0 0 9 9"><linearGradient id="g"><set attributeName="href" to="javascript:alert(1)"/></linearGradient><rect width="9" height="9"><animate attributeName="xlink:href" values="javascript:alert(2)" begin="0s" onbegin="alert(3)"/></rect></svg>',
    // A link that only looks local once decoded is still checked as decoded.
    '<svg viewBox="0 0 9 9"><linearGradient id="g" href="&#35;javascript:alert(1)"/><rect width="9" height="9"/></svg>',
    // Script written as text is text: escaped, and never markup.
    '<svg viewBox="0 0 9 9"><text x="1" y="5">&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>',
  ];
  for (const input of inputs) {
    const clean = sanitizeSvg(input);
    assert.ok(clean, `well formed, so cleaned rather than rejected: ${input}`);
    assertClean(clean.replace('&lt;script&gt;alert(1)&lt;/script&gt;', ''), input);
  }
  // The encoded links are not kept; a plain or encoded #fragment is.
  assert.doesNotMatch(sanitizeSvg(inputs[1]), /href/);
  assert.match(sanitizeSvg('<svg viewBox="0 0 9 9"><linearGradient id="g" href="&#35;h"/><rect width="9" height="9"/></svg>'), /href="&#35;h"/);
});

test('the cleaned root declares its namespace, so an <img> draws it, and drops its fixed size', () => {
  const clean = sanitizeSvg(PELICAN);
  assert.ok(clean.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), clean);
  assert.match(clean, /viewBox="0 0 200 160"/);
  assert.doesNotMatch(clean.slice(0, clean.indexOf('>')), /width=|height=/);
  assert.equal(sanitizeSvg(clean), clean, 'cleaning a clean drawing changes nothing');
});

// ── Colours from <style>, and copies with <use> ────────────────────────────

test('simple <style> rules are copied onto the shapes they colour, in cascade order', () => {
  // The shape gemma3:4b and mistral:7b answered the pelican in: every colour
  // in a <style> block, and nothing on the shapes themselves.
  const clean = sanitizeSvg([
    '<svg viewBox="0 0 200 160"><style><![CDATA[',
    '/* the bird */ .body { fill: #f5f5f0; stroke: #555; stroke-width: 2 }',
    'circle { fill: none; stroke: #333 } #sun { fill: yellow !important }',
    '.beak, .pouch { fill: rgb(242, 163, 58) } text { font-family: "Comic Sans MS", sans-serif }',
    ']]></style>',
    '<ellipse class="body" cx="85" cy="58" rx="27" ry="16"/>',
    '<circle cx="55" cy="115" r="25"/><circle id="sun" cx="10" cy="10" r="5"/>',
    '<path class="beak" d="M1 1L5 5" fill="black" style="stroke: red"/>',
    '<text x="1" y="9">Hi</text></svg>',
  ].join(''));
  assert.doesNotMatch(clean, /<style/);
  assert.match(clean, /<ellipse class="body" [^>]*style="fill: #f5f5f0; stroke: #555; stroke-width: 2"/);
  assert.match(clean, /<circle cx="55" cy="115" r="25" style="fill: none; stroke: #333">/);
  // An #id beats an element rule, whatever their order.
  assert.match(clean, /<circle id="sun" [^>]*style="fill: yellow; stroke: #333">/);
  // A rule beats the fill attribute, and the shape's own style beats the rule.
  assert.match(clean, /<path class="beak" d="M1 1L5 5" fill="black" style="fill: rgb\(242, 163, 58\); stroke: red">/);
  assert.match(clean, /<text x="1" y="9" style="font-family: Comic Sans MS, sans-serif">Hi<\/text>/);
});

test('rules and declarations that could load or hide anything are left out', () => {
  const clean = sanitizeSvg([
    '<svg viewBox="0 0 9 9"><style>',
    '@import url(https://evil.example/a.css);',
    '@media screen { .a { fill: red } }',
    '.a { fill: url(https://evil.example/p) ; stroke: url(#ok); behavior: url(x.htc); -moz-binding: url(y) }',
    '.a { stroke-width: expression(alert(1)); opacity: 0\\2e 5; fill-opacity: "1" }',
    'svg .a, rect.a, .a:hover, * { fill: green }',
    '</style><rect class="a" width="9" height="9" style="fill: url(javascript:alert(1)); color: #123"/></svg>',
  ].join(''));
  assert.match(clean, /<rect class="a" width="9" height="9" style="stroke: url\(#ok\); color: #123">/);
  for (const banned of ['evil', 'alert', 'behavior', 'binding', 'expression', 'green', 'red', '@', '\\', '<style']) {
    assert.ok(!clean.includes(banned), `${banned} survived: ${clean}`);
  }
});

test('a <use> copies a shape from the same drawing, and nothing else', () => {
  const wheels = sanitizeSvg('<svg viewBox="0 0 200 160"><defs><circle id="wheel" r="25" fill="none" stroke="#333"/></defs><use href="#wheel" x="55" y="115"/><use xlink:href="#wheel" x="145" y="115"/></svg>');
  assert.match(wheels, /<use href="#wheel" x="55" y="115"><\/use><use xlink:href="#wheel" x="145" y="115"><\/use>/);
  // Two wheels drawn from a definition are a drawing, not an empty SVG.
  assert.equal(checkDrawing(`\`\`\`svg\n${wheels}\n\`\`\``).ok, true);

  const dropped = [
    '<use href="https://evil.example/sprite.svg#wheel"/>',
    '<use href="#missing"/>',
    '<use href="&#106;avascript:alert(1)"/>',
    // A copy of a copy, and a copy of a group that holds a copy: both could
    // multiply, and the second loops back on itself.
    '<use id="u1" href="#wheel"/><use href="#u1"/>',
    '<g id="loop"><use href="#loop"/></g>',
  ];
  for (const use of dropped) {
    const clean = sanitizeSvg(`<svg viewBox="0 0 9 9"><circle id="wheel" r="2"/>${use}</svg>`);
    const kept = (clean.match(/<use /g) ?? []).length;
    assert.equal(kept, use.startsWith('<use id="u1"') ? 1 : 0, `${use} -> ${clean}`);
  }

  const many = sanitizeSvg(`<svg viewBox="0 0 9 9"><circle id="dot" r="1"/>${'<use href="#dot"/>'.repeat(DRAWING_MAX_USES + 10)}</svg>`);
  assert.equal((many.match(/<use /g) ?? []).length, DRAWING_MAX_USES);
});

// ── The checks before any judge ────────────────────────────────────────────

test('an <svg> mentioned before the drawing does not break it', () => {
  // Echoed from the question itself, which asks for "one self-contained <svg> element".
  const fenced = `Here's one self-contained \`<svg>\` element with a viewBox:\n\`\`\`svg\n${PELICAN}\n\`\`\`\nIt has a viewBox, as asked.`;
  assert.equal(extractSvg(fenced), PELICAN);
  assert.equal(checkDrawing(fenced).ok, true);
  const open = `I will write one <svg> element with a viewBox.\n${PELICAN}`;
  assert.equal(extractSvg(open), PELICAN);
  assert.equal(checkDrawing(open).ok, true);
});

test('a long answer is measured before anything reads it', () => {
  const started = Date.now();
  assert.equal(checkDrawing(`${' '.repeat(200000)}<svg`).problem, 'too-big');
  assert.equal(checkDrawing(`<svg viewBox="0 0 1 1">${' \n'.repeat(30000)}`).problem, 'broken');
  assert.equal(checkDrawing(`\`\`\`${' '.repeat(60000)}`).problem, 'missing');
  assert.equal(checkDrawing(`<think>${'<svg '.repeat(6000)}`).problem, 'broken');
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
});

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
  assert.equal(found[0].score, 81);
  // A drawing nothing marked keeps its placeholder out of sight.
  results['qwen3:8b'].prompts[1].scoredBy = 'unjudged';
  assert.equal(lineupDrawings(['qwen3:8b'], results)[0].score, undefined);
});

test('the release smoke gives a drawing the app’s budget and asks it once', async () => {
  // The smoke runs the default plan, drawing included; at 300 tokens a
  // pelican is cut off, and a cut-off answer fails smoke:bench:strict.
  const { readFileSync } = await import('node:fs');
  const smoke = readFileSync(new URL('../scripts/smoke-benchmark.mjs', import.meta.url), 'utf-8');
  assert.match(smoke, /require\('\.\.\/electron\/drawingRound\.cjs'\)/);
  assert.match(smoke, /prompt\.type === 'drawing' \? \{ \.\.\.BENCHMARK_OPTIONS, num_predict: DRAWING_ANSWER_TOKENS \} : BENCHMARK_OPTIONS/);
  assert.match(smoke, /const repeat = prompt\.type === 'drawing' \? 1 : args\.repeat;/);
});
