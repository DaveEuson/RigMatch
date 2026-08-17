#!/usr/bin/env node
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
  const response = await fetch(model.url, { method: 'HEAD', redirect: 'follow' });
  const real = Number(response.headers.get('content-length')) || null;
  if (real === null) {
    console.log(`  ?  ${model.id.padEnd(14)} server sent no content-length`);
  } else if (real === model.bytes) {
    console.log(`  ok ${model.id.padEnd(14)} ${model.bytes}`);
  } else {
    const risk = model.bytes > real ? ' — DECLARED TOO HIGH, a good download would be deleted' : '';
    console.log(`  ** ${model.id.padEnd(14)} declared ${model.bytes}, real ${real}${risk}`);
    bad += 1;
  }
}
console.log(bad === 0 ? '\nAll declared sizes match the server.' : `\n${bad} size(s) wrong.`);
process.exit(bad === 0 ? 0 : 1);
