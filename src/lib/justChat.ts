// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelRow } from '../types';
import { getFirstModelPicks } from './firstModel.ts';
import { getFriendlyModelName, getHardwareFit, getModelCapabilities, isImageGenerationModel } from './modelCatalog.ts';

/**
 * The one model "Just let me chat" uses.
 *
 * The show answers "which model is best on my PC". Someone who came to replace
 * a chat service did not ask that, so this answers a smaller question: which
 * model should I talk to, now. It prefers what is already on the PC, because a
 * model that is there starts in seconds and a download does not.
 */
export type JustChatChoice = {
  /** The row's name, which is what chat and the download queue take. */
  model: string;
  /** What to call it on screen. */
  name: string;
  sizeGb: number | null;
  installed: boolean;
};

const COMFORTABLE = new Set(['sweet-spot', 'good']);

function canChat(row: ModelRow): boolean {
  if (row.runtime === 'comfyui') return false;
  if (isImageGenerationModel(row)) return false;
  // A model that only embeds text, or only makes pictures, has no chat to offer.
  const capabilities = getModelCapabilities(row);
  if (capabilities && capabilities.includes('embedding') && !capabilities.includes('completion')) return false;
  return true;
}

export function pickJustChatModel(rows: ModelRow[], vramGb: number): JustChatChoice | null {
  const choice = (row: ModelRow): JustChatChoice => ({
    model: row.displayName,
    name: getFriendlyModelName(row.displayName),
    sizeGb: row.sizeGb ?? null,
    installed: row.installed,
  });
  const fits = (row: ModelRow) => COMFORTABLE.has(getHardwareFit(row, vramGb).tone);
  const picks = getFirstModelPicks('chat', vramGb).map((pick) => pick.id);
  const byName = new Map(rows.map((row) => [row.displayName, row]));

  // 1. A recommended chat model that is already here.
  for (const id of picks) {
    const row = byName.get(id);
    if (row?.installed && canChat(row)) return choice(row);
  }

  // 2. Any chat model already here that this PC holds comfortably. The largest
  //    is the usual quality order within one machine's headroom.
  const present = rows
    .filter((row) => row.installed && canChat(row) && fits(row))
    .sort((a, b) => (b.sizeGb ?? 0) - (a.sizeGb ?? 0));
  if (present.length > 0) return choice(present[0]);

  // 3. A recommended one to download: it has to be fetchable and known in size.
  for (const id of picks) {
    const row = byName.get(id);
    if (row && !row.installed && canChat(row) && row.canDownload !== false && !row.cloudOnly
      && (row.sizeGb ?? 0) > 0 && fits(row)) {
      return choice(row);
    }
  }
  return null;
}
