// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { catalogRows, formatTable, rankModels, inDefaultList, toJson } = await import('../cli/fitCheck.ts');

/**
 * The command-line fit check: which models it lists, how it ranks and marks
 * them, and the two shapes it prints. The last tests run the real command,
 * from source and as built, with --vram so no GPU or Ollama is needed.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const card = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, unifiedMemory: false, ramGb: 32, platform: 'win32', arch: 'x64', source: 'detected' };
// Nothing listens on the discard port, so the CLI sees no Ollama and answers fast.
const noOllama = { ...process.env, OLLAMA_HOST: '127.0.0.1:9' };

const runCli = (args, file = join(root, 'cli', 'rigmatch-fit.ts'), env = noOllama) => new Promise((resolve) => {
  execFile(process.execPath, [file, ...args], { cwd: root, env, timeout: 30_000 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
  });
});

test('the catalog is every downloadable chat size in the snapshot, once', () => {
  const rows = catalogRows();
  const names = rows.map((row) => row.name);
  assert.ok(rows.length > 300, `${rows.length} rows`);
  assert.equal(new Set(names).size, names.length, 'no duplicates');
  const qwen = rows.find((row) => row.name === 'qwen3:8b');
  assert.equal(qwen.sizeGb, 5.2);
  assert.equal(qwen.params, '8B');
  assert.ok(!names.includes('qwen3:latest'), 'latest is qwen3:8b under another name');
  assert.ok(names.some((name) => name.endsWith(':latest')), 'but kept where it is the only size');
  assert.ok(!names.some((name) => /embed|minilm|bge-/.test(name)), 'no embedding models');
  assert.ok(!names.some((name) => /cloud|mlx|q\d_|fp16|bf16/i.test(name)), 'no cloud tags, MLX builds or quantizations');
  assert.ok(!names.some((name) => name.startsWith('x/flux2') || name.startsWith('x/z-image')), 'no image makers');
  assert.ok(rows.every((row) => row.sizeGb > 0));
});

test('ranking is best first, and marks what Ollama has installed', () => {
  const installed = [
    { name: 'qwen3:8b', sizeGb: 5.2, params: '8.2B' },
    { name: 'hf.co/someone/custom-7b-GGUF:Q4_K_M', sizeGb: 4.4, params: '7.2B' },
    { name: 'nomic-embed-text:latest', sizeGb: 0.3, params: '137M' },
  ];
  const ranked = rankModels(catalogRows(), card, { installed });
  for (let i = 1; i < ranked.length; i += 1) {
    const order = 'ABCDF?';
    assert.ok(order.indexOf(ranked[i - 1].grade.letter) <= order.indexOf(ranked[i].grade.letter), 'best letter first');
  }
  assert.equal(ranked.find((model) => model.row.name === 'qwen3:8b').installed, true);
  const custom = ranked.find((model) => model.row.name.startsWith('hf.co/'));
  assert.ok(custom, 'an installed model the catalog does not know is graded too');
  assert.equal(custom.installed, true);
  assert.equal(custom.command, 'ollama pull hf.co/someone/custom-7b-GGUF:Q4_K_M');
  assert.ok(!ranked.some((model) => model.row.name === 'nomic-embed-text:latest'), 'still no embedding models');
  assert.equal(ranked.filter((model) => model.installed).length, 2);
  assert.equal(rankModels(catalogRows(), card, { provider: 'lm-studio' }).find((m) => m.row.name === 'qwen3:8b').command, 'lms get qwen3-8b');
});

test('the table shows the best 20 that run here, and says what it left out', () => {
  const ranked = rankModels(catalogRows(), card, { installed: [{ name: 'qwen3.5:9b', sizeGb: 6.6 }] });
  const table = formatTable(ranked, card, { ollamaReachable: true });
  const lines = table.split('\n');
  assert.equal(lines[0], 'RigMatch fit check');
  assert.equal(lines[1], 'NVIDIA GeForce RTX 4070 · 12 GB graphics memory · 32 GB system memory');
  assert.equal(lines[2], 'Ollama is running: 1 of these is installed, marked *.');
  assert.match(table, /^A +qwen3\.5:9b \* /m);
  const header = lines.findIndex((line) => line.startsWith('Grade'));
  assert.match(lines[header], /^Grade +Model +Size +Speed +Fit +Get it$/);
  const body = lines.slice(header + 1, header + 21);
  assert.equal(body.length, 20);
  for (const line of body) assert.match(line, /^[A-D] +\S+( \*)? +[\d.]+ GB +~\d+ tok\/s +\S.* +ollama pull \S+$/);
  assert.equal(lines[header + 21], '');
  const running = ranked.filter(inDefaultList).length;
  assert.match(table, new RegExp(`The best 20 of ${running} models that run here\\.`));
  assert.ok(!/guard|shieldgemma/.test(body.join('\n')), 'safety classifiers wait for --all');
  assert.ok(/^[\x20-\x7e\n·]*$/.test(table.replace(/·/g, '')), 'plain ASCII apart from the separator dot');

  const all = formatTable(ranked, card, { all: true });
  assert.match(all, /^F +\S+/m, '--all includes what will not fit');
  assert.match(all, /Ollama is not running here, so installed models are not marked\./);
  assert.match(formatTable(ranked, { ...card, source: 'flag', driverProblem: 'driver-missing' }), /--vram[\s\S]*did not answer/);
});

test('installed models outside the list are counted honestly, and --installed lists them', () => {
  // Dave's PC said "5 of these are installed, marked *" over a list with no
  // star in it: what you have is rarely among the best 20 for the card.
  const have = (...names) => rankModels(catalogRows(), card, { installed: names.map((name) => ({ name, sizeGb: 1 })) });
  const outside = have('qwen3:0.6b', 'qwen3:30b');
  assert.equal(formatTable(outside, card, { ollamaReachable: true }).split('\n')[2],
    'Ollama is running with 2 models installed, none of them in this list. --installed lists them.');
  const mixed = have('qwen3.5:9b', 'qwen3:0.6b', 'qwen3:30b');
  assert.equal(formatTable(mixed, card, { ollamaReachable: true }).split('\n')[2],
    'Ollama is running with 3 models installed: 1 in this list, marked *. --installed lists all 3.');

  const mine = formatTable(mixed, card, { ollamaReachable: true, installedOnly: true });
  const lines = mine.split('\n');
  assert.equal(lines[2], 'Ollama is running: your 3 installed models, best first.');
  const header = lines.findIndex((line) => line.startsWith('Grade'));
  assert.deepEqual(lines.slice(header + 1, header + 4).map((line) => line.split(/ +/).slice(0, 2).join(' ')),
    ['A qwen3.5:9b', 'C qwen3:0.6b', 'F qwen3:30b'], 'every installed model, a will-not-fit one included, best first');
  assert.equal(lines[header + 4], '');
  assert.match(mine, /^3 installed models\. Fit grade A is the best pick/m);
  const none = formatTable(have(), card, { installedOnly: true });
  assert.match(none, /Ollama is not running here, so there is no telling what is installed\.\n\nNo installed models to list\.\n/);
  assert.doesNotMatch(none, /^Grade/m, 'no header over an empty table');
});

test('--json carries every model with the fields a script needs', () => {
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
  assert.equal(toJson(ranked, card, { provider: 'lm-studio' }).ollamaReachable, null);
});

test('the command runs from source: --json, --provider and its errors', async () => {
  const json = await runCli(['--vram', '12', '--json']);
  assert.equal(json.code, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.hardware.vramGb, 12);
  assert.equal(parsed.hardware.source, 'flag');
  assert.equal(parsed.ollamaReachable, false);
  assert.equal(parsed.models[0].grade, 'A');
  assert.equal(parsed.version, JSON.parse(readFileSync(join(root, 'cli', 'package.json'), 'utf8')).version);

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
  assert.match((await runCli(['--help'])).stdout, /^rigmatch-fit \d+\.\d+\.\d+: which local AI models/);
});

test('the command marks what Ollama lists as installed', async () => {
  // A stand-in for Ollama's /api/tags, shaped like 0.35's reply. The real one
  // on the PC this was written on had no models, so this is the only path
  // that exercises the marks end to end.
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
  try {
    for (const host of [`127.0.0.1:${port}`, `http://127.0.0.1:${port}/`, `0.0.0.0:${port}`]) {
      const env = { ...process.env, OLLAMA_HOST: host };
      const json = await runCli(['--vram', '12', '--json'], undefined, env);
      assert.equal(json.code, 0, json.stderr);
      const parsed = JSON.parse(json.stdout);
      assert.equal(parsed.ollamaReachable, true, `OLLAMA_HOST=${host}`);
      const installed = parsed.models.filter((model) => model.installed).map((model) => model.model).sort();
      assert.deepEqual(installed, ['hf.co/someone/custom-7b-GGUF:Q4_K_M', 'qwen3:8b'], 'embedding models stay out even when installed');
      assert.equal(parsed.models.find((model) => model.model.startsWith('hf.co/')).sizeGb, 4.4);
    }
    const table = await runCli(['--vram', '12', '--all'], undefined, { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` });
    assert.match(table.stdout, /Ollama is running: 2 of these are installed, marked \*\./);
    assert.match(table.stdout, /^[A-D] +qwen3:8b \* +5\.2 GB/m);
    assert.ok(requests.every((url) => url === '/api/tags'), `only /api/tags is asked: ${requests.join(', ')}`);
    assert.equal((await runCli(['--vram', '12', '--provider', 'lmstudio'], undefined, { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` })).code, 0);
    assert.equal(requests.length, 4, 'LM Studio mode does not ask Ollama');
    const mine = await runCli(['--vram', '12', '--installed'], undefined, { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` });
    assert.equal(mine.code, 0, mine.stderr);
    assert.match(mine.stdout, /your 2 installed models, best first\./);
    assert.match(mine.stdout, /^[A-F] +hf\.co\/someone\/custom-7b-GGUF:Q4_K_M \* /m);
    const clash = await runCli(['--installed', '--provider', 'lmstudio'], undefined, { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` });
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
    assert.ok(source.startsWith('#!/usr/bin/env node\n'), 'runs as a bin on macOS and Linux');
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
