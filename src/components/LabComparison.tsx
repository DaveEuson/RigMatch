// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { accuracyCounted, balanceLabel } from '../lib/balance';
import { comparisonGroups, describeLabAccuracy, rankLabList } from '../lib/channelWinners';
import { getScoreTone } from '../lib/format';
import { VISION_TEST_IMAGES } from '../lib/labChallenges';
import type { AdvancedLabResult } from '../lib/labResults';
import { formatHistoryTime } from '../lib/modelCatalog';
import { formatVideoDuration } from '../lib/videoFit';

type Channel = 'images' | 'listening' | 'reading';

/** Enough to compare at a glance; everything older is in Scorecards. */
const GROUPS_SHOWN = 3;

const NOUN: Record<Channel, string> = {
  images: 'checkpoint',
  listening: 'model',
  reading: 'model',
};

function heading(channel: Channel, key: string): string {
  if (channel === 'images') return `“${key}”`;
  if (channel === 'listening') return 'Each model’s latest listening test';
  const known = VISION_TEST_IMAGES.find((image) => image.src === key);
  if (known) return known.label;
  return key.startsWith('data:') ? 'Your uploaded picture' : 'The same test picture';
}

/**
 * Lab results side by side: the pictures, transcripts or descriptions
 * themselves, ranked at the fader.
 *
 * A ranking says which won; this shows why, which is what someone deciding
 * between two image models actually wants to look at. Only results given the
 * same thing sit together (see comparisonGroups), and the newest comparison
 * comes first.
 */
export function LabComparison({
  channel,
  results,
  balance,
  models,
}: {
  channel: Channel;
  results: Record<string, AdvancedLabResult>;
  /** Where the fader stands, already 0 when nothing can judge. */
  balance: number;
  /** Only these models, when the comparison belongs to a lineup. */
  models?: string[];
}) {
  const list = Object.values(results).filter((result) => result && (!models || models.includes(result.model)));
  const groups = comparisonGroups(list, channel).slice(0, GROUPS_SHOWN);
  if (groups.length === 0) return null;

  return (
    <div className="lab-comparison">
      {groups.map((group) => {
        const ranked = rankLabList(group.results, channel, balance);
        const counted = accuracyCounted(ranked);
        const label = counted ? balanceLabel(balance) : 'speed only';
        const places = ranked.filter((entry) => entry.standing === 'ranked').map((entry) => entry.item);
        const count = group.results.length;
        return (
          <section key={group.key} className="lab-comparison-group" aria-label={heading(channel, group.key)}>
            <div className="lab-comparison-head">
              {channel === 'reading' && group.key && (
                <img className="lab-comparison-picture" src={group.key} alt="The picture every model was asked to describe" />
              )}
              <div>
                <strong>{heading(channel, group.key)}</strong>
                <span>
                  {count} {NOUN[channel]}{count === 1 ? '' : 's'} · newest {formatHistoryTime(group.latest)} ·{' '}
                  {counted ? `ranked at ${label}` : 'ranked on speed alone: nothing was judged'}
                </span>
                {channel === 'listening' && (
                  <em>RigMatch does not keep which audio each test heard, so compare runs made on the same clip.</em>
                )}
              </div>
            </div>
            <ol className={`lab-comparison-cards ${channel}`}>
              {ranked.map((entry) => {
                const result = entry.item;
                const place = entry.standing === 'ranked' ? places.indexOf(result) + 1 : 0;
                const value = Math.round(entry.value * 100);
                const time = formatVideoDuration(result.elapsedMs / 1000);
                const measured = result.error
                  ? result.error
                  : entry.accuracy === null
                    ? 'unjudged, so it ranks after judged results'
                    : describeLabAccuracy(channel, entry.accuracy);
                return (
                  <li
                    key={`${result.challenge}:${result.model}`}
                    className={`lab-comparison-card ${entry.standing}${place === 1 ? ' leads' : ''}`}
                  >
                    {channel === 'images' && (result.imageDataUrl ? (
                      <img src={result.imageDataUrl} alt={`What ${result.model} drew`} />
                    ) : (
                      <div className="lab-comparison-missing">No picture came back</div>
                    ))}
                    <div className="lab-comparison-card-head">
                      <b>{entry.standing === 'ranked' ? place : entry.standing === 'failed' ? '—' : '·'}</b>
                      <strong title={result.model}>{result.model}</strong>
                      {entry.standing !== 'failed' && (
                        <span className={`advanced-lab-grade ${getScoreTone(value)}`}>{value} · {label}</span>
                      )}
                    </div>
                    <em>
                      {time} · {measured}
                      {entry.standing === 'failed' && !result.error ? ', below the pass line, so it cannot win' : ''}
                    </em>
                    {channel !== 'images' && (
                      <p className="lab-comparison-text">{result.response || '(nothing came back)'}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
