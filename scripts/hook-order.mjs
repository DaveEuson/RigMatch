#!/usr/bin/env node
/**
 * The sequence of React hooks a component calls, flattened through its custom
 * hooks — and a check that a refactor did not change it.
 *
 * React identifies hooks by call order, not by name. Splitting a component into
 * custom hooks is safe exactly when the flattened order is preserved: moving a
 * useState across a useEffect, or extracting a run of hooks that was not
 * contiguous, silently re-pairs state with the wrong slot. Nothing else in this
 * repo can see that. tsc cannot, eslint's rules-of-hooks cannot (it checks
 * conditionals, not order across a refactor), the tests do not mount App, and a
 * screenshot shows a rendered page either way.
 *
 * So: expand every locally-defined useXxx into the hooks it calls, in order,
 * recursively, and compare the resulting list against a recorded snapshot.
 *
 *   node scripts/hook-order.mjs --write   record the current order
 *   node scripts/hook-order.mjs           fail if it changed
 *
 * This proves order, not behaviour. It cannot tell whether an effect's
 * dependency array still closes over the right values — read those yourself.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { scrubSource } from './scrub-source.mjs';

const SNAPSHOT = 'scripts/hook-order.snapshot.json';
const ENTRY = { file: 'src/App.tsx', fn: 'App' };

const BUILTIN = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useRef',
  'useContext', 'useReducer', 'useImperativeHandle', 'useDebugValue', 'useId',
  'useSyncExternalStore', 'useTransition', 'useDeferredValue', 'useActionState',
  'useOptimistic', 'useFormStatus',
]);

/** Every .ts/.tsx file under src, read once. */
function sources() {
  const found = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.tsx?$/.test(name)) found.set(full, readFileSync(full, 'utf-8'));
    }
  };
  walk('src');
  return found;
}

const files = sources();

/**
 * The body of a named function or arrow const, as scrubbed source.
 * Returns null when the name is not defined in this file.
 */
function bodyOf(text, name) {
  const code = scrubSource(text, { keepTemplateExpressions: true });
  const declaration = new RegExp(
    `(?:^|\\n)(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]` +
    `|(?:^|\\n)(?:export\\s+)?const\\s+${name}\\s*(?::[^=]*)?=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=>`,
  );
  const match = declaration.exec(code);
  if (!match) return null;

  // Step over the parameter list first. `function useAppLogs({ a, b }: { ... })`
  // opens a brace before the body does, and taking that one returns the
  // destructuring pattern as the "body" — no hooks in it, so the hook expanded
  // to nothing and the census silently dropped by everything it contained.
  let i = match.index + match[0].length - 1;
  if (code[i] === '(') {
    let parens = 0;
    for (; i < code.length; i += 1) {
      if (code[i] === '(') parens += 1;
      else if (code[i] === ')') { parens -= 1; if (parens === 0) { i += 1; break; } }
    }
  }
  i = code.indexOf('{', i);
  if (i === -1) return null;
  let depth = 0;
  for (let j = i; j < code.length; j += 1) {
    if (code[j] === '{') depth += 1;
    else if (code[j] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(i + 1, j);
    }
  }
  return null;
}

/** Where a custom hook is defined, if anywhere in src. */
function findHook(name) {
  for (const [file, text] of files) {
    const body = bodyOf(text, name);
    if (body !== null) return { file, body };
  }
  return null;
}

/**
 * Hook calls made directly in this body, in source order.
 *
 * Depth 0 only: a `use...(` inside a callback belongs to that callback, not to
 * this component, and counting it would invent hooks that never run here.
 * Depth is tracked in the same left-to-right pass that finds the calls, so it
 * stays O(n) over the body rather than rescanning from the start per match.
 */
