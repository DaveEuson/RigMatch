import test from 'node:test';
import assert from 'node:assert/strict';

/** A window with just enough surface for the handlers to install and fire. */
function fakeWindow() {
  const listeners = {};
  return {
    listeners,
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
  };
}

const win = fakeWindow();
globalThis.window = win;

const { installCrashLogging } = await import('../src/lib/crashLog.ts');
const { agentArcadeApi } = await import('../src/api.ts');

const logged = [];
agentArcadeApi.appendLog = async (entry) => { logged.push(entry); };

installCrashLogging();

test('an uncaught error reaches the log with its stack and location', () => {
  logged.length = 0;
  const error = new Error('audio decode exploded');
  win.listeners.error[0]({ error, filename: 'ListeningLab.tsx', lineno: 42, colno: 7 });

  assert.equal(logged.length, 1);
  assert.equal(logged[0].level, 'error');
  assert.match(logged[0].message, /uncaught error: audio decode exploded/);
  assert.equal(logged[0].details.at, 'ListeningLab.tsx:42:7');
  assert.ok(logged[0].details.stack, 'the stack must travel too');
});

test('an unhandled rejection carrying a non-Error still logs something readable', () => {
  // Rejections are frequently strings, DOMExceptions, or undefined.
  logged.length = 0;
  win.listeners.unhandledrejection[0]({ reason: 'NotAllowedError: permission denied' });
  assert.match(logged[0].message, /unhandled rejection: NotAllowedError/);

  logged.length = 0;
  win.listeners.unhandledrejection[0]({ reason: undefined });
  assert.equal(logged.length, 1, 'even undefined must produce an entry');
});

test('a broken bridge does not turn the crash reporter into a second crash', () => {
  agentArcadeApi.appendLog = () => { throw new Error('bridge is gone'); };
  assert.doesNotThrow(() => {
    win.listeners.error[0]({ error: new Error('original crash') });
  });
});

test('installing twice does not double-log', () => {
  const before = win.listeners.error.length;
  installCrashLogging();
  assert.equal(win.listeners.error.length, before);
});
