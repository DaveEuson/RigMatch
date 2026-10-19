// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const main = read('../electron/main.cjs');

/**
 * Main-process findings from the 2026-10-18 bug scan.
 */

test('the Ollama installer cap is above the size of a real OllamaSetup.exe', () => {
  // OllamaSetup.exe for Ollama 0.35.1, as ollama.com served it. The cap was
  // 300 MB, so "Download and install Ollama" stopped at 19% on every Windows PC.
  const OLLAMA_SETUP_BYTES = 1_580_352_416;
  const expression = main.match(/const OLLAMA_INSTALLER_MAX_BYTES = ([\d\s*]+);/)?.[1];
  assert.ok(expression, 'the cap is a plain product of numbers');
  const cap = Function(`return (${expression});`)();
  assert.ok(cap >= 2 * OLLAMA_SETUP_BYTES, `cap ${cap} leaves room for the installer to grow`);
});

test('an installer the server says is over the cap is refused before it downloads', () => {
  assert.match(main, /const total = parseInt\(response\.headers\.get\('content-length'\) \|\| '0', 10\);\n(\s*\/\/.*\n)*\s*if \(total > OLLAMA_INSTALLER_MAX_BYTES\) \{\n\s*try \{ await response\.body\?\.cancel\(\); \} catch \{ \/\* already closed \*\/ \}\n\s*throw new Error\('Installer download too large'\);/);
});
