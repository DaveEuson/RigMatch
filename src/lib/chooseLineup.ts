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
  return /ocr(?![a-z])|guard|shieldgemma/i.test(model || '');
}

type Card = { row: Pick<ModelRow, 'installed' | 'sizeGb'> };

/**
 * A lineup from the cards the person is looking at, in the order shown.
 *
 * Models already on the PC come first, since they cost nothing. Then cards in
 * screen order, skipping any that would take the downloads past the budget,
 * so a smaller card further down can still take a seat after the big ones at
 * the top. When the budget leaves fewer than `min`, the smallest remaining
 * cards make up the number: a show needs two.
 */
export function chooseLineup<T extends Card>(cards: T[], max = 5, min = 2, budgetGb = CHOOSE_FOR_ME_DOWNLOAD_GB): T[] {
  const picks = cards.filter((card) => card.row.installed).slice(0, max);
  let downloadGb = 0;
  for (const card of cards) {
    if (picks.length >= max) break;
    if (card.row.installed) continue;
    const gb = card.row.sizeGb ?? 0;
    if (downloadGb + gb > budgetGb) continue;
    downloadGb += gb;
    picks.push(card);
  }
  if (picks.length < min) {
    const smallest = cards.filter((card) => !picks.includes(card))
      .sort((a, b) => (a.row.sizeGb ?? 0) - (b.row.sizeGb ?? 0));
    picks.push(...smallest.slice(0, min - picks.length));
  }
  return picks;
}