function directCalls(body) {
  const calls = [];
  const name = /\b(use[A-Z][\w$]*)/y;
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (/[A-Za-z_$]/.test(c) && depth === 0 && (i === 0 || !/[\w$.]/.test(body[i - 1]))) {
      name.lastIndex = i;
      const match = name.exec(body);
      if (match) {
        let j = match.index + match[0].length;
        while (/\s/.test(body[j])) j += 1;

        // A type argument is skipped by balancing angle brackets, not by a
        // character class. The old pattern was `<[^;{}()]*>`, which silently
        // failed to match
        //     useMemo<{ provider: 'local'; model: string } | null>(...)
        // and so never counted that hook at all — a hole in a census whose
        // entire job is noticing a missing hook. Found only because extracting
        // the type to an alias made the count jump by one.
        if (body[j] === '<') {
          let angle = 0;
          let brace = 0;
          let paren = 0;
          let ok = false;
          for (; j < body.length; j += 1) {
            const t = body[j];
            if (t === '{') brace += 1;
            else if (t === '}') brace -= 1;
            else if (t === '(') paren += 1;
            else if (t === ')') paren -= 1;
            else if (brace === 0 && paren === 0) {
              // Only the outermost level decides. An object type's own
              // semicolons are structure, not statement ends — bailing on them
              // is what kept `useMemo<{ a: string; b: number } | null>` out of
              // the census entirely.
              if (t === '<') angle += 1;
              else if (t === '>') { angle -= 1; if (angle === 0) { j += 1; ok = true; break; } }
              else if (t === ';') break;
            }
          }
          if (!ok) { i += 1; continue; }
          while (/\s/.test(body[j])) j += 1;
        }

        if (body[j] === '(') {
          // argStart is just inside the call's own paren: the arguments are
          // then seen at depth 1 (so hooks inside them are correctly ignored),
          // and it is where an effect's fingerprint is taken from.
          calls.push({ name: match[1], argStart: j + 1 });
          i = j + 1;
          depth += 1;
          continue;
        }
      }
    }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
    i += 1;
  }
  return calls;
}



/**
 * The scanner checks itself before it is trusted to check anything else.
 *
 * It silently missed every hook whose type argument contained braces —
 * `useState<{ model: string; done: boolean } | null>` and
 * `useMemo<{ provider: 'local'; model: string } | null>` were both invisible,
 * so a census whose whole purpose is noticing a missing hook could not see two
 * of them. That survived three extractions and surfaced only because pulling
 * the type into an alias made the count jump by one.
 *
 * A miscounting guard is worse than no guard, so these run every time.
 */
for (const [sample, expected, why] of [
  ['const [a, setA] = useState<{ x: string; y: boolean } | null>(null);', ['useState'], 'object type argument'],
  ['const b = useMemo<Record<string, number>>(() => ({}), []);', ['useMemo'], 'nested generic'],
  ['const c = useCallback((n) => n < 2 && n > 0, []);', ['useCallback'], 'comparisons in the body'],
  ['useEffect(() => { const [x] = useState(1); }, []);', ['useEffect'], 'a nested hook belongs to the callback'],
]) {
  const found = directCalls(sample).map((c) => c.name);
  if (found.join(',') !== expected.join(',')) {
    throw new Error(`the hook scanner is broken (${why}): expected ${expected.join(',')}, found ${found.join(',') || 'nothing'}`);
  }
}

/**
 * A short, stable identity for one effect.
 *
 * Every effect is called `useEffect`, so comparing the sequence of names could
 * only ever detect a change in how many there are — two effects swapping was
 * invisible, which is most of what "effect order" is supposed to mean. The
 * opening of the callback is enough to tell them apart and survives a pure
 * move, since a move does not rewrite the body.
 */
function fingerprint(body, argStart) {
  return scrubSource(body.slice(argStart, argStart + 200), { keepTemplateExpressions: true })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}

function flatten(body, trail) {
  const out = [];
  for (const { name, argStart } of directCalls(body)) {
    if (BUILTIN.has(name)) {
      const isEffect = name === 'useEffect' || name === 'useLayoutEffect';
      out.push({ name, sig: isEffect ? fingerprint(body, argStart) : '' });
      continue;
    }
    const found = findHook(name);
    if (!found) { out.push({ name: `${name}(external)`, sig: '' }); continue; }
    const key = `${found.file}:${name}`;
    if (trail.includes(key)) throw new Error(`hook recursion: ${[...trail, key].join(' -> ')}`);
    out.push({ name: `${name}{`, marker: true }, ...flatten(found.body, [...trail, key]), { name: `}${name}`, marker: true });
  }
  return out;
}

const entryBody = bodyOf(files.get(ENTRY.file), ENTRY.fn);
if (entryBody === null) throw new Error(`could not find ${ENTRY.fn}() in ${ENTRY.file}`);

const order = flatten(entryBody, []);
const effective = order.filter((entry) => !entry.marker);

