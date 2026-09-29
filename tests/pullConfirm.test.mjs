// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * A download is finished when Ollama says so. A pull stream that stopped
 * halfway without Ollama's "success" line was reported as complete at 100%:
 * the model showed "Ready to go · On your PC" and the show started without it.
 * Found with a stand-in Ollama that ends the stream at 50% (the pull-faults
 * scenario); these pin the order that fixed it.
 */

const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
const pull = main.slice(main.indexOf("fetch(`${baseUrl}/api/pull`"));

test('only a confirmed pull is reported complete', () => {
  const guard = pull.indexOf('if (!confirmed && !(await ollamaHasModel(baseUrl, model)))');
  const complete = pull.indexOf("phase: 'complete',\n      status: 'Download complete',");
  assert.ok(guard > 0, 'the pull no longer checks it was confirmed before reporting complete');
  assert.ok(complete > guard, 'the pull reports complete before checking it was confirmed');
  // Confirmation is the parser's 'complete' phase: Ollama's "success" line.
  assert.match(pull.slice(0, guard), /if \(update\.phase === 'complete'\) confirmed = true;/);
  assert.match(pull.slice(0, guard), /if \(finalUpdate\.phase === 'complete'\) confirmed = true;/);
});

test('an unconfirmed pull fails with where it stopped and how to go on', () => {
  const guarded = pull.slice(pull.indexOf('if (!confirmed'), pull.indexOf("phase: 'complete',\n      status: 'Download complete',"));
  assert.match(guarded, /throw new Error\(`The download of \$\{model\} stopped\$\{at\} before Ollama confirmed it\. Start it again to pick up where it left off\.`\)/);
});

test('an installed model is recognised under its bare name', () => {
  // Ollama lists "falcon2" as "falcon2:latest".
  const helper = main.slice(main.indexOf('async function ollamaHasModel'), main.indexOf('async function fetchJson'));
  assert.match(helper, /model\.includes\(':'\) \? model : `\$\{model\}:latest`/);
});
