// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeLocale } from '../src/lib/formatLocale.ts';

/**
 * The packaged app ships only Chromium's English language pack, so the page's
 * default locale is en-US on every PC. From 0.9.3 to 0.9.4 a PC set to German
 * showed "10/5/2026, 2:30 PM". Dates and numbers now take the regional format
 * the main process reads from the OS.
 */

test('a locale from the OS becomes one Intl accepts', () => {
  assert.equal(normalizeLocale('de-DE'), 'de-DE');
  assert.equal(normalizeLocale('en_GB'), 'en-GB');
  assert.equal(normalizeLocale('de_DE.UTF-8'), 'de-DE');
  assert.equal(normalizeLocale('sr_RS@latin'), 'sr-RS');
});

test('a locale Intl would reject falls back to the default instead of throwing', () => {
  // toLocaleString('C') throws a RangeError, which would take the screen down.
  assert.equal(normalizeLocale('C'), undefined);
  assert.equal(normalizeLocale(''), undefined);
  assert.equal(normalizeLocale(undefined), undefined);
  assert.equal(normalizeLocale('not a locale'), undefined);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

test('every date and number on screen is written in the regional format', () => {
  const unlocalised = [];
  for (const file of sourceFiles('src')) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/\.toLocale(?:String|DateString|TimeString)\((?!formatLocale\(\))/.test(line)
        || /new Intl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)\((?!formatLocale\(\))/.test(line)) {
        unlocalised.push(`${file}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(unlocalised, [], 'pass formatLocale() as the locale');
});

test('the main process hands the regional format to the page', () => {
  const main = readFileSync('electron/main.cjs', 'utf8');
  const preload = readFileSync('electron/preload.cjs', 'utf8');
  assert.match(main, /additionalArguments: \[`--rigmatch-format-locale=\$\{[^}]*app\.getSystemLocale\(\)\}`\]/);
  assert.match(preload, /const FORMAT_LOCALE_ARG = '--rigmatch-format-locale=';/);
  assert.match(preload, /formatLocale: formatLocaleArg \?/);
});
