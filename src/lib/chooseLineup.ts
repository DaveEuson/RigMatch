// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelRow } from '../types';

/**
 * The most "Choose for me" will queue to download, in GB.
 *
 * It used to fill the lineup with the five largest models that fit, from the
 * whole catalog: on a 12 GB card that was 56 GB of downloads, hours on a home
 * connection, for the person who had just said they did not know what to pick.
 * About 20 GB is under half an hour at 100 Mbit/s.
 */
export const CHOOSE_FOR_ME_DOWNLOAD_GB = 20;

/**
 * Built to label text rather than talk: safety classifiers (llama-guard3,
 * granite4.1-guardian, shieldgemma, gpt-oss-safeguard) answer "safe" or
 * "unsafe", and document readers (deepseek-ocr, glm-ocr) turn a page into
 * text. They headed Simple Mode's list on a 12 GB card, as "Everyday
 * questions and chat". Advanced Mode still lists them; a newcomer's lineup
 * leaves them out. "ocr" must end the word, so a name like "socrates" passes.
 */
export function isSpecialistModel(model: string): boolean {
  // Also a function-calling model (functiongemma), a yes/no fact checker
  // (bespoke-minicheck), and two that only convert or extract (reader-lm,
  // nuextract): each answers a show's questions in its own format.
  return /ocr(?![a-z])|guard|shieldgemma|functiongemma|minicheck|reader-lm|nuextract/i.test(model || '');
}

type Card = { row: Pick<ModelRow, 'installed' | 'sizeGb'> };

/** How many contestants "Choose for me" seats when it has to download them. */
const CHOOSE_FOR_ME_FIELD = 3;

/**
 * A lineup from the cards the person is looking at, in the order shown.
 *
 * Models already on the PC come first, since they cost nothing; with three
 * there, nothing is downloaded. Otherwise it takes the biggest models that
 * still seat three within the budget: cards in screen order up to a size
 * cap, stopping at the first that would pass the budget, with the cap
 * lowered until three fit. It used to skip on to whatever still fitted,
 * which on a 24 GB card or bigger filled the lineup with the smallest card
 * in the list, a 270M or 360M model set up to lose.
 */
export function chooseLineup<T extends Card>(cards: T[], max = 5, min = 2, budgetGb = CHOOSE_FOR_ME_DOWNLOAD_GB): T[] {
  const installed = cards.filter((card) => card.row.installed).slice(0, max);
  const want = Math.min(max - installed.length, Math.max(CHOOSE_FOR_ME_FIELD, min) - installed.length);
  if (want <= 0) return installed;
  const toGet = cards.filter((card) => !card.row.installed);
  const size = (card: T) => card.row.sizeGb ?? 0;
  const upTo = (cap: number) => {
    const picked: T[] = [];
    let total = 0;
    for (const card of toGet) {
      if (size(card) > cap) continue;
      if (picked.length >= max - installed.length || total + size(card) > budgetGb) break;
      picked.push(card);
      total += size(card);
    }
    return picked;
  };
  let best: T[] = [];
  for (const cap of [...new Set(toGet.map(size))].sort((a, b) => b - a)) {
    const picked = upTo(cap);
    if (picked.length >= want) return [...installed, ...picked];
    if (picked.length > best.length) best = picked;
  }
  // Nothing seats three within the budget: as many as do, and when that is
  // under `min`, the smallest cards make up the number. A show needs two.
  const picks = [...installed, ...best];
  if (picks.length < min) {
    picks.push(...toGet.filter((card) => !picks.includes(card)).sort((a, b) => size(a) - size(b)).slice(0, min - picks.length));
  }
  return picks;
}
