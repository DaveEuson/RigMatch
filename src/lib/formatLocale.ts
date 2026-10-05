// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The locale every date and number on screen is written in: the computer's
 * regional format.
 *
 * The packaged app keeps only Chromium's English language pack, and Chromium
 * takes the page's default locale from the pack it loaded. So from 0.9.3 a PC
 * set to German showed "10/5/2026, 2:30 PM" and "1,234,567.5" where it had
 * shown "5.10.2026, 14:30" and "1.234.567,5". The main process reads the
 * regional format from the OS (app.getSystemLocale, which does not depend on
 * the language packs) and the preload hands it over as `formatLocale`.
 *
 * In a browser, as on the website's demo, nothing is handed over and the
 * browser's own default is already the reader's, so this is undefined, which
 * every toLocale* call treats as "the default".
 */
let resolved: { locale: string | undefined } | undefined;

export function formatLocale(): string | undefined {
  if (!resolved) {
    const handed = typeof window === 'undefined' ? undefined : window.agentArcade?.formatLocale;
    resolved = { locale: normalizeLocale(handed) };
  }
  return resolved.locale;
}

/**
 * A locale Intl accepts, or undefined. A tag Intl rejects makes every
 * toLocaleString call throw, so anything doubtful falls back to the default.
 * Linux can report POSIX-style names: "de_DE.UTF-8", "sr_RS@latin", "C".
 */
export function normalizeLocale(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const tag = raw.split(/[.@]/)[0].replace(/_/g, '-');
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
}
