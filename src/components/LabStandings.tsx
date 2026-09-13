// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { accuracyCounted, balanceLabel, type RankedContender } from '../lib/balance';
import { getScoreTone } from '../lib/format';
import type { AdvancedLabResult } from '../lib/labResults';
import { formatHistoryTime } from '../lib/modelCatalog';
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
  limit = SHOWN,
  showDates = false,
}: {
  ranked: RankedContender<AdvancedLabResult>[];
  balance: number;
  /** "82% of the prompt", "score 91", "sounds right to you". */
  describeAccuracy: (accuracy: number, result: AdvancedLabResult) => string;
  heading: string;
  /** Rows before "N more below the line". Scorecards shows them all. */
  limit?: number;
  /** When each test ran, for a list that is a record rather than a race. */
  showDates?: boolean;
}) {
  if (ranked.length === 0) return null;
  // Nothing judged means time order, whatever the fader says.
  const counted = accuracyCounted(ranked);
  // Every one failed its run or its check, so nothing ranks at all. "Nothing
  // was judged" would be false of results that were judged and fell short.
  const noneStanding = ranked.every((entry) => entry.standing === 'failed');
  const label = counted ? balanceLabel(balance) : 'speed only';
  const hidden = ranked.length - limit;
  const when = (completedAt: string) => (showDates ? ` · ${formatHistoryTime(completedAt)}` : '');
  const places = ranked.filter((entry) => entry.standing === 'ranked').map((entry) => entry.item);

  return (
    <section className="lab-standings" aria-label={heading}>
      <div className="lab-standings-head">
        <strong>{heading}</strong>
        <span>
          {counted
            ? `Ranked at ${label}`
            : noneStanding
              ? (ranked.length === 1 ? 'It did not pass' : 'None of them passed')
              : 'Ranked on speed alone: nothing was judged'}
        </span>
      </div>
      <ol>
        {ranked.slice(0, limit).map((entry) => {
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
                      : `${time} · ${describeAccuracy(entry.accuracy ?? 0, result)}, below the pass line, so it cannot win`}
                    {when(result.completedAt)}
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
                  {entry.accuracy === null ? 'unjudged, so it ranks after judged results' : describeAccuracy(entry.accuracy, result)}
                  {when(result.completedAt)}
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
