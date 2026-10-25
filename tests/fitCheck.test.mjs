// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { catalogRows, formatTable, rankModels, inDefaultList, ollamaUrl, toJson } = await import('../cli/fitCheck.ts');

/**
 * The command-line fit check: which models it lists, how it ranks and marks
 * them, and the two shapes it prints. The last tests run the real command,
 * from source and as built, with --vram so no GPU or Ollama is needed.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const card = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, unifiedMemory: false, ramGb: 32, platform: 'win32', arch: 'x64', source: 'detected' };
// Nothing listens on the discard port, so the CLI sees no Ollama and answers fast.
const noOllama = { ...process.env, OLLAMA_HOST: '127.0.0.1:9' };
const ascii = /^[\x20-\x7e\n]*$/;

const runCli = (args, file = join(root, 'cli', 'rigmatch-fit.ts'), env = noOllama) => new Promise((resolve) => {
  const started = Date.now();
  execFile(process.execPath, [file, ...args], { cwd: root, env, timeout: 30_000 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr, ms: Date.now() - started });
  });
});

test('the catalog is every downloadable chat size in the snapshot, once, sized in GiB', () => {
  const rows = catalogRows();
  const names = rows.map((row) => row.name);
  assert.ok(rows.length > 300, `${rows.length} rows`);
  assert.equal(new Set(names).size, names.length, 'no duplicates');
  const qwen = rows.find((row) => row.name === 'qwen3:8b');
  assert.equal(qwen.sizeGb, 4.8, "ollama.com's 5.2 GB is 4.84 GiB, the unit graphics memory is counted in");
  assert.equal(qwen.params, '8B');
  assert.equal(rows.find((row) => row.name === 'mixtral:8x7b').params, '47B', 'eight 7B experts are 46.7B, not 7B');
  assert.ok(rows.filter((row) => row.name.endsWith(':latest')).every((row) => row.params === ''), '"Latest" is not a size');
  assert.ok(!names.includes('qwen3:latest'), 'latest is qwen3:8b under another name');
  assert.ok(names.some((name) => name.endsWith(':latest')), 'but kept where it is the only size');
  assert.ok(!names.some((name) => /embed|minilm|bge-/.test(name)), 'no embedding models');
  assert.ok(!names.some((name) => /cloud|mlx|q\d_|fp16|bf16/i.test(name)), 'no cloud tags, MLX builds or quantizations');
  assert.ok(!names.some((name) => name.startsWith('x/flux2') || name.startsWith('x/z-image')), 'no image makers');
  assert.ok(rows.every((row) => row.sizeGb > 0));
});

test('ranking is by points, and an installed model is graded on what Ollama says about it', () => {
  const installed = [
    { name: 'qwen3.5:9b', sizeGb: 6.1, params: '9.0B' },
    { name: 'hf.co/someone/custom-7b-GGUF:Q4_K_M', sizeGb: 4.4, params: '7.2B' },
    { name: 'nomic-embed-text:latest', sizeGb: 0.3, params: '137M' },
  ];
  const ranked = rankModels(catalogRows(), card, { installed });
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok((ranked[i - 1].grade.points ?? -1) >= (ranked[i].grade.points ?? -1), 'best points first');
  }
  // The app's Models list takes Ollama's size and parameter count for a
  // model you have (mergeModelRows), so the terminal does too.
  const mine = ranked.find((model) => model.row.name === 'qwen3.5:9b');
  assert.equal(mine.installed, true);
  assert.equal(mine.row.sizeGb, 6.1);
  assert.equal(mine.row.params, '9.0B');
  assert.equal(mine.command, 'ollama run qwen3.5:9b', 'a model you have is run, not pulled again');
  const onEight = rankModels(catalogRows(), { ...card, vramGb: 8 }, { installed }).find((model) => model.row.name === 'qwen3.5:9b');
  assert.equal(onEight.grade.fit.tone, 'good', 'at 6.1 GiB it fits 8 GB well; at the catalog 6.6 GB it was a tight C');
  assert.equal(onEight.grade.letter, 'A');

  const custom = ranked.find((model) => model.row.name.startsWith('hf.co/'));
  assert.ok(custom, 'an installed model the catalog does not know is graded too');
  assert.equal(custom.command, 'ollama run hf.co/someone/custom-7b-GGUF:Q4_K_M');
  assert.ok(!ranked.some((model) => model.row.name === 'nomic-embed-text:latest'), 'still no embedding models');
  assert.equal(ranked.filter((model) => model.installed).length, 2);
  assert.equal(ranked.find((model) => model.row.name === 'qwen3:8b').command, 'ollama pull qwen3:8b');
  assert.equal(rankModels(catalogRows(), card, { provider: 'lm-studio' }).find((m) => m.row.name === 'qwen3:8b').command, 'lms get qwen3-8b');

  // `ollama pull gemma3` lists as gemma3:latest, which is the 4b under another
  // name: it marks that row rather than adding a second, unmarked one.
  const pulledBare = rankModels(catalogRows(), card, { installed: [{ name: 'gemma3:latest', sizeGb: 3.1 }] });
  const gemma = pulledBare.find((model) => model.row.name === 'gemma3:4b');
  assert.equal(gemma.installed, true);
  assert.equal(gemma.command, 'ollama run gemma3:latest', 'under the name Ollama has it by');
  assert.ok(!pulledBare.some((model) => model.row.name === 'gemma3:latest'), 'no extra gemma3:latest row');
  const withOwnLatest = catalogRows({ solo: { badges: [], sizes: { latest: { inputs: ['text'], sizeGb: 2 }, '1b': { inputs: ['text'], sizeGb: 0.8 } } } });
  assert.deepEqual(withOwnLatest.map((row) => [row.name, row.aliases]), [['solo:1b', undefined], ['solo:latest', undefined]]);
});

test('the default list leads with current chat models and leaves the niche ones to --all', () => {
  const rows = catalogRows();
  const hardware = [{ vramGb: 0, noGpu: true }, { vramGb: 4 }, { vramGb: 6 }, { vramGb: 8 }, { vramGb: 12 }, { vramGb: 16 }, { vramGb: 24 }];
  for (const hw of hardware) {
    const shown = rankModels(rows, { ...hw, ramGb: 32 }).filter(inDefaultList).map((model) => model.row.name);
    // Classifiers, decision and extraction models, document readers: the release sweep found these leading lists.
    for (const name of shown) {
      assert.doesNotMatch(name, /^(tev1|nimble|clef|clef-flash|granite3\.2-vision|bespoke-minicheck|reader-lm|nuextract|codegeex4|yi-coder|nexusraven|starcoder2|duckdb-nsql)\b/,
        `${name} is not a chat model (${hw.vramGb} GB)`);
    }
  }
  const twelve = rankModels(rows, card).filter(inDefaultList).map((model) => model.row.name);
  const at = (name) => twelve.indexOf(name);
  for (const current of ['qwen3.5:9b', 'qwen3:8b', 'deepseek-r1:8b', 'mistral-nemo:12b']) assert.ok(at(current) >= 0 && at(current) < 10, `${current} at ${at(current)}`);
  for (const older of ['falcon2:11b', 'stablelm2:12b', 'yi:9b']) assert.ok(at(older) > at('qwen3:8b'), `${older} below qwen3:8b`);
  assert.ok(rankModels(rows, card).some((model) => model.row.name === 'tev1:4b'), '--all still has them');
});

test('a mixture of experts too big for the card gets RAM assist when it would still run well', () => {
  const ranked = rankModels(catalogRows(), card);
  const qwen30 = ranked.find((model) => model.row.name === 'qwen3:30b');
  assert.equal(qwen30.grade.fit.tone, 'tight');
  assert.match(qwen30.grade.fit.label, /^RAM assist/);
  assert.equal(qwen30.grade.letter, 'C');
  assert.ok(qwen30.grade.tokensPerSecond >= 10);
  assert.equal(ranked.find((model) => model.row.name === 'qwen3:32b').grade.letter, 'F', 'a dense 32B stays too big');
  assert.equal(ranked.find((model) => model.row.name === 'mixtral:8x7b').grade.letter, 'F', 'too slow spilled: a quarter of 26 GB per word');
  const smallRam = rankModels(catalogRows(), { ...card, ramGb: 8 }).find((model) => model.row.name === 'qwen3:30b');
  assert.equal(smallRam.grade.letter, 'F', 'no room in 8 GB of system memory');
});

test('the table is ASCII, fits the terminal, and says what it left out', () => {
  const ranked = rankModels(catalogRows(), card, { installed: [{ name: 'qwen3.5:9b', sizeGb: 6.1, params: '9.0B' }] });
  const table = formatTable(ranked, card, { ollamaReachable: true });
  const lines = table.split('\n');
  assert.equal(lines[0], 'RigMatch fit check');
  assert.equal(lines[1], 'NVIDIA GeForce RTX 4070, 12 GB graphics memory, 32 GB system memory');
  assert.equal(lines[2], 'Ollama is running: 1 of these is installed, marked *.');
  assert.match(table, /^A +qwen3\.5:9b \* .* ollama run qwen3\.5:9b$/m);
  const header = lines.findIndex((line) => line.startsWith('Grade'));
  assert.match(lines[header], /^Grade +Model +Size +Speed +Fit +Command$/);
  const body = lines.slice(header + 1, header + 21);
  assert.equal(body.length, 20);
  for (const line of body) assert.match(line, /^[A-D] +\S+( \*)? +[\d.]+ GB +~\d+ tok\/s +\S.* +ollama (pull|run) \S+$/);
  assert.equal(lines[header + 21], '');
  const running = ranked.filter(inDefaultList).length;
  assert.match(table, new RegExp(`The best 20 of ${running} models that run here\\.`));
  assert.ok(!/guard|shieldgemma/.test(body.join('\n')), 'safety classifiers wait for --all');
  // Windows PowerShell 5.1 turned the old "·" separators into "┬╖".
  assert.match(table, ascii);
  assert.match(formatTable(ranked, card, { all: true }), ascii);

  const all = formatTable(ranked, card, { all: true });
  assert.match(all, /^F +\S+/m, '--all includes what will not fit');
  assert.match(all, /Ollama is not running here, so installed models are not marked\./);

  for (const columns of [80, 60]) {
    const narrow = formatTable(ranked, card, { ollamaReachable: true, columns });
    for (const line of narrow.split('\n')) assert.ok(line.length <= columns, `${line.length} > ${columns}: ${line}`);
    assert.match(narrow, /^Get one with: ollama pull <model>\. Run one you have with:\s+ollama run <model>$/m);
    assert.doesNotMatch(narrow, /^Grade.*Command$/m, 'the command column goes first');
  }
  assert.match(formatTable(ranked, card, { columns: 80 }), /^Grade +Model +Size +Speed +Fit$/m, 'at 80 columns the Fit column stays');
  assert.match(formatTable(ranked, card, { columns: 50 }), /^Grade +Model +Size +Speed$/m, 'narrower, it goes too');
});

test('a terminal gets the show: the marquee and the Top Match, in ASCII', () => {
  const ranked = rankModels(catalogRows(), card, { installed: [{ name: 'qwen3.5:9b', sizeGb: 6.1, params: '9.0B' }] });
  const top = ranked.filter(inDefaultList)[0];
  const table = formatTable(ranked, card, { ollamaReachable: true, columns: 100, show: true });
  const lines = table.split('\n');
  assert.equal(lines[0], 'o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o');
  assert.equal(lines[1], '|   R I G M A T C H     fit check       |');
  assert.equal(lines[2], '|   Who will your PC go home with?      |');
  assert.equal(lines[3], lines[0]);
  assert.equal(lines[4], 'NVIDIA GeForce RTX 4070, 12 GB graphics memory, 32 GB system memory');
  assert.ok(lines.slice(0, 4).every((line) => line.length === 41), 'the sign is one width');
  const speed = Math.round(top.grade.tokensPerSecond);
  assert.equal(lines.at(-1), `Tonight's Top Match: ${top.row.name} (${top.grade.letter}, ~${speed} tok/s). Say hi: ollama run ${top.row.name}`);
  assert.match(table, ascii);
  assert.match(formatTable(ranked, card, { provider: 'lm-studio', show: true }), new RegExp(`Find it with: lms get ${top.row.name.replace(/[.]/g, '\\.')}$`));

  // Too narrow for the sign, the plain title, and the Top Match still fits.
  const narrow = formatTable(ranked, card, { ollamaReachable: true, columns: 40, show: true }).split('\n');
  assert.equal(narrow[0], 'RigMatch fit check');
  const match = narrow.findIndex((line) => line.startsWith("Tonight's Top Match:"));
  assert.ok(match > 0);
  for (const line of narrow.slice(match)) assert.ok(line.length <= 40, `${line.length} > 40: ${line}`);

  // Piped into a file or a script, none of it.
  const plain = formatTable(ranked, card, { ollamaReachable: true });
  assert.equal(plain.split('\n')[0], 'RigMatch fit check');
  assert.doesNotMatch(plain, /o-\*-o|Top Match/);
});

test('the driver advice matches the problem', () => {
  const ranked = rankModels(catalogRows(), card);
  assert.match(formatTable(ranked, { ...card, driverProblem: 'reboot-required' }), /Your NVIDIA driver was updated, but the old one is still running\. Restart your computer/);
  assert.match(formatTable(ranked, { ...card, driverProblem: 'driver-missing' }), /Install or repair the NVIDIA driver, then restart your computer\./);
  assert.match(formatTable(ranked, { ...card, source: 'flag' }), /--vram, not this computer's/);
});

test('installed models outside the list are counted honestly, and --installed lists them', () => {
  // Dave's PC said "5 of these are installed, marked *" over a list with no
  // star in it: what you have is rarely among the best 20 for the card.
  const have = (...names) => rankModels(catalogRows(), card, { installed: names.map((name) => ({ name, sizeGb: 0 })) });
  const outside = have('smollm2:135m', 'qwen3:32b');
  assert.equal(formatTable(outside, card, { ollamaReachable: true }).split('\n')[2],
    'Ollama is running with 2 models installed, none of them in this list. --installed lists them.');
  const mixed = have('qwen3.5:9b', 'smollm2:135m', 'qwen3:32b');
  assert.equal(formatTable(mixed, card, { ollamaReachable: true }).split('\n')[2],
    'Ollama is running with 3 models installed: 1 in this list, marked *. --installed lists all 3.');

  const mine = formatTable(mixed, card, { ollamaReachable: true, installedOnly: true });
  const lines = mine.split('\n');
  assert.equal(lines[2], 'Ollama is running: your 3 installed models, best first.');
  const header = lines.findIndex((line) => line.startsWith('Grade'));
  const listed = lines.slice(header + 1, header + 4).map((line) => line.split(/ +/).slice(0, 2));
  assert.deepEqual(listed.map(([, name]) => name), ['qwen3.5:9b', 'smollm2:135m', 'qwen3:32b'], 'every installed model, best first');
  assert.equal(listed[0][0], 'A');
  assert.equal(listed[2][0], 'F', 'a will-not-fit one included');
  assert.equal(lines[header + 4], '');
  assert.match(mine, /^3 installed models\. Fit grade A is the best pick/m);
});

test('--json carries the fields a script needs, in ASCII', () => {
  const ranked = rankModels(catalogRows(), card);
  const json = toJson(ranked, card, { ollamaReachable: false, version: '9.9.9' });
  assert.deepEqual(Object.keys(json), ['tool', 'version', 'hardware', 'provider', 'ollamaReachable', 'models']);
  assert.equal(json.tool, 'rigmatch-fit');
  assert.equal(json.version, '9.9.9');
  assert.deepEqual(json.hardware, { gpu: card.gpu, vramGb: 12, unifiedMemory: false, ramGb: 32, platform: 'win32', arch: 'x64', source: 'detected' });
  assert.equal(json.models.length, ranked.length, 'every model, not the first 20');
  assert.deepEqual(Object.keys(json.models[0]), [
    'model', 'grade', 'points', 'verdict', 'fit', 'sizeGb', 'params', 'spareGb', 'tokensPerSecond', 'speedSource', 'installed', 'command', 'why',
  ]);
  const verdicts = new Set(json.models.map((model) => model.verdict));
  for (const verdict of verdicts) assert.match(verdict, /^(runs-well|barely-runs|wont-fit|unknown)$/);
  assert.ok(verdicts.has('runs-well') && verdicts.has('wont-fit'));
  assert.match(JSON.stringify(json), /^[\x20-\x7e]*$/);
  assert.equal(toJson(ranked, card, { provider: 'lm-studio' }).ollamaReachable, null);
});

test('OLLAMA_HOST is read the way Ollama reads it', () => {
  assert.equal(ollamaUrl(undefined), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl(''), 'http://127.0.0.1:11434');
  assert.equal(ollamaUrl('127.0.0.1:9'), 'http://127.0.0.1:9');
  assert.equal(ollamaUrl('example.com'), 'http://example.com:11434', 'no scheme: Ollama\'s own port');
  assert.equal(ollamaUrl('http://example.com'), 'http://example.com:80', 'a scheme brings its own default port');
  assert.equal(ollamaUrl('https://example.com'), 'https://example.com:443');
  assert.equal(ollamaUrl('https://example.com:443/ollama/'), 'https://example.com:443/ollama', 'a path is kept');
  assert.equal(ollamaUrl('http://box.lan:80'), 'http://box.lan:80');
  assert.equal(ollamaUrl('0.0.0.0'), 'http://127.0.0.1:11434', '0.0.0.0 is where a server listens, not an address to call');
  assert.equal(ollamaUrl('0.0.0.0:11500'), 'http://127.0.0.1:11500');
  assert.equal(ollamaUrl('[::1]:11434'), 'http://[::1]:11434');
});

test('the command runs from source: --json, --provider, --vram 0 and its errors', async () => {
  const json = await runCli(['--vram', '12', '--json']);
  assert.equal(json.code, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.hardware.vramGb, 12);
  assert.equal(parsed.hardware.source, 'flag');
  assert.equal(parsed.ollamaReachable, false);
  assert.equal(parsed.models[0].grade, 'A');
  assert.equal(parsed.version, JSON.parse(readFileSync(join(root, 'cli', 'package.json'), 'utf8')).version);

  // 0 GB and a 1.5 GB carve-out are both no usable graphics card, graded alike.
  const none = JSON.parse((await runCli(['--vram', '0', '--json'])).stdout);
  const carve = JSON.parse((await runCli(['--vram', '1.5', '--json'])).stdout);
  assert.equal(none.hardware.gpu, 'No graphics card');
  const letters = (result) => Object.fromEntries(result.models.map((model) => [model.model, model.grade]));
  const [noneLetters, carveLetters] = [letters(none), letters(carve)];
  for (const name of ['llama3.2:3b', 'qwen3:4b', 'qwen3:14b', 'gemma3:27b']) assert.equal(noneLetters[name], carveLetters[name], name);
  assert.equal(noneLetters['qwen3:14b'], 'F', 'too big for the processor: F, not "?"');
  assert.match((await runCli(['--vram', '0'])).stdout.split('\n')[1], /^No graphics card, [\d.]+ GB system memory$/);

  const lms = await runCli(['--vram', '8', '--provider', 'lmstudio']);
  assert.equal(lms.code, 0, lms.stderr);
  assert.match(lms.stdout, /Search in LM Studio/);
  assert.match(lms.stdout, /lms get \S+/);
  assert.doesNotMatch(lms.stdout, /ollama pull/);

  const badProvider = await runCli(['--provider', 'koboldcpp']);
  assert.equal(badProvider.code, 1);
  assert.match(badProvider.stderr, /--provider is ollama or lmstudio, not "koboldcpp"\./);
  const badVram = await runCli(['--vram', 'lots']);
  assert.equal(badVram.code, 1);
  assert.match(badVram.stderr, /--vram takes a number of GB/);
  const noneInstalled = await runCli(['--vram', '12', '--installed']);
  assert.equal(noneInstalled.code, 1, 'nothing to list is an error, not an empty table');
  assert.match(noneInstalled.stderr, /Ollama did not answer at http:\/\/127\.0\.0\.1:9, so there is nothing installed to list\. Start Ollama, or leave out --installed\./);
  assert.match((await runCli(['--help'])).stdout, /^rigmatch-fit \d+\.\d+\.\d+: which local AI models/);
});

test('the command exits as soon as it has printed, even when Ollama never answers', async () => {
  // A non-routable address: the connection neither succeeds nor fails, and
  // Node's fetch kept the process alive for about 10 seconds after the table.
  const result = await runCli(['--vram', '12'], undefined, { ...process.env, OLLAMA_HOST: '10.255.255.1:11434' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Ollama is not running here/);
  assert.ok(result.ms < 6000, `took ${result.ms} ms`);
});

test('the command marks what Ollama lists as installed', async () => {
  // A stand-in for Ollama's /api/tags, shaped like 0.35's reply.
  const { createServer } = await import('node:http');
  const GiB = 1024 ** 3;
  const tags = { models: [
    { name: 'qwen3:8b', size: 5.2 * GiB, details: { parameter_size: '8.2B' } },
    { name: 'hf.co/someone/custom-7b-GGUF:Q4_K_M', size: 4.4 * GiB, details: { parameter_size: '7.2B' } },
    { name: 'nomic-embed-text:latest', size: 0.27 * GiB, details: { parameter_size: '137M' } },
  ] };
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('content-type', 'application/json');
    response.end(request.url === '/api/tags' ? JSON.stringify(tags) : '{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const at = { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` };
  try {
    for (const host of [`127.0.0.1:${port}`, `http://127.0.0.1:${port}/`, `0.0.0.0:${port}`]) {
      const json = await runCli(['--vram', '12', '--json'], undefined, { ...process.env, OLLAMA_HOST: host });
      assert.equal(json.code, 0, json.stderr);
      const parsed = JSON.parse(json.stdout);
      assert.equal(parsed.ollamaReachable, true, `OLLAMA_HOST=${host}`);
      const installed = parsed.models.filter((model) => model.installed).map((model) => model.model).sort();
      assert.deepEqual(installed, ['hf.co/someone/custom-7b-GGUF:Q4_K_M', 'qwen3:8b'], 'embedding models stay out even when installed');
      assert.equal(parsed.models.find((model) => model.model === 'qwen3:8b').sizeGb, 5.2, "Ollama's own size for it");
    }
    const table = await runCli(['--vram', '12', '--all'], undefined, at);
    assert.match(table.stdout, /Ollama is running: 2 of these are installed, marked \*\./);
    assert.match(table.stdout, /^[A-D] +qwen3:8b \* +5\.2 GB .* ollama run qwen3:8b$/m);
    assert.ok(requests.every((url) => url === '/api/tags'), `only /api/tags is asked: ${requests.join(', ')}`);
    assert.equal((await runCli(['--vram', '12', '--provider', 'lmstudio'], undefined, at)).code, 0);
    assert.equal(requests.length, 4, 'LM Studio mode does not ask Ollama');
    const mine = await runCli(['--vram', '12', '--installed'], undefined, at);
    assert.equal(mine.code, 0, mine.stderr);
    assert.match(mine.stdout, /your 2 installed models, best first\./);
    assert.match(mine.stdout, /^[A-F] +hf\.co\/someone\/custom-7b-GGUF:Q4_K_M \* /m);
    const mineJson = await runCli(['--vram', '12', '--installed', '--json'], undefined, at);
    assert.equal(mineJson.code, 0, mineJson.stderr);
    const listed = JSON.parse(mineJson.stdout).models;
    assert.deepEqual(listed.map((model) => model.model).sort(), ['hf.co/someone/custom-7b-GGUF:Q4_K_M', 'qwen3:8b'], '--installed filters the JSON too');
    assert.ok(listed.every((model) => model.installed));
    const clash = await runCli(['--installed', '--provider', 'lmstudio'], undefined, at);
    assert.equal(clash.code, 1);
    assert.match(clash.stderr, /--installed lists what Ollama has, so it works only with --provider ollama\./);
  } finally {
    server.close();
  }
});

test('the built command is plain JS that needs only Node and systeminformation', async () => {
  // Inside node_modules, so the built file finds systeminformation the way an install would.
  mkdirSync(join(root, 'node_modules', '.tmp'), { recursive: true });
  const out = mkdtempSync(join(root, 'node_modules', '.tmp', 'rigmatch-fit-'));
  try {
    const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    await new Promise((resolve, reject) => {
      execFile(process.execPath, [vite, 'build', '--config', 'cli/vite.config.ts', '--outDir', out, '--logLevel', 'error'],
        { cwd: root, timeout: 60_000 }, (error, _stdout, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve()));
    });
    const built = join(out, 'rigmatch-fit.mjs');
    const source = readFileSync(built, 'utf8');
    assert.ok(source.startsWith('#!/usr/bin/env node\n// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.\n'),
      'runs as a bin on macOS and Linux, and says whose it is');
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
    assert.ok(imports.length > 0);
    for (const name of imports) assert.match(name, /^(node:|systeminformation$)/, `nothing else is imported: ${name}`);
    assert.doesNotMatch(source, /lucide|react/i, "the app's menu icons stay out of it");
    const run = await runCli(['--vram', '12'], built);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /^RigMatch fit check\n/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
