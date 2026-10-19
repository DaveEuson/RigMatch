// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Which installed models a cleanup sweep is allowed to delete.
 *
 * This decides what gets erased from someone's disk, so it lives here rather
 * than inline in a component: it is the one piece of this feature that must be
 * right, and the dialog that calls it only appears while the app is closing —
 * a bad moment to discover a mistake, and an awkward one to test by hand.
 */

import type { ModelRow, TestedModelScore } from '../types.ts';
import { getRigPick } from './modelCatalog.ts';

/**
 * Installed models RigMatch can actually delete.
 *
 * Ollama only. LM Studio manages its own library, and a ComfyUI checkpoint is
 * a file on disk that Ollama's delete API knows nothing about — passing either
 * to the sweep produced a failed delete per model. It bit "Delete Not Scored"
 * hardest, because a checkpoint can never be scored by the question suite and
 * so always landed in that set.
 */
export function deletableRows(modelRows: ModelRow[]): ModelRow[] {
  return modelRows.filter((row) => row.installed
    && row.localProvider !== 'lm-studio'
    && row.runtime !== 'comfyui');
}

/**
 * The model a sweep spares: the Top Match the screen shows, when it is on
 * this PC.
 *
 * It used to be the top raw score, which is not the Top Match: that one is
 * ranked among models that fit and skips one the person cleared. So the sweep
 * could delete the Top Match on screen, and when the top scorer had already
 * been deleted it kept nothing at all while saying "keeping your match". This
 * is getRigPick, the Top Match's own rule, over the installed models: the same
 * model whenever the shown one is installed, and never one that is gone.
 */
export function topPickToKeep(
  modelRows: ModelRow[],
  modelScores: Record<string, TestedModelScore>,
  vramGb: number,
  clearedMatches?: Set<string>,
): string | undefined {
  const pick = getRigPick(modelRows.filter((row) => row.installed), modelScores, vramGb, clearedMatches);
  return pick?.tone === 'scored' ? pick.row.displayName : undefined;
}

/**
 * Everything deletable except the model topPickToKeep spares.
 *
 * The sweep most people want on the way out: reclaim the shelf, keep the match.
 * With no match to keep this is every deletable model — the caller is expected
 * to label that case differently, because "keep my match" and "delete
 * everything" must not look like the same button.
 */
export function rowsExceptTopPick(modelRows: ModelRow[], keep: string | undefined): ModelRow[] {
  const rows = deletableRows(modelRows);
  if (!keep) return rows;
  return rows.filter((row) => row.displayName !== keep);
}
