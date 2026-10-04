// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useId, useState } from 'react';
import type { GoalId } from '../lib/goals';
import { goalHardwareExpectation, goalsByCategory, leagueLabel } from '../lib/goals';
import { HOST_AVATAR_SRC } from '../lib/modelAvatars';
import { useDialog } from '../lib/useDialog';

/** Said while it is still a choice, not discovered at the download. */
const COMFY_NOTE = 'Pictures, video and sound are made by ComfyUI, a separate free program RigMatch does not install. RigMatch can find it once it is running.';

const STEPS = ['welcome', 'model', 'goal'] as const;

/**
 * The first run, in three steps: what RigMatch is, what a model is, and what
 * you want one for. It shows once; Settings › Preferences brings it back.
 *
 * It replaced the goal-and-mode splash and the nav tour. The tour walked a side
 * menu that no longer exists, and the mode question asked a newcomer to judge
 * an interface they had not seen. Simple Mode is where the welcome ends; the
 * last step keeps a door to Advanced for anyone who has done this before.
 *
 * One goal, not several: one goal gets one clear answer, and Settings still
 * takes more for anyone who wants them.
 */
export function WelcomeOverlay({ vramGb, initialGoal, replay = false, onFinish, onClose }: {
  vramGb: number;
  initialGoal?: GoalId;
  /** Reopened from Settings: Escape closes it, and Skip changes nothing. */
  replay?: boolean;
  /** goals is empty for "Show everyone" or Skip; advanced is the door on the last step. */
  onFinish: (choice: { goals: GoalId[]; advanced: boolean; skipped: boolean }) => void;
  onClose?: () => void;
}) {
  // The first run must be answered or skipped, so Escape does nothing there;
  // focus is trapped either way.
  const ref = useDialog<HTMLDivElement>(replay ? onClose : undefined);
  const uid = useId();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalId | null>(initialGoal ?? null);
  const at = STEPS[step];
  // Only what can run here today: a goal that is not possible locally yet is a
  // dead option to someone who has not started.
  const goals = goalsByCategory().flatMap((group) => group.goals).filter((g) => g.runtime !== 'none');
  const picked = goal ? goals.find((g) => g.id === goal) : undefined;
  const expectation = picked ? goalHardwareExpectation(picked, vramGb) : null;
  const finish = (advanced: boolean) => onFinish({ goals: goal ? [goal] : [], advanced, skipped: false });
  const vram = Math.round(vramGb);

  return (
    <div className="welcome-backdrop" role="presentation">
      <div ref={ref} className="welcome-overlay" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <div className="welcome-stripe" aria-hidden="true" />
        <div className="welcome-body">
          <div className="welcome-head">
            {at === 'welcome' && <img className="welcome-host" src={HOST_AVATAR_SRC} alt="" />}
            <h2 id={`${uid}-title`}>
              {at === 'welcome' ? 'Welcome to RigMatch' : at === 'model' ? 'What’s a model?' : 'What are you looking for?'}
            </h2>
          </div>

          {at === 'welcome' && (
            <>
              <p>
                The dating show where your computer meets its perfect AI model. Contestants answer the same
                questions on your own PC, and the host crowns a Top Match. Nothing leaves this computer.
              </p>
              <p className="welcome-free">
                RigMatch is donationware: every feature is free, and nothing is locked if you don’t donate.
              </p>
            </>
          )}
          {at === 'model' && (
            <p>
              A model is an AI you can download and run yourself, like an app. Bigger ones usually answer better
              but need more memory and run slower. RigMatch checks what fits {vram > 0 ? `your ${vram} GB` : 'your computer'} before
              anyone walks on.
            </p>
          )}
          {at === 'goal' && (
            <>
              <p>Pick one to start. You can change it any time, and Show everyone keeps every door open.</p>
              <div className="welcome-goals" role="group" aria-label="What you want a model for">
                {goals.map((g) => (
                  <button key={g.id} type="button" className="welcome-goal" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
                    {g.desire}
                  </button>
                ))}
                <button type="button" className="welcome-goal" aria-pressed={goal === null} onClick={() => setGoal(null)}>
                  Show me everyone
                </button>
              </div>
              <p className="welcome-note" aria-live="polite">
                {picked && expectation
                  ? <>{leagueLabel(expectation.tone)}. {expectation.note}{picked.runtime === 'comfyui' ? ` ${COMFY_NOTE}` : ''}</>
                  : 'Every model that fits your computer.'}
              </p>
            </>
          )}
        </div>

        <div className="welcome-foot">
          <span className="welcome-dots" aria-hidden="true">
            {STEPS.map((id, index) => <i key={id} className={index === step ? 'on' : undefined} />)}
          </span>
          <span className="sr-only">Step {step + 1} of {STEPS.length}</span>
          {at === 'goal' && (
            <button type="button" className="btn btn-link welcome-advanced" onClick={() => finish(true)}>
              I’ve done this before: open Advanced Mode
            </button>
          )}
          <span className="welcome-spacer" />
          {step === 0 ? (
            <button
              type="button"
              className="btn btn-link"
              onClick={() => (replay ? onClose?.() : onFinish({ goals: [], advanced: false, skipped: true }))}
            >
              Skip
            </button>
          ) : (
            <button type="button" className="btn btn-line" onClick={() => setStep(step - 1)}>Back</button>
          )}
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish(false))}
          >
            {step < STEPS.length - 1 ? 'Next' : "Let's go"}
          </button>
        </div>
      </div>
    </div>
  );
}
