// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { formatGb } from '../lib/format';
import { demoArtifactsFor, type AdvancedLabResult } from '../lib/labResults';
import { normalizeModelKey } from '../lib/modelKey';
import { RIG_TIERS } from '../lib/rigScore';
import type { RigResult } from '../lib/rigScoreRun';
import type { RunHistory } from '../lib/runHistory';
import { reportQuestionPlan, reportRows, type StoredRunReport } from '../lib/runReports';
import { formatMatchScore } from '../lib/scoring';
import { testWhen, type TestEntry } from '../lib/testList';
import { displaySuiteName } from '../lib/testHistory';
import type { ModelRow, TestedModelScore } from '../types';
import { LabChecks } from './LabChecks';
import { RunReportBody } from './RunReportModal';
import { DemoResultModal } from './SkillDemoViewers';

/**
 * One test's results, in the place of the Results screen, the way they looked
 * when it finished. Everything here is read from what was saved: opening a test
 * never asks a model anything.
 */
export function TestDetail({
  entry,
  reports,
  history,
  scores,
  labResults,
  speed,
  modelRows,
  onBack,
  onOpenModel,
  onOpenSpeed,
}: {
  entry: TestEntry;
  reports: StoredRunReport[];
  history: RunHistory;
  scores: Record<string, TestedModelScore>;
  labResults: Record<string, AdvancedLabResult>;
  speed: RigResult[];
  modelRows: ModelRow[];
  onBack: () => void;
  /** Opens a model's own page (Top Pick). */
  onOpenModel: (model: string) => void;
  /** Opens My PC's speed test. */
  onOpenSpeed: () => void;
}) {
  const { source } = entry;
  const report = source.type === 'report' ? reports.find((candidate) => candidate.id === source.reportId) : undefined;
  const subtitle = [
    entry.models.filter(Boolean).join(', '),
    report ? displaySuiteName(report.suiteName) : '',
    testWhen(entry.at),
  ].filter(Boolean).join(' · ');

  return (
    <section className="panel test-detail" aria-label={`${entry.what}, ${testWhen(entry.at)}`}>
      <header className="page-head test-detail-head">
        <div>
          <button type="button" className="btn btn-link test-detail-back" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            Back to overview
          </button>
          <h2>{entry.what}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="test-detail-body">
        {report && (
          <RunReportBody
            result={{ winner: report.winner, results: report.results }}
            rows={reportRows(report.results, modelRows)}
            benchmarks={report.transcripts ?? {}}
            questionPlan={reportQuestionPlan(report) ?? []}
          />
        )}
        {source.type === 'scores' && (
          <ScoresOnly model={source.model} at={source.at} history={history} scores={scores} onOpenModel={onOpenModel} />
        )}
        {source.type === 'lab' && (
          <LabResults
            results={source.keys.map((key) => labResults[key]).filter((result): result is AdvancedLabResult => Boolean(result))}
          />
        )}
        {source.type === 'speed' && (
          <SpeedResult result={speed.find((candidate) => candidate.id === source.id)} onOpenSpeed={onOpenSpeed} />
        )}
      </div>
    </section>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="test-detail-facts">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

/** A test only the timeline or the saved scores remember: its numbers, and where its model's page is. */
function ScoresOnly({
  model,
  at,
  history,
  scores,
  onOpenModel,
}: {
  model: string;
  at: string;
  history: RunHistory;
  scores: Record<string, TestedModelScore>;
  onOpenModel: (model: string) => void;
}) {
  const key = normalizeModelKey(model);
  const run = history.runs[key]?.find((candidate) => candidate.completedAt === at);
  const saved = Object.values(scores).find((candidate) => candidate.model === model && candidate.completedAt === at);
  const measured = run ?? saved;
  if (!measured) return <p className="test-detail-note">The scores for this test are no longer saved.</p>;
  const rate = run?.avgTokensPerSecond ?? saved?.tokensPerSecond;
  return (
    <>
      <Facts
        rows={[
          ['Match score', `${formatMatchScore(measured)} · ${measured.grade}`],
          ['Speed', String(measured.speed)],
          ['Answer quality', String(measured.sobriety)],
          ['Computer fit', String(measured.fit)],
          ...(rate ? [['Speed in use', `${rate.toFixed(1)} tokens a second`] as [string, string]] : []),
          ...(run?.hardware?.gpu ? [['Computer', `${run.hardware.gpu}${run.hardware.vramGb ? `, ${formatGb(run.hardware.vramGb)}` : ''}`] as [string, string]] : []),
        ]}
      />
      <p className="test-detail-note">
        Only the scores were kept for this test. RigMatch keeps the answers for newer tests and the scores for older ones.
      </p>
      <button type="button" className="btn btn-line" onClick={() => onOpenModel(model)}>Open {model}</button>
    </>
  );
}

/** A Lab or skill test, or the models of one comparison, each with what it made. */
function LabResults({ results }: { results: AdvancedLabResult[] }) {
  const [viewing, setViewing] = useState(false);
  if (results.length === 0) return <p className="test-detail-note">The results of this test are no longer saved.</p>;
  const made = results.flatMap((result) => (result.error ? [] : demoArtifactsFor(result)));
  const ranked = [...results].sort((a, b) => Number(b.score) - Number(a.score));
  return (
    <>
      <ol className="test-detail-lab">
        {ranked.map((result) => (
          <li key={`${result.challenge}:${result.model}:${result.completedAt}`}>
            <div className="test-detail-lab-line">
              <strong>{result.model}</strong>
              <span>{result.error ? 'Did not finish' : `${result.score} · ${result.grade}`}</span>
            </div>
            {result.error && <p className="test-detail-note">{result.error}</p>}
            {result.imageDataUrl && !result.error && (
              <img className="test-detail-picture" src={result.imageDataUrl} alt={`Made by ${result.model}`} />
            )}
            {Array.isArray(result.checks) && result.checks.length > 0 && <LabChecks checks={result.checks} />}
            {/* A listening test has no picture or program to open: what it heard is the result. */}
            {!result.error && result.challenge === 'listening' && result.response.trim() && (
              <p className="test-detail-response">{result.response}</p>
            )}
          </li>
        ))}
      </ol>
      {made.length > 0 && (
        <button type="button" className="btn btn-line" onClick={() => setViewing(true)}>
          {made.length === 1 ? 'See what it made' : `See what they made (${made.length})`}
        </button>
      )}
      {viewing && <DemoResultModal demos={made} onClose={() => setViewing(false)} />}
    </>
  );
}

function SpeedResult({ result, onOpenSpeed }: { result: RigResult | undefined; onOpenSpeed: () => void }) {
  if (!result) return <p className="test-detail-note">This speed test is no longer saved.</p>;
  const tier = RIG_TIERS.find((candidate) => candidate.id === result.tier);
  return (
    <>
      <Facts
        rows={[
          ['Size', `${tier?.label ?? result.tier}${result.stamp?.model ? `, ${result.stamp.model}` : ''}`],
          ['Writing', `${result.measure.decodeTps.toFixed(1)} tokens a second`],
          ['Reading the question', `${Math.round(result.measure.prefillTps)} tokens a second`],
          ...(result.measure.loadSeconds > 0 ? [['Time to load', `${result.measure.loadSeconds.toFixed(1)} seconds`] as [string, string]] : []),
          ['Runs averaged', String(result.measure.runs)],
          ['Measured with', `RigMatch ${result.stamp?.appVersion ?? ''}`.trim()],
        ]}
      />
      <button type="button" className="btn btn-line" onClick={onOpenSpeed}>Open the speed test</button>
    </>
  );
}
