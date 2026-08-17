import { readFileSync, readdirSync, statSync } from 'node:fs';

/**
 * The renderer's source, every file of it, concatenated.
 *
 * Guards and tests that pin themselves to `src/App.tsx` raise a false alarm
 * every time a component moves out of it: the behaviour is intact and only the
 * address is stale. That has now happened three times during the 0.7 split —
 * once to a release gate, twice to a test — so the address stops being a
 * filename and becomes "somewhere in the UI", which is what these checks
 * actually mean.
 *
 * Use it whenever the assertion is about behaviour existing at all. Keep
 * reading a specific file when the assertion is genuinely about THAT file —
 * useDialog.ts implementing its effect a particular way, for instance.
 *
 * Files are joined with a newline so no regex can match across the seam
 * between one file's last line and the next file's first.
 */
export function readRendererSource(root = 'src') {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.tsx?$/.test(name)) out.push(readFileSync(full, 'utf-8'));
    }
  };
  walk(root);
  if (out.length === 0) throw new Error(`no renderer sources found under ${root}`);
  return out.join('\n');
}
