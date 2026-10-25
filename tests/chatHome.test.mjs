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

test('every top-bar button whose word hides on a narrow window still has a name', () => {
  // Settings had none below 1600px: the one unnamed control on any Advanced
  // screen in the 0.10.0 Windows check. Read from the CSS that hides the words,
  // so a button added to those rules later is held to the same.
  const bar = read('../src/components/TopBar.tsx');
  const css = read('../src/styles/shell.css');
  const hidden = new Set([...css.matchAll(/\.(top-bar-[a-z]+) span[,\s{]/g)].map((m) => m[1]));
  assert.ok(hidden.has('top-bar-settings') && hidden.size >= 3, `the narrow-window rules moved: found ${[...hidden].join(', ')}`);
  for (const name of hidden) {
    const tag = bar.match(new RegExp(`<button[^>]*className="${name}"[^>]*>`))?.[0];
    assert.ok(tag, `${name} is not a button in TopBar.tsx`);
    assert.match(tag, /aria-label="[^"]+"/, `${name} loses its only name when its word hides`);
  }
  assert.match(bar, /className="top-bar-settings"[^>]*title="Settings" aria-label="Settings"/);
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
