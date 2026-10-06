// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Which test a model's own Test button runs, on the channel Advanced Mode is on.
 *
 * The button always ran the chat questions, so on Listens to audio a model
 * that can hear was asked about capitals and code instead of being played
 * anything. Now a channel's Test runs that channel's test when the model can
 * take it, and the questions when it cannot, so the button never offers a
 * test that must fail.
 *
 * Free of React and the bridge, so the rule is tested directly.
 */

import { canHearAudio, canReadImages, type CapabilityBearing } from './modelCatalog.ts';
import type { WorkbenchId } from './workbench.ts';

export type RowSkillTest = 'listening' | 'reading';

export function rowSkillTest(
  channel: WorkbenchId,
  row: CapabilityBearing & { runtime?: 'ollama' | 'comfyui'; localProvider?: string },
  installed: boolean,
): RowSkillTest | null {
  // Through the model's own program, Ollama or LM Studio, on what that
  // program reports it can do. LM Studio reports no model that hears.
  if (!installed || row.runtime === 'comfyui') return null;
  if (channel === 'listening' && canHearAudio(row)) return 'listening';
  if (channel === 'reading' && canReadImages(row)) return 'reading';
  return null;
}
