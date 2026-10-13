import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

test('Stop is honoured while a model loads, and an LM Studio stop is not reported as a timeout', () => {
  assert.match(main, /async function warmBenchmarkModel\(baseUrl, model, signal\)/);
  assert.match(main, /await warmBenchmarkModel\(baseUrl, model, signal\);/);
  assert.match(main, /if \(externalSignal\?\.aborted\) \{\n\s*const stopped = new Error\('Request stopped'\);/);
  assert.match(main, /await warmLmStudioBenchmarkModel\(baseUrl, model, signal\);\n\s*\} catch \(error\) \{\n\s*if \(signal\?\.aborted\) throw new Error\('Benchmark stopped by user'\);/);
});

test('an LM Studio listing that failed is unknown, and a copy you had loaded is left alone', () => {
  assert.match(main, /return listing \? loadedInstanceIds\(listing, model\) : null;/);
  assert.match(main, /if \(keep === null\) return;\n\s*const keepIds = new Set\(keep\);\n\s*const loaded = await lmStudioLoadedInstances\(baseUrl, model\);\n\s*if \(!loaded\) return;/);
});

test('an installer download over the cap releases its connection', () => {
  assert.match(main, /try \{ await reader\.cancel\(\); \} catch \{ \/\* already closed \*\/ \}\n\s*throw new Error\('Installer download too large'\);/);
});
