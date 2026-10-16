// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const main = read('../electron/main.cjs');
const preload = read('../electron/preload.cjs');
const app = read('../src/App.tsx');
const wizard = read('../src/components/SimpleWizard.tsx');
const prep = read('../src/components/OllamaPrep.tsx');
/** Whether a source carries a line; a failing match must not print the whole file. */
const has = (source, pattern) => pattern.test(source);

/**
 * The Ollama installer download could not be cancelled (0.9.7 bug scan). The
 * main process had an AbortController for it all along, armed only by a disk
 * error; nothing let the person pull it.
 */

test('the main process stops the installer download when asked, and says the offer is back', () => {
  assert.equal(has(main, /ipcMain\.handle\('ollama:cancelInstall', \(event\) => \{\n\s*assertTrustedIpcSender\(event\);\n\s*ollamaInstallController\?\.abort\(\);/), true,
    'cancel is a trusted IPC call that pulls the controller');
  // A stop is not an error: the renderer goes back to "Install Ollama for me"
  // rather than sitting on a bar that never moves again.
  assert.equal(has(main, /if \(cause\.name === 'AbortError'\) send\(\{ phase: 'idle' \}\);\n\s*else send\(\{ phase: 'error', error: cause\.message \|\| 'Download failed' \}\);/), true);
  assert.equal(has(preload, /cancelOllamaInstall: \(\) => ipcRenderer\.invoke\('ollama:cancelInstall'\),/), true);
});

test('both install screens offer Stop while the installer downloads', () => {
  assert.equal(has(app, /const cancelOllamaInstall = useCallback\(/), true);
  assert.equal((app.match(/onCancelOllamaInstall=\{cancelOllamaInstall\}/g) ?? []).length, 2, 'Simple Mode and Connections');
  // Simple Mode's setup screen.
  assert.equal(has(wizard, /Downloading Ollama… \{install\.percent\}%<\/span>\n\s*<button type="button" className="btn btn-line" onClick=\{onCancelOllamaInstall\}>Stop<\/button>/), true);
  // Advanced Mode's install hero.
  assert.equal(has(prep, /Downloading Ollama… \{ip\.percent\}%<\/span>\n\s*<button type="button" className="mini-button outline" onClick=\{onCancelOllamaInstall\}>Stop<\/button>/), true);
});
