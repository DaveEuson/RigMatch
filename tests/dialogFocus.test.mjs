import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * `aria-modal="true"` is a promise to assistive tech that the rest of the page
 * is inert. Honouring it takes focus-in, a Tab trap, and restore on close, which
 * is what lib/useDialog.ts does — but nothing stopped a new dialog being added
 * with the attribute and none of the behaviour. That is how the Image Lab result
 * dialog came to be the only one left untrapped, sitting two lines below one
 * that was.
 *
 * Per file rather than repo-wide: a file with three modals and one useDialog
 * would still balance in a global count.
 */

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

test('every aria-modal dialog is backed by a useDialog call, file by file', () => {
  const offenders = [];

  for (const file of sourceFiles('src')) {
    // The hook's own doc comment quotes the attribute it exists to implement.
    if (file.endsWith(`lib${path.sep}useDialog.ts`)) continue;

    const source = fs.readFileSync(file, 'utf8');
    const modals = count(source, 'aria-modal="true"');
    if (modals === 0) continue;

    const hooks = count(source, 'useDialog<') + count(source, 'useDialog(');
    if (hooks < modals) {
      offenders.push(`${file}: ${modals} aria-modal dialog(s) but ${hooks} useDialog call(s)`);
    }
  }

  assert.deepEqual(offenders, [], 'aria-modal without a focus trap');
});

test('useDialog does not re-run its trap on the caller\'s render', () => {
  // Every call site passes an inline arrow, so a dependency on `onClose` re-ran
  // the effect on each parent render and moved focus back to the first control.
  // The app re-renders every 1.6s during a run and per token while a build
  // streams, so a keyboard user could not reach anything. The callback is read
  // through a ref instead; the trap's own effect must stay dependency-free.
  const source = fs.readFileSync('src/lib/useDialog.ts', 'utf8');
  assert.ok(source.includes('onCloseRef'), 'onClose should be held in a ref');
  assert.doesNotMatch(
    source,
    /\}, \[\s*onClose\s*\]\)/,
    'the focus-trap effect must not depend on the onClose identity',
  );
});

test('only the topmost dialog handles the keyboard', () => {
  // ChoiceCruiseModal renders ShareScorecard as a sibling inside its own
  // backdrop, so two traps are live at once. Listeners on the same node all run
  // regardless of stopPropagation, so Escape closed both dialogs and the two Tab
  // handlers fought over focus, pinning the top dialog to its first control.
  const source = fs.readFileSync('src/lib/useDialog.ts', 'utf8');
  assert.ok(source.includes('openDialogs'), 'a register of open dialogs should exist');
  assert.match(source, /if \(!ownsKeyboard\(\)\) return/, 'the handler must defer to the top dialog');
  // By document position, not by the order effects ran: React runs a child's
  // effects before its parent's, so a dialog rendering another in the same
  // commit would register inside-out and the one underneath would take the keys.
  assert.match(
    source,
    /compareDocumentPosition/,
    'topmost must be decided by document position, not registration order',
  );

  // The nesting this guards is real — keep it that way, or this test is theatre.
  const dialogs = fs.readFileSync('src/components/dialogs.tsx', 'utf8');
  assert.ok(
    dialogs.includes('<ShareScorecard'),
    'ChoiceCruiseModal should still nest ShareScorecard (the stacking case)',
  );
});

test('the trap installs even when the panel mounts later than the hook', () => {
  // UtilityPanel calls useDialog at the top of the component but attaches the
  // ref only while `scoreExplainerOpen` is true. An effect that read an object
  // ref once would find null, bail, and never install anything — the dialog
  // would silently have no trap, no Escape and no focus move. Keying the effect
  // on the panel node makes the hook work wherever it is called.
  const source = fs.readFileSync('src/lib/useDialog.ts', 'utf8');
  assert.match(source, /useState<T \| null>\(null\)/, 'the panel element should be state');
  assert.match(source, /\}, \[panel\]\)/, 'the trap effect must key on the panel node');
  assert.doesNotMatch(source, /const panel = ref\.current/, 'must not read an object ref once');

  // And the call site that motivates it still looks like this.
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(
    app,
    /\{scoreExplainerOpen && \(/,
    'the score explainer should still attach its ref conditionally',
  );
});
