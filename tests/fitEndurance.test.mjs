// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeOllama, simulatedModel } from './support/fakeOllama.mjs';

const { checkEnduranceArgs, formatEnduranceIntro, formatEnduranceProgress, formatEnduranceReport, toEnduranceJson } = await import('../cli/endurance.ts');
const { runEnduranceCommand } = await import('../cli/enduranceCommand.ts');
const { fetchJson, installedOllamaModels } = await import('../cli/ollamaHttp.ts');
const { MARQUEE_BORDER } = await import('../cli/fitCheck.ts');

const root = fileURLToPath(new URL('..', import.meta.url));
const card12 = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, unifiedMemory: false, ramGb: 32, platform: 'win32', arch: 'x64', source: 'detected' };
const ascii = /^[\x20-\x7e\n\r]*$/;
const MODEL = 'qwen3:14b';

// ---- The arguments ---------------------------------------------------------------

test('--endurance takes one installed model and keeps away from the flags it cannot go with', () => {
  assert.equal(checkEnduranceArgs({ endurance: false }, []), null);
  assert.equal(checkEnduranceArgs({ endurance: false }, ['qwen3:8b']), null, 'left to the other checks to refuse');
  assert.deepEqual(checkEnduranceArgs({ endurance: true, provider: 'ollama' }, ['qwen3:14b']), { model: 'qwen3:14b' });
  assert.deepEqual(checkEnduranceArgs({ endurance: true }, ['qwen3:14b']), { model: 'qwen3:14b' });
  assert.throws(() => checkEnduranceArgs({ endurance: true }, []), /--endurance takes one installed model, such as: rigmatch-fit --endurance qwen3:8b/);
  assert.throws(() => checkEnduranceArgs({ endurance: true }, ['a', 'b']), /takes one installed model/);
  assert.throws(() => checkEnduranceArgs({ endurance: true, measure: true }, ['a']), /use one or the other/);
  assert.throws(() => checkEnduranceArgs({ endurance: true, vram: '16' }, ['a']), /--vram grades for another card/);
  assert.throws(() => checkEnduranceArgs({ endurance: true, installed: true }, ['a']), /use one or the other/);
  assert.throws(() => checkEnduranceArgs({ endurance: true, all: true }, ['a']), /use one or the other/);
  // LM Studio has no /api/ps, so it is refused in words, not run without the part that matters.
  assert.throws(() => checkEnduranceArgs({ endurance: true, provider: 'lmstudio' }, ['a']), /only with --provider ollama.*LM Studio does not offer/);
  assert.throws(() => checkEnduranceArgs({ endurance: true, provider: 'LM Studio' }, ['a']), /only with --provider ollama/);
});

// ---- The command, in process, with the machine replaced -------------------------------

/** A command runner that answers nvidia-smi and the process list from fixed text. */
const commands = ({ smi = ['1696, 12282, 29'], processes = '"System Idle Process","0","Services","0","8 K"\r\n"explorer.exe","4242","Console","1","90,000 K"\r\n' } = {}) => {
  let sample = 0;
  const run = async (command, args) => {
    if (command === 'nvidia-smi') {
      const output = smi[Math.min(sample, smi.length - 1)];
      sample += 1;
      return output === null ? { output: '', error: 'nvidia-smi was not found' } : { output, error: null };
    }
    if (command === 'tasklist') return { output: processes, error: null };
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  };
  return { run };
};

const capture = ({ isTTY = false, columns } = {}) => ({ text: '', isTTY, columns, write(text) { this.text += text; } });

