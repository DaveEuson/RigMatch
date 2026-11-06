// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The app's own fetchJson, lifted out of electron/main.cjs with the helpers it
 * calls, so a gate or a test exercises the real one. main.cjs cannot be
 * required outside Electron, and a copy kept beside a test stops testing the
 * day the app's version changes (the provider gate's copy still used fetch
 * after the app moved to node:http).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { localRequest } = require('../electron/localHttp.cjs');

/** One top-level function's source, from its declaration to its closing brace. */
function lift(source, declaration) {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`main.cjs has no "${declaration}"`);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
}

export function loadAppFetchJson() {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const maxBytes = Number(main.match(/const JSON_RESPONSE_MAX_BYTES = ([\d *]+);/)?.[1].split('*').reduce((product, n) => product * Number(n), 1));
  if (!(maxBytes > 0)) throw new Error('main.cjs has no JSON_RESPONSE_MAX_BYTES');
  const body = [
    lift(main, 'function getUrlOrigin(url) {'),
    lift(main, 'function getUrlLabel(url) {'),
    lift(main, 'function extractResponseDetail(text) {'),
    lift(main, 'async function fetchJson('),
    'return fetchJson;',
  ].join('\n');
  return new Function('localRequest', 'JSON_RESPONSE_MAX_BYTES', body)(localRequest, maxBytes);
}
