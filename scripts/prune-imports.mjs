import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Remove imports the compiler says are no longer used in App.tsx.
 *
 * After a component moves out, whatever only it used becomes dead weight.
 * tsc names them precisely (TS6133), so nothing is guessed — and it re-runs
 * until clean, because removing one line shifts every line number after it.
 */

const path = 'src/App.tsx';

function unusedInApp() {
  let output = '';
  try {
    execSync('npx tsc -b', { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  return [...output.matchAll(/src[/\\]App\.tsx\((\d+),(\d+)\): error TS6133: '([^']+)' is declared but its value is never read/g)]
    .map((m) => ({ line: Number(m[1]), col: Number(m[2]), name: m[3] }));
}

for (let round = 1; round <= 6; round += 1) {
  const unused = unusedInApp();
  if (unused.length === 0) { console.log(`clean after ${round - 1} round(s)`); break; }

  const lines = readFileSync(path, 'utf-8').split('\n');
  // Bottom-up so earlier line numbers stay valid.
  const sorted = [...unused].sort((a, b) => b.line - a.line);
  const removed = [];
  for (const { line, name } of sorted) {
    const text = lines[line - 1];
    if (text === undefined) continue;
    // A whole line that is just this name in an import list.
    if (new RegExp(`^\\s*(?:type\\s+)?${name},?\\s*$`).test(text)) {
      lines.splice(line - 1, 1);
      removed.push(name);
    } else if (text.includes(`${name},`)) {
      lines[line - 1] = text.replace(new RegExp(`\\b(?:type\\s+)?${name},\\s*`), '');
      removed.push(name);
    } else if (text.includes(name)) {
      lines[line - 1] = text.replace(new RegExp(`,?\\s*\\b(?:type\\s+)?${name}\\b`), '');
      removed.push(name);
    }
  }
  writeFileSync(path, lines.join('\n'));
  console.log(`round ${round}: removed ${removed.length} — ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ', …' : ''}`);
}
