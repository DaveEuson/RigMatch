// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { SkillTestSelection } from '../types';

type AskedSkills = Pick<SkillTestSelection, 'appBuilder' | 'code' | 'recognize' | 'listen' | 'image' | 'video'>;

/**
 * What to say when a skill round found nothing it could run — or null, when
 * no skill was asked for and there is nothing to say.
 *
 * The skill round follows every single test and Speed Dating run, and most of
 * those tick no skill test at all. Announcing "None of these models can be
 * tested that way" after each of them put a sentence about something nobody
 * asked for in place of the run's own result in Activity. It is news only when
 * a skill was asked for, which is also the case where silence stranded the
 * wizard waiting for a round that never started.
 */
export function nothingToRunNote(selection: AskedSkills): string | null {
  if (selection.recognize) return 'None of these models can read pictures.';
  if (selection.listen) return 'None of these models can listen to audio.';
  if (selection.appBuilder || selection.code || selection.image || selection.video) {
    return 'None of these models can be tested that way.';
  }
  return null;
}
