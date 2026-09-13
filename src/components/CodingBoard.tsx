// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { balanceLabel, balanceSplit, crowned } from '../lib/balance';
import { rankCoding, type CodingScored } from '../lib/channelWinners';
import { getResponseEstimate } from '../lib/format';

/**
 * Models ranked on their coding answers against speed, at the Code fader.
 *
 * The Match Score blends every kind of question, so a model that writes good
 * code and chats badly can sit below one that does the reverse. On the Code
 * channel that is the wrong order, and this is the right one: the coding
 * answers alone, weighed against speed as the person asked. Models without
 * enough graded coding answers are listed, not dropped, with the reason.
 */
export function CodingBoard({
  scores,
  balance,
  label,
}: {
  scores: CodingScored[];
  balance: number;
  /** The channel's winner label: "Best for code". */
  label: string;
}) {
  const { ranked, unmeasured } = rankCoding(scores, balance);
  const leader = crowned(ranked);

  return (
    <>
      <div className="list-winner">
        <span>{label}</span>
        <strong>{leader ? leader.item.model : 'Nobody yet'}</strong>
        <em>
          {leader
            ? `coding ${Math.round((leader.accuracy ?? 0) * 100)} · ${balanceLabel(balance)}`
            : 'Too few coding answers'}
        </em>
      </div>
      <p className="ranking-coverage">
        Ranked on the coding answers against speed, at {balanceSplit(balance)}.
        {unmeasured.length > 0
          && ` ${unmeasured.length} had too few graded coding answers to rank; the Coding focus in the Run dialog asks more of them.`}
      </p>
      <ol aria-label="Coding ranking">
        {ranked.map((entry, index) => (
          <li key={entry.item.model} className={index === 0 ? 'winner' : ''}>
            <b>{index + 1}</b>
            <span>{entry.item.model}</span>
            <em>
              coding {Math.round((entry.accuracy ?? 0) * 100)} · {Math.round(entry.item.speed)} speed · {getResponseEstimate(entry.item.speed)}
            </em>
            <strong>{Math.round(entry.value * 100)}</strong>
          </li>
        ))}
        {unmeasured.map((score) => (
          <li key={score.model} className="unmeasured">
            <b>·</b>
            <span>{score.model}</span>
            <em>too few graded coding answers to rank</em>
            <strong>—</strong>
          </li>
        ))}
      </ol>
    </>
  );
}
