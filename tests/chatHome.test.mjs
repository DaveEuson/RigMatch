import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

test('the top bar names the chat button, and Simple keeps the word at every width', () => {
  const bar = read('../src/components/TopBar.tsx');
  assert.match(bar, /className="top-bar-chat"[\s\S]*?<span>Chat<\/span>/);
  const css = read('../src/styles/shell.css');
  assert.match(css, /\.top-bar\.simple \.top-bar-donate span,\n\.top-bar\.simple \.top-bar-chat span \{ display: inline; \}/);
  // Hidden text still has an accessible name.
  assert.match(bar, /className="top-bar-chat"[^>]*aria-label="Open RigMatch Chat"/);
});

test('a returning chat is offered on the first Simple screen', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /continueChat=\{chatMessages\.some\(\(message\) => message\.role === 'user'\)/);
  assert.match(app, /onContinueChat=\{\(\) => openChatWith\(selectedModel\)\}/);
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /step === 'setup' && props\.continueChat && props\.onContinueChat/);
  assert.match(wizard, /Pick up where you left off: your chat with/);
});

test('the report toast is kept off an open chat, and the chat says no show has run', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /reportReady && !reportOpen && !chatOpen && shownShowResult/);
  assert.match(app, /noShowYet=\{scoredModelCount === 0\}/);
  const dock = read('../src/components/ChatDock.tsx');
  assert.match(dock, /You haven't run the show yet, so this is a good all-round model rather than the best one for your PC\./);
});
