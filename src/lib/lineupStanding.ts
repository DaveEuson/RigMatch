/**
 * Whether the saved winner has anything to do with the lineup on screen.
 *
 * `listTestResult` is persisted across sessions, so it is the winner of the
 * LAST show, which may have been a different set of models entirely. The
 * Comparison screen read it directly, and so announced "Tonight's lineup: five
 * contestants, one rig, same questions — qwen2.5:7b is leading with 93 Match"
 * on a lineup that did not contain qwen2.5:7b at all. Swapping one contestant
 * is enough to produce it.
 *
 * A result from a previous lineup is not wrong, it is just not about tonight,
 * so it is labelled rather than hidden — a beginner who ran a show yesterday
 * should still see that it happened.
 */

export type LineupStanding =
  /** The saved winner is in this lineup: a live standing. */
  | { kind: 'leading'; model: string }
  /** A real result, but from a lineup that is no longer on screen. */
  | { kind: 'previous'; model: string }
  /** Nothing has been run that this lineup can claim. */
  | { kind: 'none' };

export function lineupStanding(winner: string | undefined | null, lineup: string[]): LineupStanding {
  if (!winner) return { kind: 'none' };
  return lineup.includes(winner)
    ? { kind: 'leading', model: winner }
    : { kind: 'previous', model: winner };
}

/**
 * The banner sentence for a standing.
 *
 * `score` is only used for the live case: quoting a number next to a model that
 * is not in the lineup invites the reader to compare it with the ones that are.
 */
export function standingLine(
  standing: LineupStanding,
  score: number | string | undefined,
  shortName: (model: string) => string = (model) => model,
): string {
  switch (standing.kind) {
    case 'leading':
      return score == null
        ? `${shortName(standing.model)} is leading.`
        : `${shortName(standing.model)} is leading with ${score} Match.`;
    case 'previous':
      return `${shortName(standing.model)} won your last show — it is not in tonight's lineup.`;
    default:
      return 'Run the show to crown your Top Match for this computer.';
  }
}