/** The real command (cli/enduranceCommand.ts) with a 12 GB card, a fake nvidia-smi, the stand-in as Ollama and an emitter for Ctrl+C. */
function startCommand(args, ollama, { hardware = card12, tty = false, columns, run, env = {} } = {}) {
  const out = capture({ isTTY: tty, columns });
  const err = capture({ isTTY: tty, columns });
  const interrupt = new EventEmitter();
  let left = null;
  const finished = runEnduranceCommand(args, {
    baseUrl: ollama.url,
    out,
    err,
    platform: 'win32',
    version: '0.1.0',
    detectHardware: async () => hardware,
    driverVersion: async () => '610.88',
    run: (run ?? commands()).run,
    fetchJson,
    installedModels: installedOllamaModels,
    interrupt,
    leave: (code) => { left = code; },
    unloadSettleMs: 500,
    cardSamples: 2,
    cardGapMs: 0,
    ...env,
  }).then((code) => ({ code, error: null }), (error) => ({ code: undefined, error }))
    .then((done) => ({ ...done, out: out.text, err: err.text, left: () => left }));
  return { interrupt, finished };
}
const runCommand = (args, ollama, options) => startCommand(args, ollama, options).finished;

/** The 14B's real numbers on this card, as the stand-in answers them. */
const fourteen = () => simulatedModel({ write: { 2048: 42.5, 8192: 38, 16384: 13 }, read: { 2048: 1345, 8192: 2021, 16384: 394 }, share: { 2048: 1, 8192: 1, 16384: 0.868 } });

test('--endurance --json: the stages, the verdict and the stamp, and what it loaded is unloaded', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], onGenerate: fourteen() });
  try {
    const run = await runCommand({ model: MODEL, json: true }, ollama);
    assert.equal(run.code, 0, run.error?.message ?? run.err);
    const json = JSON.parse(run.out);
    assert.deepEqual(Object.keys(json), ['tool', 'version', 'mode', 'hardware', 'model', 'status', 'test', 'stages', 'verdict', 'stamp', 'contention']);
    assert.deepEqual([json.tool, json.mode, json.model, json.status, json.version], ['rigmatch-fit', 'endurance', MODEL, 'measured', '0.1.0']);
    assert.deepEqual(json.hardware, { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, unifiedMemory: false, ramGb: 32, platform: 'win32', arch: 'x64' });
    assert.deepEqual(json.test.stages.map((stage) => [stage.id, stage.label, stage.numCtx]), [['quick', 'Quick chat', 2048], ['page', 'Long page', 8192], ['project', 'Whole project', 16384]]);
    assert.deepEqual(json.test.thresholds, { speedKeptMin: 0.55, onCardMin: 0.92 });
    assert.equal(json.test.numPredict, 128);
    assert.deepEqual(Object.keys(json.stages[0]), [
      'id', 'label', 'numCtx', 'status', 'targetTokens', 'promptTokens', 'sizeOk', 'writingTps', 'readingTps', 'writingKept', 'loadSeconds', 'gpuShare',
      'contextReported', 'contextShort', 'passkeyKept', 'feels',
    ]);
    assert.deepEqual(json.stages.map((stage) => stage.writingTps), [42.5, 38, 13]);
    assert.deepEqual(json.stages.map((stage) => stage.readingTps), [1345, 2021, 394]);
    assert.deepEqual(json.stages.map((stage) => stage.writingKept), [1, 0.894, 0.306]);
    assert.deepEqual(json.stages.map((stage) => stage.gpuShare), [1, 1, 0.868]);
    assert.deepEqual(json.stages.map((stage) => stage.contextReported), [2048, 8192, 16384]);
    assert.deepEqual(json.stages.map((stage) => stage.sizeOk), [true, true, true]);
    assert.deepEqual(json.stages.map((stage) => stage.passkeyKept), [true, true, true]);
    assert.deepEqual(json.stages.map((stage) => stage.feels), ['Fast', 'Fast', 'Usable']);
    assert.deepEqual(json.stages.map((stage) => stage.loadSeconds), [6, 2, 2]);
    assert.deepEqual([json.verdict.kind, json.verdict.problemStage, json.verdict.heldTo], ['slows', 'project', 8192]);
    assert.equal(json.verdict.headline, 'Slows down past 8K: part of the model moves to system memory');
    assert.equal(json.stamp.gpu, 'NVIDIA GeForce RTX 4070');
    assert.equal(json.stamp.driverVersion, '610.88');
    assert.equal(json.stamp.ollamaVersion, '0.35.1');
    assert.equal(json.stamp.appVersion, 'rigmatch-fit 0.1.0');
    assert.equal(json.stamp.tokensPerLine, 33);
    // The baseline is named: what the card was doing before the check, read from nvidia-smi.
    assert.deepEqual(json.contention.before, { level: 'clear', vramUsedPercent: 14, utilizationPercent: 29, reasons: [], apps: [] });
    assert.equal(json.contention.after.level, 'clear');
    // Nothing about who ran it, and nothing sent to Ollama but its own model.
    assert.doesNotMatch(run.out, /C:\\|\/home\/|hostname/i);
    assert.deepEqual(ollama.unloads(), [MODEL]);
    assert.deepEqual(ollama.state.loaded, []);
    assert.equal(ollama.calls.some((call) => call.path === '/api/pull'), false);
    assert.match(run.err, /^RigMatch context endurance\n/, 'the progress is on stderr, so stdout is only the JSON');
  } finally {
    await ollama.close();
  }
});

