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
import { getModelAliases, getRankedModelScores } from './modelCatalog.ts';

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
 * Everything deletable except the current Top Pick.
 *
 * The sweep most people want on the way out: reclaim the shelf, keep the match.
 * With nothing scored there is no winner to spare, so this is every deletable
 * model — the caller is expected to label that case differently, because
 * "keep my match" and "delete everything" must not look like the same button.
 */
export function rowsExceptTopPick(
  modelRows: ModelRow[],
  modelScores: Record<string, TestedModelScore>,
): ModelRow[] {
  const rows = deletableRows(modelRows);
  const keep = getRankedModelScores(modelScores)[0]?.model;
  if (!keep) return rows;
  // Matched through aliases, because a score is filed under whichever name the
  // run used and a row can answer to several — missing the match here would
  // delete the very model this sweep exists to protect.
  return rows.filter((row) => !getModelAliases(row).includes(keep));
}

/** The Top Pick a sweep would spare, if one has been crowned. */
export function topPickToKeep(
  modelScores: Record<string, TestedModelScore>,
): string | undefined {
  return getRankedModelScores(modelScores)[0]?.model;
}
