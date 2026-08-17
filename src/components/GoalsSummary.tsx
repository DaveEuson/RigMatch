import type { GoalId } from '../lib/goals';
import { goalById } from '../lib/goals';

export function GoalsSummary({
  goals,
  onEditGoals,
}: {
  goals: GoalId[];
  onEditGoals: () => void;
}) {
  const primary = goals[0] ? goalById(goals[0]) : undefined;
  return (
    <section className="ui-mode-picker" aria-label="Your goals">
      <div>
        <span>Your Goals</span>
        <strong>
          {primary
            ? `${primary.desire}${goals.length > 1 ? ` · +${goals.length - 1} more` : ''}`
            : 'No goal picked yet'}
        </strong>
      </div>
      <div className="mode-toggle" role="group" aria-label="Edit goals">
        <button type="button" onClick={onEditGoals}>
          <strong>Change goals</strong>
          <span>
            {primary
              ? 'Your main goal points Models and Simple Mode at the right contestants.'
              : 'Pick a goal and RigMatch leads with the models that can do it.'}
          </span>
        </button>
      </div>
    </section>
  );
}