test('in a terminal it is a show; piped it is plain; both are ASCII, and the progress goes where it should', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], onGenerate: fourteen() });
  try {
    const show = await runCommand({ model: MODEL, json: false }, ollama, { tty: true, columns: 120 });
    assert.equal(show.code, 0, show.error?.message ?? show.err);
    assert.match(show.out, /^o-\*-/);
    assert.match(show.out, /R I G M A T C H     endurance/);
    const box = show.out.split('\n').slice(0, 4);
    assert.ok(box.every((line) => line.length === MARQUEE_BORDER.length), 'the marquee is a closed box');
    assert.match(show.out, /Tonight's endurance round: qwen3:14b\. It runs the model at 2K, 8K and 16K of context/);
    assert.match(show.out, /This takes about \d+ minutes?|This takes about a minute/);
    assert.match(show.out, /Ctrl\+C stops and unloads\./);
    assert.match(show.out, /\nEndurance round\n/);
    assert.match(show.out, /Tonight's verdict on qwen3:14b: Slows down past 8K: part of the model moves to system memory\./);
    assert.match(show.out, /qwen3:14b: Slows down past 8K/, 'the progress line ends with how it went');
    assert.match(show.out, /Whole project, 16K context \(3 of 3\)/);
    assert.match(show.out, ascii);

    const plain = await runCommand({ model: MODEL, json: false }, ollama);
    assert.equal(plain.code, 0);
    assert.doesNotMatch(plain.out, /o-\*-o|Tonight|Endurance round/);
    assert.match(plain.out, /^RigMatch context endurance: qwen3:14b\nNVIDIA GeForce RTX 4070, 12 GB graphics memory, 32 GB system memory\n\n/);
    assert.match(plain.out, /^Stage\s+Context\s+Prompt\s+Writing\s+Reading\s+Loads in\s+On the card\s+Passkey\s+Feels$/m);
    assert.match(plain.out, /^Quick chat\s+2K\s+\d+\s+43 tok\/s\s+1,345 tok\/s\s+6\.0 s\s+100%\s+kept\s+Fast$/m);
    assert.match(plain.out, /^Long page\s+8K\s+[\d,]+\s+38 tok\/s\s+2,021 tok\/s\s+2\.0 s\s+100%\s+kept\s+Fast$/m);
    assert.match(plain.out, /^Whole project\s+16K\s+[\d,]+\s+13 tok\/s\s+394 tok\/s\s+2\.0 s\s+87%\s+kept\s+Usable$/m);
    assert.match(plain.out, /Slows down past 8K: part of the model moves to system memory\./);
    assert.match(plain.out, /At 16K it writes at 13 tok\/s, 31% of its 2K speed\./);
    assert.match(plain.out, /Before the check the graphics card had 14% of its memory in use and 29% busy\./);
    assert.match(plain.out, /Those cut-offs were set on three models on one card \(an RTX 4070 12 GB\), so treat the verdict as a guide\./);
    assert.match(plain.out, /A size is flagged when writing falls under 55% of the 2K speed, less than 92% of the model sits on the graphics card, or the passkey is lost\./);
    assert.match(plain.err, /qwen3:14b: checking Ollama\nqwen3:14b: loading, and measuring how many tokens a line costs on this model\nqwen3:14b: Quick chat, 2K context \(1 of 3\)/);
    assert.match(plain.err, /qwen3:14b: unloading/);
    assert.match(plain.err, ascii);
    assert.match(plain.out, ascii);

    // A narrow terminal: no sign, wrapped prose.
    const narrow = formatEnduranceIntro(MODEL, card12, { estimateTps: 35, sizeGb: 9.3 }, { show: true, columns: 30 });
    assert.doesNotMatch(narrow, /o-\*-o/);
    assert.ok(narrow.split('\n').filter((line) => !line.startsWith('Endurance')).every((line) => line.length <= 30 || !line.includes(' ')), 'wrapped to the width');
    assert.equal(formatEnduranceProgress(MODEL, { phase: 'stage', stage: 'page', index: 2, of: 3 }), 'qwen3:14b: Long page, 8K context (2 of 3)');
  } finally {
    await ollama.close();
  }
});

