import { SCORE_WEIGHTS, MATCH_GRADE_BAND_ROWS } from '../lib/scoreReference';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function HowWeScoreSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="how-we-score-section">
      <button
        type="button"
        className="how-we-score-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? 'true' : 'false'}
      >
        <span>How We Score</span>
        <ChevronDown className={open ? 'rotated' : ''} aria-hidden="true" />
      </button>
      {open && (
        <div className="how-we-score-body">
          <p className="how-we-score-intro">
            All scoring is deterministic rule-based heuristics running locally. No cloud AI judge, no telemetry.
            Results reflect <em>your</em> hardware.
          </p>

          <div className="score-weight-list">
            {SCORE_WEIGHTS.map(({ label, pct, detail }) => (
              <div key={label} className="score-weight-row">
                <div className="score-weight-head">
                  <strong>{label}</strong>
                  <span className="score-weight-pct">{pct}%</span>
                </div>
                <div className="score-weight-bar">
                  <div className="score-weight-fill" style={{ width: `${pct * 2}%` }} />
                </div>
                <p>{detail}</p>
              </div>
            ))}
          </div>

          <div className="score-grade-table">
            <span className="score-grade-label">Grade scale</span>
            <div className="score-grade-rows">
              {MATCH_GRADE_BAND_ROWS.map(({ grade, range }) => (
                <div key={grade} className="score-grade-row">
                  <strong>{grade}</strong>
                  <em>{range}</em>
                </div>
              ))}
            </div>
          </div>

          <p className="how-we-score-footer">
            Scores are <em>relative to your rig</em>. A model that scores 88 on a 12 GB GPU will score differently
            on a Mac Studio with 64 GB unified memory.
          </p>
          <p className="how-we-score-footer">
            <strong>Answer quality is a heuristic proxy, not a verdict.</strong> The rule-based checks work by matching
            a shape: valid JSON with the right keys, a refusal where one belongs, a list of the requested length, a
            correct clamp function. Where a question has no such shape — everyday chat and writing — there is nothing
            to match, so the fallback scores by answer <em>length</em>. That is not a quality measurement, and RigMatch
            will not crown a Match on it: those goals stay uncrowned until you turn on the judge, which reads the answer
            and marks it properly. When any quality score looks off, open the scorecard and read the saved transcript —
            that is the source of truth.
          </p>
        </div>
      )}
    </section>
  );
}
