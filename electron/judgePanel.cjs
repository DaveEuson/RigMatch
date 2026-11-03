// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

/**
 * Two judges instead of one, averaged.
 *
 * The judge-consistency study (2026-10-26: 4 contestants, 3 judges, 8
 * questions on an RTX 4070) found that a judge at temperature 0 gives the same
 * mark every time, so asking one judge twice changes nothing, but a different
 * judge gives a different mark: three judges put the same four contestants in
 * three different orders, and on drawings they were 25 to 51 points apart. One
 * judge's mark is one opinion. Two different judges, averaged, is steadier,
 * and the gap between them says how far to trust the mark.
 */

/** Two judges this far apart on one answer is worth saying beside it. */
const JUDGE_SPREAD_FLAG = 20;

/**
 * The second judge: the first candidate that is not the first judge and is of
 * the same kind. For a drawing, the kind is whether it looks at the picture or
 * reads the code: the study's picture and code judges were unrelated on
 * drawings, so the two are never averaged together. Null when no candidate
 * fits, and the first judge marks alone, as before.
 */
async function secondJudge(primary, candidates, sameKind = async () => true) {
  for (const name of Array.isArray(candidates) ? candidates : []) {
    if (!name || name === primary) continue;
    if (await sameKind(name)) return name;
  }
  return null;
}

/**
 * The answer's mark from the judges that gave one: their average, and how far
 * apart they were (0 for a single judge). Null when no judge gave a mark, so
 * the answer falls back to its rule score as before.
 */
function combineMarks(marks) {
  const scores = (Array.isArray(marks) ? marks : []).map((mark) => Number(mark?.score)).filter(Number.isFinite);
  if (scores.length === 0) return null;
  const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  return { score, spread: Math.max(...scores) - Math.min(...scores) };
}

module.exports = { JUDGE_SPREAD_FLAG, secondJudge, combineMarks };