test('a model that holds up is said to, with its numbers', async () => {
  const ollama = await fakeOllama({ installed: ['llama3.2:3b'], onGenerate: simulatedModel({ write: { 2048: 167, 8192: 130.7, 16384: 102.2 } }) });
  try {
    const run = await runCommand({ model: 'llama3.2:3b', json: false }, ollama);
    assert.equal(run.code, 0);
    assert.match(run.out, /Holds up to 16K on your card\./);
    assert.match(run.out, /At 16K it writes at 102 tok\/s, 61% of its 2K speed\. The whole model stays on the graphics card\. The passkey hidden in the prompt came back at every size\./);
    assert.doesNotMatch(run.out, /\bwrong size\b/);
  } finally {
    await ollama.close();
  }
});

test('a prompt Ollama cut is shown as the wrong size and left out, never as the model failing', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], onGenerate: simulatedModel({ contextCap: 8192 }) });
  try {
    const run = await runCommand({ model: MODEL, json: false }, ollama);
    assert.equal(run.code, 0);
    assert.match(run.out, /^Whole project\s+16K\s+4,098 \(wrong size\)/m);
    assert.match(run.out, /Holds up to 8K on your card, 16K not checked\./);
    assert.match(run.out, /Whole project \(16K\) is left out: the prompt came out at 4098 tokens instead of about 14336\. Ollama most likely cut it/);
    assert.match(run.out, /gave the model a context of 8K\. Ollama splits the context between slots when OLLAMA_NUM_PARALLEL is above 1/);
    assert.doesNotMatch(run.out, /Loses the middle/);
    const json = JSON.parse((await runCommand({ model: MODEL, json: true }, ollama)).out);
    assert.deepEqual(json.stages.map((stage) => [stage.sizeOk, stage.contextShort]), [[true, false], [true, false], [false, true]]);
    assert.equal(json.verdict.kind, 'holds');
  } finally {
    await ollama.close();
  }
});

test('a busy graphics card is said before the check and named in the result', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], onGenerate: fourteen() });
  try {
    const busy = commands({ smi: ['4300, 12282, 62'] });
    const run = await runCommand({ model: MODEL, json: false }, ollama, { run: busy });
    assert.equal(run.code, 0);
    assert.match(run.err, /Before starting: the graphics card is 62% busy/);
    assert.match(run.out, /Before the check the graphics card had 35% of its memory in use and 62% busy\./);
    assert.match(run.out, /After the runs, .*Something else was probably using the graphics card during them/);
    const json = JSON.parse((await runCommand({ model: MODEL, json: true }, ollama, { run: busy })).out);
    assert.equal(json.contention.before.level, 'busy');
    assert.equal(json.contention.before.vramUsedPercent, 35);
  } finally {
    await ollama.close();
  }
});

