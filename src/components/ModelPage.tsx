// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { agentArcadeApi } from '../api';
import { companionLaunchMessage } from '../lib/companionLaunch';
import { matchMeasures } from '../lib/matchCard';
import type { RigPick } from '../lib/modelCatalog';
import { formatHistoryTime, getFriendlyModelName, getModelProfile } from '../lib/modelCatalog';
import { formatMatchScore } from '../lib/scoring';
import { getResponseEstimate } from '../lib/format';
import { modelTests, type ModelTest } from '../lib/testHistory';
import type { RunHistory } from '../lib/runHistory';
import type { StoredRunReport } from '../lib/runReports';
import type { BenchmarkResult, NetworkHost, SystemProfile, TestedModelScore } from '../types';
import { AvatarBust } from './Avatars';
import { ProfileQuestionTranscript } from './ProfileQuestionTranscript';
import { ResultExplanationCard } from './ResultExplanationCard';
import { ShareScorecard } from './ShareScorecard';
import { ModelDemoChips } from './SkillDemoViewers';

/**
 * One model's page: what it scored, every test it sat, and how it answered.
 *
 * It replaced Top Pick, the last screen still wearing the pre-redesign look:
 * a romance banner, a grade track, a dating profile with four tabs, six
 * buttons in a row and a strip of portraits whose scores were clipped under
 * their names. Its jobs stay: switch between the scored models, chat with one,
 * test it again, share it, and read its answers. And it gains the one Dave
 * asked for, the tests themselves: a Difficult Subjects run on yi:9b had
 * nowhere to show up.
 */
