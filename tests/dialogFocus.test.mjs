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
  assert.ok(source.includes('openDialogs'), 'a stack of open dialogs should exist');
  assert.match(
    source,
    /openDialogs\[openDialogs\.length - 1\] !== panel\)\s*return/,
    'the handler must bail out when its panel is not on top of the stack',
  );

  // The nesting this guards is real — keep it that way, or this test is theatre.
  const dialogs = fs.readFileSync('src/components/dialogs.tsx', 'utf8');
  assert.ok(
    dialogs.includes('<ShareScorecard'),
    'ChoiceCruiseModal should still nest ShareScorecard (the stacking case)',
  );
});