test('another program\'s model is never run beside: the command refuses, and leaves it loaded', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], loaded: ['mistral:7b'], onGenerate: fourteen() });
  try {
    const run = await runCommand({ model: MODEL, json: false }, ollama);
    assert.equal(run.code, undefined);
    assert.match(run.error.message, /Ollama has mistral:7b loaded by another program\. It shares the graphics card and would slow the check, so rigmatch-fit leaves it alone and does not start\./);
    assert.deepEqual(ollama.loads(), []);
    assert.deepEqual(ollama.unloads(), []);
    assert.deepEqual(ollama.state.loaded.map((entry) => entry.name), ['mistral:7b']);
  } finally {
    await ollama.close();
  }
});

test('the model must be installed and local: a missing one gets its pull command, a cloud one is refused', async () => {
  const ollama = await fakeOllama({ installed: ['llama3.2:3b'], remote: ['gpt-oss:120b-cloud'], onGenerate: fourteen() });
  try {
    const missing = await runCommand({ model: MODEL, json: false }, ollama);
    assert.equal(missing.code, 1);
    assert.match(missing.out, /qwen3:14b is not installed\. Get it with: ollama pull qwen3:14b, then check it again\./);
    assert.deepEqual(ollama.loads(), []);
    const json = JSON.parse((await runCommand({ model: MODEL, json: true }, ollama)).out);
    assert.deepEqual([json.status, json.command], ['missing', 'ollama pull qwen3:14b']);

    const cloud = await runCommand({ model: 'gpt-oss:120b-cloud', json: false }, ollama);
    assert.match(cloud.error.message, /runs on Ollama's servers, not on this computer.*rigmatch-fit --endurance runs local models only\./);
    const bad = await runCommand({ model: 'bad name; rm', json: false }, ollama);
    assert.match(bad.error.message, /is not a model name Ollama uses/);
    assert.deepEqual(ollama.loads(), []);
  } finally {
    await ollama.close();
  }
});

test('Ctrl+C mid-run stops it, unloads the model and exits 130; a second Ctrl+C leaves at once', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], stall: true });
  try {
    const { interrupt, finished } = startCommand({ model: MODEL, json: false }, ollama);
    assert.equal(await ollama.waitForStall(), true, 'the check is under way, held by the stand-in');
    interrupt.emit('SIGINT');
    const run = await finished;
    assert.equal(run.error, null);
    assert.equal(run.code, 130);
    assert.match(run.err, /Stopping: unloading the model\.\.\./);
    assert.match(run.out, /Stopped\. Nothing was saved for this check\./);
    assert.deepEqual(ollama.unloads(), [MODEL], 'the unload request went out');
    assert.deepEqual(ollama.state.loaded, [], 'and the card is empty');
    assert.equal(run.left(), null, 'one press does not leave');
    assert.equal(interrupt.listenerCount('SIGINT'), 0, 'and the handler is gone');
  } finally {
    await ollama.close();
  }

  const again = await fakeOllama({ installed: [MODEL], stall: true });
  try {
    const { interrupt, finished } = startCommand({ model: MODEL, json: false }, again);
    await again.waitForStall();
    interrupt.emit('SIGINT');
    interrupt.emit('SIGINT');
    assert.equal((await finished).left(), 130, 'the second press leaves');
  } finally {
    await again.close();
  }
});

