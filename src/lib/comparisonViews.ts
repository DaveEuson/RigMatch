// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The Comparison screen's parts, as a list you can see.
 *
 * Measured before this existed: 1575px of stacked cards read through a 374px
 * window. Seven of them — setup, stage, transcript, lineup, run progress,
 * questions, how-testing-works, ranking — with nothing naming what was below
 * the fold. The transcript alone was 517px, so the thing you came to read was
 * shown through a slot a quarter of its height, and the ranking, which is the
 * answer to the whole exercise, sat last of all.
 *
 * So the cards become views and this is the menu. One part fills the column at
 * a time, and every part says what it holds before you pick it.
 */
export type ComparisonViewId = 'transcript' | 'ranking' | 'lineup' | 'questions' | 'process';

export type ComparisonRailItem = {
  id: ComparisonViewId;
  label: string;
  status: string | null;
};

export type ComparisonRailInput = {
  lineupCount: number;
  maxContestants: number;
  answeredCount: number;
  questionCount: number;
  winner: string | null;
};

export function buildComparisonRail(input: ComparisonRailInput): ComparisonRailItem[] {
  const { lineupCount, maxContestants, answeredCount, questionCount, winner } = input;
  return [
    {
      // First, because it is the answer. The nav entry that leads here promises
      // "Ranked results & details" and the rail used to open with the details;
      // defaultComparisonView already lands on the ranking after a run, so the
      // list was disagreeing with the screen's own choice of where to start.
      id: 'ranking',
      label: 'Ranking',
      status: winner ? `${winner} leads` : 'Not run yet',
    },
    {
      id: 'transcript',
      label: 'Questions & Answers',
      // "0 of 5 tested" is a truer empty state than a blank: it says the
      // feature works and nothing has run, rather than looking broken.
      status: `${answeredCount} of ${lineupCount} tested`,
    },
    {
      id: 'lineup',
      label: 'Lineup',
      status: `${lineupCount}/${maxContestants} picked`,
    },
    {
      id: 'questions',
      label: 'Questions',
      status: `${questionCount} asked of each`,
    },
    {
      id: 'process',
      label: 'How testing works',
      status: null,
    },
  ];
}

/**
 * What the ranking is a ranking of.
 *
 * The screen crowned a Best Match and never said how much of the lineup that
 * verdict rested on. The rail's "1 of 5 tested" was the only coverage figure
 * anywhere, and it describes the transcript, so a ranking of three models sat
 * under a banner reading "Five contestants, one rig, same questions" with
 * nothing on screen reconciling the two.
 *
 * Two ways a ranking drifts from the lineup, and both matter to the reader:
 * models in the lineup that never answered, and models in the ranking that
 * have since been swapped out. A stale ranking is worth reading — it just is
 * not a verdict on the lineup in front of you.
 */
export function describeRankingCoverage(input: {
  ranked: string[];
  lineup: string[];
  questionCount: number;
}): string {
  const { ranked, lineup, questionCount } = input;
  if (ranked.length === 0) return '';

  const inLineup = ranked.filter((model) => lineup.includes(model)).length;
  const untested = lineup.length - inLineup;
  const dropped = ranked.length - inLineup;
  // Silent about the questions when there are none to name, rather than
  // claiming "the same 0 questions".
  const sameQuestions = questionCount > 0
    ? ` the same ${questionCount} question${questionCount === 1 ? '' : 's'}`
    : ' the same questions';

  if (untested === 0 && dropped === 0) {
    return lineup.length === 1
      ? `Your one model answered${sameQuestions}.`
      : `All ${lineup.length} models in your lineup answered${sameQuestions}.`;
  }

  const clauses = [`${inLineup} of ${lineup.length} in your lineup ranked on${sameQuestions}`];
  if (dropped > 0) {
    clauses.push(`${dropped} ranked model${dropped === 1 ? '' : 's'} ${dropped === 1 ? 'is' : 'are'} no longer in it`);
  }
  return `${clauses.join(' — ')}.`;
}

/**
 * Which view to land on.
 *
 * Whatever the screen's most recent answer is. After a run that is the
 * ranking; with answers saved but no ranking it is the transcript; before
 * anything has happened the only useful thing on the screen is the lineup you
 * are still assembling.
 */
export function defaultComparisonView(input: {
  answeredCount: number;
  winner: string | null;
}): ComparisonViewId {
  if (input.winner) return 'ranking';
  if (input.answeredCount > 0) return 'transcript';
  return 'lineup';
}
