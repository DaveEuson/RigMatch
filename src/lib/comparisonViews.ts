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
      id: 'transcript',
      label: 'Questions & Answers',
      // "0 of 5 tested" is a truer empty state than a blank: it says the
      // feature works and nothing has run, rather than looking broken.
      status: `${answeredCount} of ${lineupCount} tested`,
    },
    {
      id: 'ranking',
      label: 'Ranking',
      status: winner ? `${winner} leads` : 'Not run yet',
    },
    {
      id: 'lineup',
      label: "Tonight's Lineup",
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