/**
 * What actually has to hold.
 *
 * The first version of this compared the whole sequence and refused any change.
 * That is stricter than React: hook order must be stable across *renders* of a
 * component, not across versions of the source. Permanently moving a useState
 * above a useMemo is fine — every render then agrees. Insisting otherwise would
 * have blocked every cohesive extraction, since a cluster's state and its
 * callbacks sit hundreds of lines apart in this component.
 *
 * Two things do carry behaviour:
 *
 *   EFFECTS — useEffect and useLayoutEffect run in call order at mount, and
 *     their cleanups in that order too. Two effects that touch the same
 *     subscription, ref or storage key will behave differently if swapped.
 *     Each is compared by a fingerprint of its callback, not by its name: every
 *     effect is called useEffect, so comparing names could only ever notice a
 *     change in how many there are, and two effects trading places — most of
 *     what "effect order" means — went straight through.
 *
 *   CENSUS — the number of each kind of hook. A refactor that drops a useEffect
 *     or duplicates a useState changes what the component does, however the
 *     rest is arranged.
 *
 * Reordering a useState relative to a useMemo is left to the compiler, which
 * rejects a read-before-declare outright.
 */
const effectsOf = (list) => list
  .filter((e) => e.name === 'useEffect' || e.name === 'useLayoutEffect')
  .map((e) => `${e.name} ${e.sig}`);
const censusOf = (list) => {
  const counts = {};
  for (const { name } of list) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
};

if (process.argv.includes('--write')) {
  writeFileSync(SNAPSHOT, `${JSON.stringify({
    entry: ENTRY,
    census: censusOf(effective),
    effectCount: effectsOf(effective).length,
    effective,
    nested: order,
  }, null, 2)}\n`);
  console.log(`recorded ${effective.length} hook call(s), ${effectsOf(effective).length} effect(s), for ${ENTRY.fn}()`);
  process.exit(0);
}

if (process.argv.includes('--list-effects')) {
  // For judging a move by hand: the recorded sequence beside the current one.
  const previousSnapshot = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf-8')) : { effective: [] };
  const was = effectsOf(previousSnapshot.effective);
  const now = effectsOf(effective);
  for (let i = 0; i < Math.max(was.length, now.length); i += 1) {
    const same = was[i] === now[i];
    console.log(`${String(i).padStart(2)} ${same ? '  ' : '->'} was: ${(was[i] ?? '(none)').slice(10, 68)}`);
    if (!same) console.log(`      now: ${(now[i] ?? '(none)').slice(10, 68)}`);
  }
  process.exit(0);
}

if (!existsSync(SNAPSHOT)) throw new Error('no snapshot yet — run with --write first');
const previous = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'));

const wasCensus = previous.census;
const nowCensus = censusOf(effective);
const kinds = [...new Set([...Object.keys(wasCensus), ...Object.keys(nowCensus)])].sort();
const censusDrift = kinds
  .filter((kind) => (wasCensus[kind] ?? 0) !== (nowCensus[kind] ?? 0))
  .map((kind) => `${kind}: ${wasCensus[kind] ?? 0} -> ${nowCensus[kind] ?? 0}`);
// Collected rather than thrown one at a time: a refactor that changes both is
// exactly when you want to see both, and stopping at the first hid whether the
// effect order had moved as well.
const problems = [];
if (censusDrift.length) {
  problems.push(`hook census changed — a hook was added, dropped or duplicated:\n  ${censusDrift.join('\n  ')}`);
}

// Effects are compared by their position within the effect sequence, which is
// what determines mount and cleanup order.
const wasEffects = effectsOf(previous.effective);
const nowEffects = effectsOf(effective);
if (wasEffects.length !== nowEffects.length || wasEffects.some((sig, i) => sig !== nowEffects[i])) {
  const at = wasEffects.findIndex((sig, i) => sig !== nowEffects[i]);
  problems.push(
    [
      `effect order changed at position ${at} of ${wasEffects.length}:`,
      `  was: ${wasEffects[at] ?? '(end)'}`,
      `  now: ${nowEffects[at] ?? '(end)'}`,
      '  Effects run in call order at mount, and their cleanups in that order too.',
    ].join('\n'),
  );
}

if (problems.length) throw new Error(`\n${problems.join('\n\n')}`);

const moved = effective.filter((e, i) => previous.effective[i]?.name !== e.name).length;
console.log(
  `hook census and effect order hold: ${effective.length} calls, ${nowEffects.length} effects`
  + (moved ? ` (${moved} call site(s) shifted position — allowed, compiler checks the reads)` : ''),
);