test('the report says what went wrong in words, and the JSON carries no path from Ollama\'s own error', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], generateError: 'unable to load model: C:\\Users\\Alice Smith\\.ollama\\models\\blobs\\sha256-abc' });
  try {
    const text = await runCommand({ model: MODEL, json: false }, ollama);
    assert.equal(text.code, 1);
    assert.match(text.out, /The check did not finish: .*<path>/);
    assert.doesNotMatch(text.out, /Alice/);
    const json = JSON.parse((await runCommand({ model: MODEL, json: true }, ollama)).out);
    assert.deepEqual([json.status, json.message], ['failed', 'The check did not finish.']);
    assert.doesNotMatch(JSON.stringify(json), /Alice/);
    assert.deepEqual(ollama.state.loaded, []);
  } finally {
    await ollama.close();
  }
});

test('the formatters take a report with no card reading', () => {
  const report = { model: MODEL, estimateTps: null, status: 'busy', message: 'Ollama has mistral:7b loaded by another program.' };
  assert.equal(formatEnduranceReport(report, { header: card12 }), 'RigMatch context endurance: qwen3:14b\nNVIDIA GeForce RTX 4070, 12 GB graphics memory, 32 GB system memory\n\nOllama has mistral:7b loaded by another program.');
  assert.equal(toEnduranceJson(report, card12, '0.1.0').message, 'Ollama has mistral:7b loaded by another program.');
});

// ---- The real command, as a child process -----------------------------------------

const runCli = (args, env) => new Promise((resolve) => {
  execFile(process.execPath, [join(root, 'cli', 'rigmatch-fit.ts'), ...args], { cwd: root, env: { ...process.env, ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
  });
});

test('bad flags exit 1 with a plain sentence, before anything is asked of Ollama', async () => {
  for (const [args, message] of [
    [['--endurance'], /--endurance takes one installed model/],
    [['--endurance', 'a', 'b'], /--endurance takes one installed model/],
    [['--endurance', '--measure', 'qwen3:8b'], /use one or the other/],
    [['--endurance', 'qwen3:8b', '--vram', '12'], /--vram grades for another card/],
    [['--endurance', 'qwen3:8b', '--provider', 'lmstudio'], /LM Studio does not offer/],
    [['--endurance', 'qwen3:8b', '--all'], /use one or the other/],
  ]) {
    const result = await runCli(args, { OLLAMA_HOST: '127.0.0.1:9' });
    assert.equal(result.code, 1, args.join(' '));
    assert.match(result.stderr, message, args.join(' '));
    assert.equal(result.stdout, '');
  }
  const remote = await runCli(['--endurance', 'qwen3:8b'], { OLLAMA_HOST: 'http://192.168.1.50:11434' });
  assert.equal(remote.code, 1);
  assert.match(remote.stderr, /--endurance runs on this computer's Ollama only/);
  const down = await runCli(['--endurance', 'qwen3:8b'], { OLLAMA_HOST: '127.0.0.1:9' });
  assert.equal(down.code, 1);
  assert.match(down.stderr, /Ollama did not answer at http:\/\/127\.0\.0\.1:9\. --endurance runs the model on it/);
  const help = await runCli(['--help'], {});
  assert.match(help.stdout, /--endurance <model>\s+Find where one installed model slows down or loses its place as/);
  assert.match(help.stdout, /needs Ollama: LM Studio does\s+not say how much of a model is on the card/);
});

test('the command refuses while another program has a model loaded, and never unloads it', async () => {
  const ollama = await fakeOllama({ installed: [MODEL], loaded: ['mistral:7b'] });
  try {
    for (const args of [['--endurance', MODEL], ['--endurance', MODEL, '--json']]) {
      const result = await runCli(args, { OLLAMA_HOST: ollama.host });
      assert.equal(result.code, 1, args.join(' '));
      assert.match(result.stderr, /Ollama has mistral:7b loaded by another program\. It shares the graphics card and would slow the check/);
      assert.equal(result.stdout, '');
    }
    assert.equal(ollama.calls.filter((call) => call.path === '/api/generate').length, 0, 'nothing run, nothing unloaded');
    assert.deepEqual(ollama.state.loaded.map((entry) => entry.name), ['mistral:7b']);
  } finally {
    await ollama.close();
  }
});
