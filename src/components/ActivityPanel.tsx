// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { getScoreTone } from '../lib/format';
import { extractHtmlDocument } from '../lib/labPreview';
import { readAdvancedLabResults } from '../lib/labResults';
import { formatHistoryTime } from '../lib/modelCatalog';
import type { OllamaStatus, PullProgressUpdate, RunProgress, SkillRunStatus, SystemProfile, TestedModelScore } from '../types';
import { AdvancedCapabilityLab } from './AdvancedCapabilityLab';
import { AppBuilderPreviewModal } from './AppBuilderPreview';
import { AvatarBust } from './Avatars';
import { ImageResultModal } from './ImageResultModal';
import type { StoredRunReport } from '../lib/runReports';
import { describeReport, hasTranscripts } from '../lib/runReports';
import { Code2, Download, FileText, Gauge, History, Lightbulb, Play, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function ActivityPanel({
  runProgress,
  skillRunStatus,
  pullProgressByModel,
  isListTesting,
  modelScores,
  selectedModel,
  ollama,
  system,
  onOpenModels,
  onOpenScorecards,
  onRerunTest,
  onStopBenchmark,
  onStopSkillTests,
  runReports,
  onOpenReport,
}: {
  runProgress: RunProgress | null;
  skillRunStatus: SkillRunStatus;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isListTesting: boolean;
  modelScores: Record<string, TestedModelScore>;
  selectedModel: string;
  ollama: OllamaStatus;
  system: SystemProfile;
  onOpenModels: () => void;
  onOpenScorecards: () => void;
  onRerunTest: (model: string) => void;
  onStopBenchmark: () => void;
  onStopSkillTests: () => void;
  /** Newest first. Empty until a comparison has finished at least once. */
  runReports: StoredRunReport[];
  onOpenReport: (id: string) => void;
}) {
  const [previewApp, setPreviewApp] = useState<{ html: string; model: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; model: string } | null>(null);
  const activePulls = Object.values(pullProgressByModel)
    .filter((update) => update && !['complete', 'failed', 'cancelled'].includes(update.phase));
  const benchmarkActive = runProgress?.phase === 'running';
  const skillActive = skillRunStatus.phase === 'running';

/** Private to this panel: nothing else in the app builds one. */
type ActivityJob = {
  key: string;
  model: string;
  kind: 'benchmark' | 'app' | 'image';
  label: string;
  grade: string;
  score: number;
  completedAt: string;
  html?: string | null;
  imageDataUrl?: string;
};

  const anythingRunning = benchmarkActive || skillActive || activePulls.length > 0 || isListTesting;

  // Re-read saved lab results whenever a skill run advances so freshly
  // finished App Builder / image jobs appear in the monitor.
  const labResults = useMemo(
    () => readAdvancedLabResults(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skillRunStatus.phase, skillRunStatus.completed],
  );

  const recentJobs = useMemo<ActivityJob[]>(() => {
    const jobs: ActivityJob[] = [];
    for (const score of Object.values(modelScores)) {
      if (!score?.completedAt) continue;
      jobs.push({ key: `bench:${score.model}`, model: score.model, kind: 'benchmark', label: 'Compatibility test', grade: score.grade, score: score.total, completedAt: score.completedAt });
    }
    for (const result of Object.values(labResults)) {
      if (!result || result.error || !result.completedAt) continue;
      if (result.challenge === 'app-builder') {
        jobs.push({ key: `app:${result.model}`, model: result.model, kind: 'app', label: 'App Builder', grade: result.grade, score: result.score, completedAt: result.completedAt, html: extractHtmlDocument(result.response) });
      } else if (result.challenge === 'image-generation' || result.challenge === 'video-generation') {
        jobs.push({ key: `img:${result.model}`, model: result.model, kind: 'image', label: result.challenge === 'video-generation' ? 'Video Lab' : 'Image Lab', grade: result.grade, score: result.score, completedAt: result.completedAt, imageDataUrl: result.imageDataUrl });
      }
    }
    return jobs.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, 10);
  }, [modelScores, labResults]);

  return (
    <section className="activity-panel" aria-label="Running tests and downloads">
      <div className="activity-panel-head">
        <div>
          <span>Activity</span>
          <strong>{anythingRunning ? 'Work in progress on this computer' : 'Job monitor'}</strong>
          <em>Live jobs report here as they run, and recent results stay below — open the app or image a test produced.</em>
        </div>
      </div>

      {runReports.length > 0 && (
        <article className="activity-card activity-reports">
          <div className="activity-card-head">
            <FileText aria-hidden="true" />
            <strong>Recent reports</strong>
            <b className="activity-state idle">{runReports.length} kept</b>
          </div>
          {/* Comparisons only. A run report is a group of models that sat the
              same exam; a single test has a scorecard, not a report. */}
          <ul className="activity-report-list">
            {runReports.map((report) => (
              <li key={report.id}>
                <button type="button" onClick={() => onOpenReport(report.id)}>
                  <strong>{describeReport(report)}</strong>
                  <em>
                    {new Date(report.completedAt).toLocaleString()}
                    {report.suiteName ? ` · ${report.suiteName}` : ''}
                  </em>
                  {/* safeStorage drops answer text first when the browser runs
                      out of room, so a report can outlive its transcript. Say
                      so on the row rather than opening an empty panel. */}
                  {!hasTranscripts(report) && <span title="The answers were dropped to save space. The scores are still here.">scores only</span>}
                </button>
              </li>
            ))}
          </ul>
          {/* Counted, not assumed: a report can be kept after its answers were
              dropped, and claiming answers for all of them would be false the
              first time storage got tight. */}
          <em className="activity-report-note">
            {(() => {
              const withAnswers = runReports.filter(hasTranscripts).length;
              const runs = `${runReports.length} run${runReports.length === 1 ? '' : 's'}`;
              if (withAnswers === runReports.length) return `The last ${runs} kept here, with their answers. Older ones make room for newer.`;
              if (withAnswers === 0) return `The last ${runs} kept here as scores. The answers were dropped to save space.`;
              const still = withAnswers === 1 ? '1 still has its answers' : `${withAnswers} still have their answers`;
              return `The last ${runs} kept here; ${still}. Older ones make room for newer.`;
            })()}
          </em>
        </article>
      )}

      <article className="activity-card">
        <div className="activity-card-head">
          <Gauge aria-hidden="true" />
          <strong>Benchmark</strong>
          <b className={benchmarkActive ? 'activity-state running' : 'activity-state idle'}>
            {benchmarkActive ? 'Running' : runProgress?.phase === 'failed' ? 'Failed' : runProgress?.phase === 'complete' ? 'Finished' : 'Idle'}
          </b>
        </div>
        {runProgress ? (
          <>
            <p>
              <strong>{runProgress.label}</strong> — {runProgress.currentModel}
              {runProgress.questionLabel ? ` · ${runProgress.questionLabel}` : ''}
              {typeof runProgress.questionRunIndex === 'number' && typeof runProgress.questionRunTotal === 'number' && runProgress.questionRunTotal > 1
                ? ` · run ${runProgress.questionRunIndex + 1}/${runProgress.questionRunTotal}`
                : ''}
            </p>
            <div className="popularity-track" aria-hidden="true">
              <i style={{ width: `${Math.max(2, Math.min(100, runProgress.percent))}%` }} />
            </div>
            <em>{runProgress.message}</em>
            {benchmarkActive && (
              <button type="button" className="mini-button outline activity-stop-btn" onClick={onStopBenchmark} title="Stop after the current question finishes">
                <X aria-hidden="true" />
                Stop after current question
              </button>
            )}
          </>
        ) : (
          <em>No benchmark has run in this session yet.</em>
        )}
      </article>

      <article className="activity-card">
        <div className="activity-card-head">
          <Code2 aria-hidden="true" />
          <strong>Skill Tests</strong>
          <b className={skillActive ? 'activity-state running' : 'activity-state idle'}>
            {skillActive ? `Running ${skillRunStatus.completed + 1}/${skillRunStatus.total}` : skillRunStatus.phase === 'complete' ? 'Finished' : 'Idle'}
          </b>
        </div>
        {skillRunStatus.phase === 'idle' ? (
          <em>Optional App Builder and image runs appear here when you include them in a test.</em>
        ) : (
          <>
            <p><strong>{skillRunStatus.label}</strong></p>
            {skillRunStatus.total > 0 && (
              <div className="popularity-track" aria-hidden="true">
                <i style={{ width: `${Math.max(4, Math.round(((skillRunStatus.completed + (skillActive ? 0.5 : 0)) / skillRunStatus.total) * 100))}%` }} />
              </div>
            )}
            {skillActive && (
              <button type="button" className="mini-button outline activity-stop-btn" onClick={onStopSkillTests} title="The current skill test finishes; remaining ones are skipped">
                <X aria-hidden="true" />
                Stop after current test
              </button>
            )}
          </>
        )}
      </article>

      <article className="activity-card">
        <div className="activity-card-head">
          <Download aria-hidden="true" />
          <strong>Downloads</strong>
          <b className={activePulls.length ? 'activity-state running' : 'activity-state idle'}>
            {activePulls.length ? `${activePulls.length} active` : 'Idle'}
          </b>
        </div>
        {activePulls.length ? (
          activePulls.map((update) => (
            <div key={update.id ?? update.model} className="activity-download-row">
              <span>{update.model}</span>
              <div className="popularity-track" aria-hidden="true">
                <i style={{ width: `${Math.max(2, Math.min(100, update.percent ?? 5))}%` }} />
              </div>
              <em>{update.status || 'Downloading...'}</em>
            </div>
          ))
        ) : (
          <em>No model downloads in flight. Queue one from the Models hub.</em>
        )}
        <button type="button" className="mini-button outline" onClick={onOpenModels}>
          Open Models
        </button>
      </article>

      <article className="activity-card">
        <div className="activity-card-head">
          <History aria-hidden="true" />
          <strong>Recent results</strong>
          <b className="activity-state idle">{recentJobs.length}</b>
        </div>
        {recentJobs.length === 0 ? (
          <em>Run a test and its result lands here — with a viewer for the app or image it produced.</em>
        ) : (
          <ul className="activity-results-list">
            {recentJobs.map((job) => (
              <li key={job.key}>
                <AvatarBust model={job.model} size="tiny" />
                <div className="activity-result-info">
                  <strong>{job.model}</strong>
                  <em>{job.label} · {formatHistoryTime(job.completedAt)}</em>
                </div>
                <span className={`score-row-grade ${getScoreTone(job.score)}`}>{job.score} · {job.grade}</span>
                {job.kind === 'app' && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => job.html && setPreviewApp({ html: job.html, model: job.model })}
                    disabled={!job.html}
                    title={job.html ? 'Play the generated app in a sandbox' : 'This answer had no runnable app to preview'}
                  >
                    <Play aria-hidden="true" />
                    Play It
                  </button>
                )}
                {job.kind === 'image' && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => job.imageDataUrl && setPreviewImage({ src: job.imageDataUrl, model: job.model })}
                    disabled={!job.imageDataUrl}
                    title={job.imageDataUrl ? 'View the generated image' : 'No image was saved for this run'}
                  >
                    <Lightbulb aria-hidden="true" />
                    View
                  </button>
                )}
                {job.kind === 'benchmark' && (
                  <>
                    <button type="button" className="mini-button outline" onClick={onOpenScorecards}>
                      Scorecard
                    </button>
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => onRerunTest(job.model)}
                      title={`Run the compatibility test on ${job.model} again`}
                    >
                      <RefreshCw aria-hidden="true" />
                      Rerun
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </article>

      <AdvancedCapabilityLab
        selectedModel={selectedModel}
        ollama={ollama}
        system={system}
      />

      {previewApp && (
        <AppBuilderPreviewModal html={previewApp.html} model={previewApp.model} onClose={() => setPreviewApp(null)} />
      )}
      {previewImage && (
        <ImageResultModal
          src={previewImage.src}
          model={previewImage.model}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </section>
  );
}
