#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Check every generation model's declared byte count against the server.
 *
 * comfyModels.cjs deletes a download whose received bytes fall short of the
 * declared count, so a number rounded UP destroys a good file whenever the
 * server omits content-length. Four of the original six were wrong. Network
 * calls, so this is a script rather than a test.
 */
import { GENERATION_MODELS } from '../src/lib/generationCatalog.ts';

let bad = 0;
for (const model of GENERATION_MODELS) {
  const name = model.id.padEnd(24);
  // A gated repository answers 401 without a token, and its error page has a
  // content-length of its own — which used to be compared with the model's
  // size and reported as a wrong declaration.
  if (model.gated) {
    console.log(`  -  ${name} gated on Hugging Face; checking it needs a token`);
    continue;
  }
  const response = await fetch(model.url, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) {
    console.log(`  ** ${name} the URL answered HTTP ${response.status}`);
    bad += 1;
    continue;
  }
  const real = Number(response.headers.get('content-length')) || null;
  if (real === null) {
    console.log(`  ?  ${name} server sent no content-length`);
  } else if (real === model.bytes) {
    console.log(`  ok ${name} ${model.bytes}`);
  } else {
    const risk = model.bytes > real ? ' — DECLARED TOO HIGH, a good download would be deleted' : '';
    console.log(`  ** ${name} declared ${model.bytes}, real ${real}${risk}`);
    bad += 1;
  }
}
console.log(bad === 0 ? '\nAll declared sizes match the server.' : `\n${bad} size(s) wrong.`);
process.exit(bad === 0 ? 0 : 1);
