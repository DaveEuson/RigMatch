// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { blindPickSaveNote, maskName } from '../lib/blindMode';
import { normalizeModelKey } from '../lib/modelKey';
import { getLineupModelName } from '../lib/modelCatalog';
import { useDialog } from '../lib/useDialog';
import { sealSiblings } from '../lib/sealSiblings';
import type { BlindSession } from '../lib/useBlindShow';
import type { BenchmarkPromptResult } from '../types';
import { AvatarBust } from './Avatars';
import { DrawingTile } from './DrawingGallery';
import './BlindShow.css';

/**
 * A blind show's ending, over the whole window: the pick, then the reveal.
 * Opaque, because the screens underneath already hold the result.
 */
export function BlindOverlay({ session, onPick, onSkip, onClose }: {
  session: BlindSession;
  onPick: (model: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  // Escape skips the pick, or closes the reveal: either way, the normal results.
  const panelRef = useDialog<HTMLDivElement>(session.stage === 'picking' ? onSkip : onClose);
  // Opaque is only paint. The window behind holds the judge's ranking, the
  // report bar and Results; out of the Tab order and the accessibility tree
  // until this closes.
  const [cover, setCover] = useState<HTMLElement | null>(null);
  useEffect(() => (cover ? sealSiblings(cover) : undefined), [cover]);
  const seated = session.lineup
    .map((model) => session.results.find((result) => normalizeModelKey(result.model) === normalizeModelKey(model)))
    .filter((result) => result !== undefined);
  return (
    <div ref={setCover} className="blind-overlay" role="presentation">
      <div ref={panelRef} className="blind-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="blind-overlay-title">
        {session.stage === 'picking' ? (
          <BlindPickStep
            entries={seated.map((result) => ({ label: maskName(result.model, session.names), prompts: result.prompts }))}
            onPick={(index) => onPick(seated[index].model)}
            onSkip={onSkip}
          />
        ) : (
          <BlindReveal session={session} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/** Who each contestant was, what the judge made of them, and whether the viewer agreed. */
function BlindReveal({ session, onClose }: { session: BlindSession; onClose: () => void }) {
  // The Reveal button that had focus is gone with the pick step, which left
  // focus on <body> and a screen reader saying nothing. The heading says what
  // just happened, and the reveal reads on from it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const same = (a: string | null, b: string | null) => Boolean(a && b && normalizeModelKey(a) === normalizeModelKey(b));
  const agreed = same(session.picked, session.judgeWinner);
  // With the tag where two contestants share a name, or "You picked Qwen3.
  // The best Match score went to Qwen3." reads as agreement when it is not.
  const nameOf = (model: string) => getLineupModelName(model, session.lineup);
  const picked = session.picked ? nameOf(session.picked) : '';
  return (
    <section className="blind-reveal" aria-labelledby="blind-overlay-title">
      <header className="page-head">
        <div>
          <h2 id="blind-overlay-title" ref={headingRef} tabIndex={-1}>You picked {picked}</h2>
          {/* The Match winner, said as one: on the Code channel Comparison
              crowns the coding leader, which can be a different model. */}
          <p>
            {agreed
              ? 'The judge agrees: it has the best Match score.'
              : `The best Match score went to ${session.judgeWinner ? nameOf(session.judgeWinner) : 'another contestant'}.`}
            {' '}{blindPickSaveNote(session.saved)}
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-gold" onClick={onClose}>See the results</button>
        </div>
      </header>
      <ol className="blind-reveal-list" aria-label="Who each contestant was">
        {session.lineup.map((model) => {
          const judged = session.judge.find((score) => same(score.model, model));
          const label = session.names.get(model) ?? model;
          return (
            <li key={model}>
              <span className="blind-reveal-seat">{label}</span>
              <AvatarBust model={model} size="small" />
              <span className="blind-reveal-name">
                <strong>{nameOf(model)}</strong>
                <em>{model}</em>
              </span>
              <span className="blind-reveal-tags">
                {same(model, session.picked) && <span className="blind-reveal-tag mine">Your pick</span>}
                {same(model, session.judgeWinner) && <span className="blind-reveal-tag judge">Match winner</span>}
              </span>
              <strong className="blind-reveal-score">
                {judged ? `${judged.total} Match · ${judged.grade}` : 'Did not finish'}
              </strong>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const BLIND_SWITCH_HELP = 'Hide the model names until the show ends, then pick the answers you liked best before the scores are shown. Your picks build your own ranking on Results.';

/**
 * The blind-mode switch on the lineup screen. Styled as the What's New switch.
 * The help is the description too: a title reaches only a mouse.
 */
export function BlindSwitch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <>
      <button
        type="button"
        className="news-switch blind-switch"
        role="switch"
        aria-checked={on}
        aria-describedby="blind-switch-help"
        disabled={disabled}
        onClick={() => onChange(!on)}
        title={BLIND_SWITCH_HELP}
      >
        <span className="news-switch-track" aria-hidden="true"><i /></span>
        Blind show
      </button>
      <span id="blind-switch-help" className="sr-only">{BLIND_SWITCH_HELP}</span>
    </>
  );
}

export type BlindPickEntry = {
  /** "Contestant N". */
  label: string;
  prompts: BenchmarkPromptResult[];
};

/**
 * The end of a blind show: every contestant's answers side by side, still
 * nameless, and one pick. Nothing about the result is on screen until the
 * viewer picks or skips, which is the point: a pick made after seeing the
 * judge's scores would be the judge's pick.
 */
export function BlindPickStep({
  entries,
  onPick,
  onSkip,
}: {
  entries: BlindPickEntry[];
  onPick: (index: number) => void;
  onSkip: () => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  // The first contestant's questions set the order; everyone answered the same set.
  const questions = entries.find((entry) => entry.prompts.length > 0)?.prompts ?? [];
  const question = questions[Math.min(questionIndex, Math.max(0, questions.length - 1))];
  const answerTo = (entry: BlindPickEntry) => {
    if (!question) return undefined;
    return entry.prompts.find((prompt) => prompt.id === question.id) ?? entry.prompts.find((prompt) => prompt.label === question.label);
  };

  return (
    <section className="blind-pick" aria-labelledby="blind-overlay-title">
      <header className="page-head">
        <div>
          <h2 id="blind-overlay-title">Pick your favorite</h2>
          <p>
            Names and scores stay hidden until you pick. Read the answers and choose the contestant you would rather use.
            {' '}An answer may still name its own model.
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-line" onClick={onSkip}>Skip</button>
          <button type="button" className="btn btn-gold" disabled={chosen === null} onClick={() => chosen !== null && onPick(chosen)}>
            {chosen === null ? 'Pick one to reveal' : `Reveal with ${entries[chosen].label}`}
          </button>
        </div>
      </header>

      {questions.length > 1 && (
        // aria-disabled, not disabled: a button that disables itself under the
        // focus (Next on the last question) drops focus to the page.
        <nav className="blind-pick-questions" aria-label="Questions">
          <button type="button" className="btn btn-line btn-sm" aria-disabled={questionIndex === 0} onClick={() => setQuestionIndex((i) => Math.max(0, i - 1))}>
            Previous
          </button>
          <span aria-live="polite">Question {questionIndex + 1} of {questions.length}</span>
          <button type="button" className="btn btn-line btn-sm" aria-disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex((i) => Math.min(questions.length - 1, i + 1))}>
            Next
          </button>
        </nav>
      )}
      {question && (
        <p className="blind-pick-prompt">
          <strong>{question.label}</strong>
          {question.prompt && <span>{question.prompt}</span>}
        </p>
      )}

      <div className="blind-pick-grid" role="radiogroup" aria-label="Contestants">
        {entries.map((entry, index) => {
          const answer = answerTo(entry);
          const answerId = `blind-pick-answer-${index}`;
          return (
            <label key={entry.label} className={chosen === index ? 'blind-pick-card chosen' : 'blind-pick-card'}>
              <span className="blind-pick-label">
                <input
                  type="radio"
                  name="blind-pick"
                  checked={chosen === index}
                  onChange={() => setChosen(index)}
                  // The label wraps the answer too; the name is the seat, the answer its description.
                  aria-label={entry.label}
                  aria-describedby={answerId}
                />
                {entry.label}
              </span>
              <span id={answerId} className="blind-pick-answer">
                {/* A drawing is judged by eye: the picture, never its markup. */}
                {answer?.type === 'drawing'
                  ? <DrawingTile drawing={answer.drawing} alt={`Drawing by ${entry.label}`} />
                  : answer?.response?.trim() || (answer ? 'No answer.' : 'Did not get to this question.')}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