export function ModelPage({
  model,
  benchmark,
  score,
  modelScores,
  host,
  system,
  runReports,
  runHistory,
  topPick,
  clearedTopMatchCount,
  onSelect,
  onRunTest,
  onChoose,
  onOpenTest,
  onEditQuestions,
  onClearTopMatch,
  onRestoreClearedTopMatches,
  onClearScore,
  onExportForHatch,
}: {
  model: string;
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  modelScores: Record<string, TestedModelScore>;
  host?: NetworkHost;
  system: SystemProfile;
  runReports: StoredRunReport[];
  runHistory: RunHistory;
  topPick?: RigPick | null;
  clearedTopMatchCount: number;
  onSelect: (model: string) => void;
  onRunTest: () => void;
  onChoose: () => void;
  /** Opens a saved test's report: its ranking and answers. */
  onOpenTest: (reportId: string) => void;
  onEditQuestions: () => void;
  onClearTopMatch: () => void;
  onRestoreClearedTopMatches: () => void;
  onClearScore: (model: string) => void;
  onExportForHatch: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const name = getFriendlyModelName(model);
  const isTopMatch = topPick?.row.displayName === model;
  // The scored models, best first, to switch between: the one on screen always
  // among them. Names only, with the score beside each, nothing clipped. Read
  // from the scores themselves, so a scored model is listed whether or not its
  // catalog row is in view.
  const scored = Object.values(modelScores).sort((a, b) => b.total - a.total);
  const switcher = scored.slice(0, 8);
  if (!switcher.some((entry) => entry.model === model)) {
    const current = scored.find((entry) => entry.model === model);
    if (current) switcher.push(current);
  }
  const tests = modelTests(model, runReports, runHistory);

  const openChat = async () => {
    const problem = companionLaunchMessage(await agentArcadeApi.openChatApp());
    if (problem) alert(problem);
  };

  return (
    <section className="panel model-page" aria-label={`${name}: scores, tests and answers`}>
      {switcher.length > 1 && (
        <nav className="mp-switch" aria-label="Scored models">
          {switcher.map((entry) => (
            <button
              key={entry.model}
              type="button"
              aria-pressed={entry.model === model}
              onClick={() => onSelect(entry.model)}
              title={`${entry.model}: ${formatMatchScore(entry)} Match, grade ${entry.grade}`}
            >
              <span>{getFriendlyModelName(entry.model)}</span>
              <b>{formatMatchScore(entry)}</b>
            </button>
          ))}
        </nav>
      )}

      <header className="mp-head">
        <AvatarBust model={model} size="large" />
        <div className="mp-title">
          <h2>{name}</h2>
          <span>
            <code>{model}</code>
            {isTopMatch && <span className="mp-badge">Top Match</span>}
          </span>
        </div>
        <div className="mp-score">
          {score ? (
            <>
              <b>{formatMatchScore(score)}</b>
              <span>Match score · grade {score.grade} · replies in {getResponseEstimate(score.speed)}</span>
            </>
          ) : (
            <span>Not tested on this computer yet</span>
          )}
        </div>
      </header>

      <div className="mp-actions">
        {/* Chatting is what a good match is for, so it is the one gold button. */}
        <button type="button" className="btn btn-gold" onClick={() => void openChat()}>Chat with {name}</button>
        <button type="button" className="btn btn-line" onClick={onRunTest}>{score ? 'Test again' : 'Test it'}</button>
        {score && <button type="button" className="btn btn-line" onClick={() => setShareOpen(true)}>Share</button>}
        <span className="mp-more">
          {score && <button type="button" className="btn btn-link" onClick={onChoose}>What you can do with it</button>}
          <button
            type="button"
            className="btn btn-link"
            onClick={onExportForHatch}
            title="Save a small JSON profile of this match. Companion apps that accept it, such as Hatch, can set their local model from it."
          >
            Export model profile
          </button>
          {isTopMatch && <button type="button" className="btn btn-link" onClick={onClearTopMatch}>Clear Top Match</button>}
          {!isTopMatch && clearedTopMatchCount > 0 && (
            <button type="button" className="btn btn-link" onClick={onRestoreClearedTopMatches}>Restore cleared Top Matches</button>
          )}
          {score && <button type="button" className="btn btn-link mp-danger" onClick={() => onClearScore(model)}>Remove score</button>}
        </span>
      </div>

      {score && (
        <>
          <dl className="mp-measures">
            {matchMeasures(score).map((measure) => (
              <div key={measure.label}>
                <dt>{measure.label}</dt>
                <dd>{Math.round(measure.value)}</dd>
              </div>
            ))}
          </dl>
          <ResultExplanationCard model={model} profile={getModelProfile(model)} score={score} host={host} benchmark={benchmark} system={system} />
        </>
      )}

      <ModelDemoChips model={model} label="Made by this model" />

      <section className="mp-section" aria-labelledby="mp-tests-title">
        <h3 id="mp-tests-title">Tests</h3>
        {tests.length === 0 ? (
          <p className="mp-muted">No tests on this computer yet. Test it, or put it in a show.</p>
        ) : (
          <ol className="mp-tests">
            {tests.map((test) => <TestRow key={test.key} test={test} onOpen={onOpenTest} />)}
          </ol>
        )}
      </section>

      <section className="mp-section" aria-labelledby="mp-answers-title">
        <h3 id="mp-answers-title">Answers from the latest test</h3>
        <ProfileQuestionTranscript model={model} benchmark={benchmark} onEditQuestions={onEditQuestions} />
      </section>

      {shareOpen && score && (
        <ShareScorecard model={model} score={score} system={system} onClose={() => setShareOpen(false)} />
      )}
    </section>
  );
}

/** One test: when, which questions, alone or in a show, what it scored, and its answers if kept. */
function TestRow({ test, onOpen }: { test: ModelTest; onOpen: (reportId: string) => void }) {
  return (
    <li>
      <span className="mp-test-when">{formatHistoryTime(test.completedAt)}</span>
      <span className="mp-test-what">
        <strong>{test.suiteName}</strong>
        <em>
          {test.questionCount > 0 ? `${test.questionCount} question${test.questionCount === 1 ? '' : 's'}` : ''}
          {test.opponents === null ? '' : test.opponents > 0 ? ` · in a show of ${test.opponents + 1}${test.won ? ', won' : ''}` : ' · on its own'}
        </em>
      </span>
      <b className="mp-test-score">{test.scoreLabel} · {test.grade}</b>
      {test.reportId && test.hasAnswers ? (
        <button type="button" className="btn btn-line btn-sm" onClick={() => onOpen(test.reportId!)}>Answers</button>
      ) : (
        <span className="mp-muted" title="Only the scores were kept for this test.">scores only</span>
      )}
    </li>
  );
}
