// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { accuracyCounted, balanceLabel, type RankedContender } from '../lib/balance';
import { getScoreTone } from '../lib/format';
import type { AdvancedLabResult } from '../lib/labResults';
import { formatVideoDuration } from '../lib/videoFit';

/** Enough to see who leads and why; the rest are one click away in Scorecards. */
const SHOWN = 6;

/**
 * Every result a Lab test has saved on this computer, ranked at the fader.
 *
 * A Lab card only ever showed the model picked in its dropdown, so trying three
 * checkpoints left three results nobody could see side by side, and the fader
 * would have had nothing to move. This is the leaderboard it moves.
 */
export function LabStandings({
  ranked,
  balance,
  describeAccuracy,
  heading,
}: {
  ranked: RankedContender<AdvancedLabResult>[];
  balance: number;
  /** "82% of the prompt", "score 91". */
  describeAccuracy: (accuracy: number) => string;
  heading: string;
}) {
  if (ranked.length === 0) return null;
  // Nothing judged means time order, whatever the fader says.
  const counted = accuracyCounted(ranked);
  const label = counted ? balanceLabel(balance) : 'speed only';
  const hidden = ranked.length - SHOWN;
  const places = ranked.filter((entry) => entry.standing === 'ranked').map((entry) => entry.item);

  return (
    <section className="lab-standings" aria-label={heading}>
      <div className="lab-standings-head">
        <strong>{heading}</strong>
        <span>{counted ? `Ranked at ${label}` : 'Ranked on speed alone: nothing was judged'}</span>
      </div>
      <ol>
        {ranked.slice(0, SHOWN).map((entry) => {
          const result = entry.item;
          const time = formatVideoDuration(result.elapsedMs / 1000);
          if (entry.standing === 'failed') {
            return (
              <li key={`${result.challenge}:${result.model}`} className="failed">
                <b>—</b>
                <span>
                  <strong>{result.model}</strong>
                  <em>
                    {result.error
                      ? result.error
                      : `${time} · ${describeAccuracy(entry.accuracy ?? 0)}, below the pass line, so it cannot win`}
                  </em>
                </span>
                <span />
              </li>
            );
          }
          const value = Math.round(entry.value * 100);
          return (
            <li key={`${result.challenge}:${result.model}`} className={entry.standing}>
              <b>{entry.standing === 'ranked' ? places.indexOf(result) + 1 : '·'}</b>
              <span>
                <strong>{result.model}</strong>
                <em>
                  {time}
                  {' · '}
                  {entry.accuracy === null ? 'unjudged, so it ranks after judged results' : describeAccuracy(entry.accuracy)}
                </em>
              </span>
              <b className={`advanced-lab-grade ${getScoreTone(value)}`}>{value} · {label}</b>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && <em className="lab-standings-more">{hidden} more below the line.</em>}
    </section>
  );
}
