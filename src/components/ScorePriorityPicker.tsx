// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ScorePriorityId } from '../lib/scoring';
import { SCORE_PRIORITIES } from '../lib/scoring';

/**
 * What "best" should mean here.
 *
 * The app had an answer to this and never said it out loud: answer quality at
 * 34% against speed at 32%, which is a real editorial choice made on the
 * reader's behalf. A 0.6B model that replies instantly and gets Tank Man wrong
 * and a 7B that takes its time and gets it right are both "best" under some
 * reading, and only the reader knows which one they meant.
 *
 * Switching costs nothing and loses nothing: the four signals behind every
 * saved score are stored separately, so this re-summarises results that are
 * already on disk. No re-test, and no score is invalidated — which is why it
 * sits here as a preference rather than behind a "retest recommended" warning.
 */
const BLURB: Record<ScorePriorityId, string> = {
  balanced: 'Answer quality slightly ahead of speed. The default.',
  accuracy: 'Getting it right outweighs how long it takes.',
  speed: 'A fast answer outweighs a slightly better one.',
};

export function ScorePriorityPicker({
  priority,
  onPriorityChange,
}: {
  priority: ScorePriorityId;
  onPriorityChange: (priority: ScorePriorityId) => void;
}) {
  const entries = Object.entries(SCORE_PRIORITIES) as Array<[ScorePriorityId, { label: string }]>;
  const active = SCORE_PRIORITIES[priority];

  return (
    <section className="ui-mode-picker score-priority-picker" aria-label="What counts as the best match">
      <div>
        <span>Best Match Means</span>
        <strong>{active.label}</strong>
      </div>
      <div className="mode-toggle" role="group" aria-label="Choose what a Match score rewards">
        {entries.map(([id, profile]) => (
          <button
            key={id}
            type="button"
            className={priority === id ? 'active' : ''}
            onClick={() => onPriorityChange(id)}
            aria-pressed={priority === id}
          >
            <strong>{profile.label}</strong>
            <span>{BLURB[id]}</span>
          </button>
        ))}
      </div>
      <p className="score-priority-note">
        Re-scores what you have already tested — nothing is re-run, and no result is thrown away.
        Reliability and computer fit count the same either way.
      </p>
    </section>
  );
}
