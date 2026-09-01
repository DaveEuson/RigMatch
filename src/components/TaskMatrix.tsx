// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { buildTaskMatrix, isEmptyMatrix, summariseMatrix } from '../lib/taskMatrix';
import type { TestedModelScore } from '../types';

/**
 * Best at what, rather than best overall.
 *
 * A Match score ranks models against each other on everything at once. Someone
 * looking at three of them usually wants the other question — which one to
 * reach for when the job is code, or writing, or sticking to facts. Every run
 * has measured that per group since task groups landed, and until this existed
 * nothing rendered it.
 *
 * Most cells are deliberately not numbers. A group with two questions behind it
 * says so; a group nothing local could grade says the judge would. Filling
 * those with a score would make the table look complete and be wrong, which is
 * the failure mode a comparison screen can least afford.
 */
export function TaskMatrix({
  models,
  scores,
  onOpenJudgeSettings,
}: {
  models: string[];
  scores: Record<string, TestedModelScore>;
  onOpenJudgeSettings?: () => void;
}) {
  const matrix = buildTaskMatrix(models, scores);
  if (isEmptyMatrix(matrix)) return null;

  const summary = summariseMatrix(matrix);
  const anyNeedsJudge = matrix.rows.some((row) => row.cells.some((cell) => cell.state === 'needs-judge'));

  return (
    <section className="task-matrix" aria-label="What each model is best at">
      <div className="task-matrix-head">
        <span>Best at what</span>
        <strong>{summary ?? 'Not enough measured yet to name a leader in any category.'}</strong>
      </div>

      <div className="task-matrix-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Model</th>
              {matrix.groups.map((group) => (
                <th key={group.id} scope="col">{group.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.model}>
                <th scope="row" title={row.model}>{row.model}</th>
                {row.cells.map((cell) => {
                  const wins = matrix.winners[cell.group] === row.model;
                  if (cell.state === 'measured') {
                    return (
                      <td key={cell.group} className={wins ? 'measured wins' : 'measured'}
                        title={`${cell.score} from ${cell.questions} question${cell.questions === 1 ? '' : 's'} of this kind`}>
                        {cell.score}
                      </td>
                    );
                  }
                  if (cell.state === 'needs-judge') {
                    return (
                      <td key={cell.group} className="needs-judge"
                        title={`${cell.questions} answers, and nothing here could grade them. Turn on the judge in Settings and re-run.`}>
                        judge
                      </td>
                    );
                  }
                  if (cell.state === 'too-few') {
                    return (
                      <td key={cell.group} className="too-few"
                        title={`Only ${cell.questions} question${cell.questions === 1 ? '' : 's'} of this kind — too few to call.`}>
                        {cell.questions}q
                      </td>
                    );
                  }
                  return <td key={cell.group} className="none" title="Not asked anything of this kind">—</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="task-matrix-legend">
        Highlighted is the best measured in that column, and only where two or more models were measured.
        {' '}<b>judge</b> means answers exist that nothing local can grade
        {onOpenJudgeSettings && anyNeedsJudge && (
          <> — <button type="button" className="task-matrix-judge-link" onClick={onOpenJudgeSettings}>turn one on</button></>
        )}
        . <b>2q</b> means too few questions of that kind to call.
      </p>
    </section>
  );
}
