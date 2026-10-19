import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const main = read('../electron/main.cjs');
const app = read('../src/App.tsx');
const wizard = read('../src/components/SimpleWizard.tsx');

// The real function, cut out of main.cjs, so this cannot drift from what runs.
const scoreRigFit = new Function(`${main.match(/function scoreRigFit\(model\) \{[\s\S]*?\n\}\n/)[0]}; return scoreRigFit;`)();

test('fit is read from the whole size of a model, not the last token in its name', () => {
  assert.equal(scoreRigFit('qwen3:30b-a3b'), 58, 'the 30B must be held in memory, whatever runs per token');
  assert.equal(scoreRigFit('qwen3:235b-a22b'), 38);
  assert.equal(scoreRigFit('mixtral:8x7b'), 38, '8 experts of 7B is 56B in total');
  assert.equal(scoreRigFit('qwen2.5-14b-instruct-1m'), 74, '-1m is a context size, not 1 million parameters');
});

test('fit still reads the ordinary names the way it did', () => {
  const expected = {
    'llama3.2:3b': 96, 'qwen3:8b': 88, 'gemma3:12b': 74, 'qwen3:32b': 58, 'llama3.1:70b': 38,
    'phi3:mini': 96, 'qwen3:0.6b': 96, 'smollm2:135m': 96, 'something:latest': 82,
  };
  for (const [name, fit] of Object.entries(expected)) assert.equal(scoreRigFit(name), fit, name);
});

test('a request path that does not parse is a 400, not an exception in the main process', () => {
  assert.match(main, /let url;\n\s*try \{\n\s*url = new URL\(req\.url \|\| '\/', `http:\/\/127\.0\.0\.1:\$\{SCORES_SERVER_PORT\}`\);\n\s*\} catch \{\n\s*res\.statusCode = 400;/);
  assert.throws(() => new URL('//[', 'http://127.0.0.1:11435'), 'the path really does throw');
});

test('stopping a show stops the skill tests chained after it', () => {
  // The Code round also waits for its questions to have finished (10-18 scan).
  assert.match(app, /\.then\(\(finished\) => \(finished && !stopRunRef\.current \? runSkillTestsAfterRun\(models, 'app-builder'\) : undefined\)\)/);
  assert.match(app, /\.then\(\(\) => \(stopRunRef\.current \? undefined : runSkillTestsAfterRun\(skillModels\)\)\)/g);
  assert.match(app, /onStopShow=\{\(\) => \{ requestStopRun\(\); requestStopSkills\(\); \}\}/);
});

test('a download queued while another runs is not wiped when that run ends', () => {
  assert.doesNotMatch(app, /setQueuedModelIds\(new Set<string>\(\)\);\n\s*setActivity\(`\$\{completedCount\} model/);
  assert.match(app, /for \(const row of queuedRows\) next\.delete\(row\.displayName\);/);
});

test('cancelling a paused queue clears the pause that would block the next start', () => {
  assert.match(app, /setIsPullPaused\(false\);\n\n\s*if \(queuedModelIds\.size === 0\) \{\n\s*setActivity\('Download queue is already empty\.'\);/);
});

test('the first goal opens Pick on the chip that tests it', () => {
  assert.match(app, /case 'describe-image': return 'read-image';/);
  assert.match(app, /case 'transcribe-file': return 'hear';/);
  assert.match(app, /case 'make-audio': return 'audio';/);
});

test('the download button counts the models that need downloading', () => {
  assert.match(wizard, /const pendingCount = shortlistedRows\.filter\(\(row\) => !row\.installed\)\.length;/);
  assert.match(wizard, /`Download \$\{pendingCount\} model\$\{pendingCount === 1 \? '' : 's'\}\$\{downloadSuffix\}`/);
});

test('a picture or listening round continues with one installed model', async () => {
  const { summarizeDownloadStep } = await import('../src/lib/downloadStatus.ts');
  // One arrived, one failed, nothing still moving.
  const statuses = ['done', 'failed'];
  assert.equal(summarizeDownloadStep(statuses).canContinue, false, 'a comparison needs two');
  assert.equal(summarizeDownloadStep(statuses, 1).canContinue, true, 'one is enough to grade against a check');
  assert.equal(summarizeDownloadStep(statuses, 1).blockedReason, undefined);
});
