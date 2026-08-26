// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { UiMode } from '../lib/appConfig';
import type { GoalId } from '../lib/goals';
import { goalHardwareExpectation, goalsByCategory, leagueLabel } from '../lib/goals';
import { useDialog } from '../lib/useDialog';
import { BrandMark } from './CommonChrome';
import { ModeStep } from './ModeStep';
import { useState } from 'react';

/**
 * Said on the tile, not discovered at the download.
 *
 * "Making images" was offered exactly like "Everyday chat", and the difference
 * only surfaced three steps later when the download refused and told the user to
 * open a Settings page Simple Mode does not have. A goal that needs a program
 * RigMatch neither installs nor bundles should say so while it is still a
 * choice.
 */
const COMFY_GOAL_NOTE = 'Image, video and audio generation run through ComfyUI — a separate '
  + 'free program RigMatch does not install or bundle. RigMatch can find it for you once it '
  + 'is running.';

export function FirstRunSplash({ vramGb, onDone, initialGoals, onSaveGoals, onCancel, isUpgrade }: {
  vramGb: number;
  onDone: (mode: UiMode, goals: GoalId[]) => void;
  /** Set when reopened from Settings: pre-checks the saved picks. */
  initialGoals?: GoalId[];
  /** Set when this is an existing user meeting the goal question for the
   *  first time — the copy should welcome them back, not greet a stranger. */
  isUpgrade?: boolean;
  /** Set when reopened from Settings: save picks and close, no mode step. */
  onSaveGoals?: (goals: GoalId[]) => void;
  onCancel?: () => void;
}) {
  // On first run there is no onClose: the choice is required, so Escape must
  // not dismiss it. Reopened from Settings it is an ordinary dialog and
  // Escape cancels. Focus is trapped either way — it previously left focus on
  // <body> behind a full-viewport overlay.
  const splashRef = useDialog<HTMLDivElement>(onCancel);
  // The desire comes before the mode: "what do you want to do?" is a question
  // about the person, "Simple or Advanced?" is a question about our UI, and
  // the person's question goes first.
  const [step, setStep] = useState<'goals' | 'mode'>('goals');
  const [picked, setPicked] = useState<GoalId[]>(initialGoals ?? []);

  const toggle = (id: GoalId) => {
    setPicked((current) => (current.includes(id)
      ? current.filter((g) => g !== id)
      : [...current, id]));
  };

  return (
    <div ref={splashRef} className="mode-splash" role="dialog" aria-modal="true" aria-label="Choose how to use RigMatch">
      <div className="mode-splash-card">
        <div className="mode-splash-brand">
          <BrandMark />
          <div>
            <strong>RigMatch</strong>
            <span>Find the best AI your PC can run — nothing leaves this computer.</span>
          </div>
        </div>
        {step === 'goals' ? (
          <>
            <h2 className="mode-splash-title">
              {isUpgrade ? 'New in this version: what would you like to do?' : 'What would you like to do?'}
            </h2>
            <p className="mode-splash-sub">
              {isUpgrade
                ? 'RigMatch can now point itself at what you actually want. Pick one and the model list, the tests and the winners all follow it. Your saved scores and settings are untouched.'
                : 'Pick what matters most — you can add more anytime.'}
            </p>
            <div className="goal-splash-groups">
              {goalsByCategory().map(({ category, goals }) => (
                <section key={category.id} aria-label={category.label}>
                  <h3 className="goal-splash-category">{category.label}</h3>
                  <div className="goal-splash-grid">
                    {goals.map((goal) => {
                      const expectation = goalHardwareExpectation(goal, vramGb);
                      const selected = picked.includes(goal.id);
                      const pickOrder = picked.indexOf(goal.id) + 1;
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          className={`goal-splash-option${selected ? ' selected' : ''} tone-${expectation.tone}`}
                          onClick={() => toggle(goal.id)}
                          aria-pressed={selected}
                        >
                          <strong>{goal.desire}</strong>
                          {goal.runtime === 'none' ? (
                            // A missing backend is nobody's hardware's fault.
                            <em title={goal.unsupportedReason}>Not possible locally yet</em>
                          ) : (
                            <em
                              title={goal.runtime === 'comfyui'
                                ? `${expectation.note} ${COMFY_GOAL_NOTE}`
                                : expectation.note}
                            >
                              {leagueLabel(expectation.tone)}
                              {goal.runtime === 'comfyui' ? ' · needs ComfyUI' : ''}
                              {goal.grading === 'none' ? " · can't be graded yet" : ''}
                            </em>
                          )}
                          {selected && <span className="goal-splash-order">{pickOrder === 1 ? 'Main goal' : `#${pickOrder}`}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {picked.length > 1 && (
              <p className="goal-splash-nudge">
                One goal gets you one clear answer. The best model for coding is rarely the best
                for chatting, so each goal you add means more testing time before RigMatch can
                crown anyone. Your first pick leads.
              </p>
            )}
            <div className="goal-splash-actions">
              {onSaveGoals ? (
                <>
                  {onCancel && (
                    <button type="button" className="mini-button" onClick={onCancel}>
                      {isUpgrade ? 'Not now' : 'Cancel'}
                    </button>
                  )}
                  <button type="button" className="primary-button" onClick={() => onSaveGoals(picked)}>
                    {isUpgrade
                      ? (picked.length === 0 ? 'Skip for now' : 'Use these goals')
                      : (picked.length === 0 ? 'Clear goals' : 'Save goals')}
                  </button>
                </>
              ) : (
                <button type="button" className="primary-button" onClick={() => setStep('mode')}>
                  {picked.length === 0 ? 'Skip for now' : 'Continue'}
                </button>
              )}
            </div>
          </>
        ) : (
          <ModeStep onPick={(mode) => onDone(mode, picked)} />
        )}
      </div>
    </div>
  );
}
