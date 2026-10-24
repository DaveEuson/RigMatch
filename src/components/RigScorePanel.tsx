// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useMemo, useState } from 'react';
import { agentArcadeApi, isDesktopRuntime } from '../api';
import { formatDateTime, formatDay, formatGb, formatThroughputValue } from '../lib/format';
import { formatLocale } from '../lib/formatLocale';
import {
  RIG_HEADLINE_TIER,
  RIG_REFERENCE_MACHINE,
  RIG_REFERENCES,
  RIG_TIERS,
  RIG_WORKLOAD,
  rigPoints,
  type RigPoints,
  type RigTier,
  type RigTierId,
} from '../lib/rigScore';
import { describeChange, historyRows, latestByTier } from '../lib/rigScoreHistory';
import { rigHeadline, tierAvailability, tiersToRun, type RigProgress } from '../lib/rigScoreRun';
import { RIG_SPEED_BANDS, bandRange, promptWaitSeconds, speedBand } from '../lib/rigScoreScale';
import { rigScoreSession as session, useRigScoreSession } from '../lib/rigScoreLive';
import type { GpuContention, OllamaStatus, PullProgressUpdate, SystemProfile } from '../types';
import { GpuContentionNote } from './GpuContentionNote';
import './RigScorePanel.css';

const tierById = (id: RigTierId): RigTier => RIG_TIERS.find((tier) => tier.id === id) ?? RIG_TIERS[0];

function formatTps(value: number): string {
  const rounded = formatThroughputValue(value);
  return rounded === null ? '--' : Number(rounded).toLocaleString(formatLocale());
}

const formatPoints = (points: number) => points.toLocaleString(formatLocale());
const shortDigest = (digest?: string) => (digest ? digest.replace(/^sha256-/, '').slice(0, 12) : null);

function progressText(progress: RigProgress | null): string {
  if (!progress || progress.phase === 'checking') return 'Checking Ollama…';
  if (progress.phase === 'loading') return 'Loading the model (warm-up, not timed)…';
  if (progress.phase === 'unloading') return 'Unloading the model…';
  return `Timed run ${progress.run} of ${progress.of}…`;
}

function pointsText(points: RigPoints): string {
  if (points.kind === 'points') return formatPoints(points.points);
  if (points.kind === 'pending') return 'After the reference is measured';
  return 'No points: not the same test as the reference';
}

function downloadText(progress: PullProgressUpdate | undefined): string | null {
  if (!progress) return null;
  if (progress.phase === 'queued') return 'Waiting to download';
  if (progress.phase === 'paused') return 'Download paused';
  if (progress.phase === 'started' || progress.phase === 'pulling') {
    return progress.percent == null ? 'Downloading' : `Downloading, ${Math.round(progress.percent)}%`;
  }
  return null;
}

export function RigScorePanel({
  system,
  ollama,
  busy,
  pullProgressByModel,
  onDownloadModel,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  /** A show or test is running: the graphics card is taken. */
  busy: boolean;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  /** Opens the download consent dialog for a tier's model; false when it cannot. */
  onDownloadModel: (model: string) => boolean;
}) {
  // App's session, so a run outlives a visit to another tab and App knows the card is busy.
  const state = useRigScoreSession();
  const [contention, setContention] = useState<GpuContention | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    agentArcadeApi.getGpuContention().then((reading) => { if (live) setContention(reading); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const installed = useMemo(() => ollama.models.map((model) => model.name), [ollama.models]);
  const machine = { vramGb: system.gpu.vramGb, isUnifiedMemory: system.gpu.isUnifiedMemory };
  const latest = useMemo(() => latestByTier(state.history), [state.history]);
  const rows = useMemo(() => historyRows(state.history), [state.history]);
  const runnable = tiersToRun(machine, installed);
  const running = state.running;
  const canRun = ollama.ready && !busy && !running && Boolean(agentArcadeApi.runRigScore);

  // The headline is the Standard tier. Until it has a result, the hero shows
  // the tier that has one, says what the Standard tier needs, and gives no
  // speed band: a 3B model writing fast says little about the 8B headline.
  const { result: heroResult, band: heroBand } = rigHeadline(latest);
  const heroTier = heroResult ? tierById(heroResult.tier) : tierById(RIG_HEADLINE_TIER);
  const heroPoints = heroResult ? rigPoints(heroResult.measure, heroResult.stamp) : null;
  const headlineTier = tierById(RIG_HEADLINE_TIER);
  const headlineAvailability = tierAvailability(headlineTier, machine, installed);

  const requestDownload = (model: string) => {
    setDownloadNote(onDownloadModel(model)
      ? null
      : `RigMatch could not offer ${model} yet: the model list has not loaded. Try again in a moment.`);
  };

  const reference = RIG_REFERENCES.light ?? RIG_REFERENCES.standard;

  return (
    <section className="panel rigscore-page" aria-label="Speed score">
      <header className="page-head">
        <div>
          <h2>Speed score</h2>
          <p>
            How fast this PC runs local AI, as a number you can set beside another computer&apos;s.
            Every computer runs the same test on the same models. It is separate from the Match Score.
          </p>
        </div>
        <div className="page-head-actions">
          {running ? (
            <button type="button" className="btn btn-line" onClick={session.stop}>Stop</button>
          ) : (
            <button
              type="button"
              className="btn btn-gold"
              disabled={!canRun || runnable.length === 0}
              onClick={() => { void session.runTiers(runnable); }}
            >
              Run the speed test
            </button>
          )}
        </div>
      </header>

      <div className="rigscore-notes" role="status">
        {running && (
          <p>
            <strong>Testing the {tierById(running.tier).label} tier.</strong> {progressText(state.progress)}
            {running.queued.length > 0 && ` Then ${running.queued.map((id) => tierById(id).label).join(', ')}.`}
          </p>
        )}
        {!isDesktopRuntime && <p>This is the browser preview, so these numbers are samples, not a measurement of your computer.</p>}
        {isDesktopRuntime && !ollama.ready && <p>Ollama is not running, so the speed test cannot start. My PC › Overview shows how to start it.</p>}
        {busy && !running && <p>A test is running. The speed test waits until it has finished, so the two do not share the graphics card.</p>}
        {ollama.ready && runnable.length === 0 && !running && <p>No tier is ready to run yet. Each tier below says what it needs.</p>}
        {state.saveFailed && <p>The last result could not be saved: this computer&apos;s storage for RigMatch is full. It stays until RigMatch closes.</p>}
        {downloadNote && <p>{downloadNote}</p>}
      </div>
      <GpuContentionNote contention={contention} />

      <div className="rigscore-hero">
        <div className="rigscore-headline">
          {heroResult && heroPoints ? (
            <>
              <span className="rigscore-kicker">RigScore · {heroTier.label} tier · {heroTier.model}</span>
              {heroPoints.kind === 'points' ? (
                <p className="rigscore-number"><strong>{formatPoints(heroPoints.points)}</strong> <span>points</span></p>
              ) : (
                <p className="rigscore-number"><strong>{formatTps(heroResult.measure.decodeTps)}</strong> <span>tok/s writing</span></p>
              )}
              {heroBand && <p className="rigscore-band"><b>{heroBand.label}.</b> {heroBand.feel}</p>}
              {heroPoints.kind === 'pending' && <p className="rigscore-sub">Points after the reference is measured.</p>}
              {heroPoints.kind === 'not-comparable' && <p className="rigscore-sub">No points: {heroPoints.notes.join(' ')}</p>}
              {heroPoints.kind === 'points' && heroPoints.notes.length > 0 && (
                <p className="rigscore-sub">Against the reference: {heroPoints.notes.join(' ')}</p>
              )}
              {heroResult.tier !== RIG_HEADLINE_TIER && (
                <p className="rigscore-sub">
                  This is the {heroTier.label} tier ({heroTier.model}). The headline and its speed band come from the{' '}
                  {headlineTier.label} tier ({headlineTier.model}).{' '}
                  {headlineAvailability.kind === 'needs-download' && `It needs a ${formatGb(headlineAvailability.sizeGb)} download first.`}
                  {headlineAvailability.kind === 'too-big' && `This PC's graphics card is too small for it, so it is not run.`}
                  {headlineAvailability.kind === 'ready' && 'Run it to see it here.'}
                </p>
              )}
            </>
          ) : (
            <>
              <span className="rigscore-kicker">RigScore</span>
              <p className="rigscore-empty">No speed score yet</p>
              <p className="rigscore-sub">
                Run the speed test to measure this PC. Each tier loads its model, warms it up, then times three runs:
                about a minute a tier on most graphics cards.
              </p>
            </>
          )}
        </div>
        <ol className="rigscore-scale" aria-label="What the writing speed feels like">
          {RIG_SPEED_BANDS.map((band) => (
            <li key={band.id} aria-current={heroBand?.id === band.id ? 'true' : undefined}>
              <b>{band.label}</b>
              <span>{bandRange(band)}</span>
              <em>{band.feel}</em>
            </li>
          ))}
        </ol>
      </div>

      <h3 className="mypc-heading">Tiers</h3>
      <table className="rigscore-table rigscore-tiers">
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Model</th>
            <th scope="col">Writing</th>
            <th scope="col">Reading the prompt</th>
            <th scope="col">Points</th>
            <th scope="col"><span className="sr-only">Status</span></th>
          </tr>
        </thead>
        <tbody>
          {RIG_TIERS.map((tier) => {
            const result = latest[tier.id];
            const availability = tierAvailability(tier, machine, installed);
            const isRunning = running?.tier === tier.id;
            const isQueued = running?.queued.includes(tier.id) ?? false;
            const message = state.messages[tier.id];
            const download = downloadText(pullProgressByModel[tier.model]);
            const band = result ? speedBand(result.measure.decodeTps) : null;
            const wait = result ? promptWaitSeconds(result.measure.prefillTps, RIG_WORKLOAD.promptTokensTarget) : null;
            return (
              <tr key={tier.id} className={isRunning ? 'running' : undefined}>
                <td data-label="Tier">
                  <strong>{tier.label}</strong>
                  {tier.id === RIG_HEADLINE_TIER && <small>Headline</small>}
                </td>
                <td data-label="Model">
                  <span className="figure">{tier.model}</span>
                  {result ? (
                    <small>
                      {[result.stamp.quantization, shortDigest(result.stamp.modelDigest),
                        result.measure.loadSeconds > 0 ? `loads in ${result.measure.loadSeconds.toFixed(1)} s` : null].filter(Boolean).join(' · ')}
                    </small>
                  ) : <small>{availability.kind === 'ready' ? 'Installed' : `${formatGb(tier.sizeGb)} download`}</small>}
                </td>
                <td data-label="Writing">
                  {result ? (
                    <>
                      <span className="figure">{formatTps(result.measure.decodeTps)} tok/s</span>
                      {band && <small>{band.label}</small>}
                    </>
                  ) : <span className="rigscore-dim">--</span>}
                </td>
                <td data-label="Reading the prompt">
                  {result ? (
                    <>
                      <span className="figure">{formatTps(result.measure.prefillTps)} tok/s</span>
                      {wait !== null && <small>A page-long prompt in {wait < 10 ? wait.toFixed(1) : Math.round(wait)} s</small>}
                    </>
                  ) : <span className="rigscore-dim">--</span>}
                </td>
                <td data-label="Points">
                  {result
                    ? <span className={rigPoints(result.measure, result.stamp).kind === 'points' ? 'figure' : 'rigscore-dim'}>{pointsText(rigPoints(result.measure, result.stamp))}</span>
                    : <span className="rigscore-dim">--</span>}
                  {result && result.gpuShare !== null && result.gpuShare < 0.99 && (
                    <small>Ran {Math.round(result.gpuShare * 100)}% on the graphics card; the rest spilled into system memory.</small>
                  )}
                </td>
                <td data-label="Status" className="rigscore-status">
                  {isRunning && <span>{progressText(state.progress)}</span>}
                  {!isRunning && isQueued && <span>Next</span>}
                  {!isRunning && !isQueued && availability.kind === 'too-big' && (
                    <span>Not run: needs {availability.needGb} GB of graphics memory, and this PC has {formatGb(availability.haveGb)}.</span>
                  )}
                  {!isRunning && !isQueued && availability.kind === 'needs-download' && (
                    download ? <span>{download}</span> : (
                      <button type="button" className="btn btn-line btn-sm" onClick={() => requestDownload(tier.model)} disabled={!ollama.ready}>
                        Download ({formatGb(availability.sizeGb)})
                      </button>
                    )
                  )}
                  {!isRunning && !isQueued && availability.kind === 'ready' && (
                    <button
                      type="button"
                      className="btn btn-line btn-sm"
                      disabled={!canRun}
                      onClick={() => { void session.runTiers([tier]); }}
                      aria-label={`Run the ${tier.label} tier`}
                    >
                      {result ? 'Run again' : 'Run'}
                    </button>
                  )}
                  {message && !isRunning && <small className="rigscore-message">{message}</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {heroResult && (
        <>
          <h3 className="mypc-heading">What was measured</h3>
          <dl className="rigscore-stamp">
            <div><dt>Graphics card</dt><dd>{heroResult.stamp.gpu ?? 'Not read'}</dd></div>
            <div><dt>Graphics memory</dt><dd>{heroResult.stamp.vramGb ? formatGb(heroResult.stamp.vramGb) : 'Not read'}</dd></div>
            <div><dt>Driver</dt><dd>{heroResult.stamp.driverVersion ?? 'Not read'}</dd></div>
            <div><dt>Ollama</dt><dd>{heroResult.stamp.ollamaVersion ?? 'Not read'}</dd></div>
            <div><dt>RigMatch</dt><dd>{heroResult.stamp.appVersion}</dd></div>
            <div><dt>Model file</dt><dd>{[heroResult.stamp.quantization, shortDigest(heroResult.stamp.modelDigest)].filter(Boolean).join(' · ') || 'Not confirmed'}</dd></div>
            <div><dt>Test</dt><dd>Version {heroResult.stamp.workloadVersion}, {heroResult.stamp.numCtx.toLocaleString(formatLocale())} context</dd></div>
            <div><dt>Measured</dt><dd>{formatDateTime(heroResult.completedAt)}</dd></div>
          </dl>
        </>
      )}

      {rows.length > 0 && (
        <>
          <h3 className="mypc-heading">Past runs on this PC</h3>
          <table className="rigscore-table rigscore-history">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Tier</th>
                <th scope="col">Writing</th>
                <th scope="col">Reading the prompt</th>
                <th scope="col">Points</th>
                <th scope="col">Latest run against this one</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ result, latest: isLatest, sinceThen }) => (
                <tr key={result.id}>
                  <td data-label="When">{formatDateTime(result.completedAt)}</td>
                  <td data-label="Tier">{tierById(result.tier).label}</td>
                  <td data-label="Writing"><span className="figure">{formatTps(result.measure.decodeTps)} tok/s</span></td>
                  <td data-label="Reading the prompt"><span className="figure">{formatTps(result.measure.prefillTps)} tok/s</span></td>
                  <td data-label="Points">
                    <span className={rigPoints(result.measure, result.stamp).kind === 'points' ? 'figure' : 'rigscore-dim'}>
                      {pointsText(rigPoints(result.measure, result.stamp))}
                    </span>
                  </td>
                  <td data-label="Latest run against this one">
                    {isLatest && <span className="rigscore-dim">Latest</span>}
                    {sinceThen?.comparable && (
                      <>
                        <span>{describeChange(sinceThen.changePct)}</span>
                        {sinceThen.notes.length > 0 && <small>{sinceThen.notes.join(' ')}</small>}
                      </>
                    )}
                    {sinceThen && !sinceThen.comparable && (
                      <>
                        <span className="rigscore-dim">Not compared</span>
                        <small>{sinceThen.notes.join(' ')}</small>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="rigscore-footnote">
        1,000 points is the reference PC, an {RIG_REFERENCE_MACHINE}
        {reference ? `, measured ${formatDay(reference.measuredOn)}` : ''}. Twice as fast at both writing and reading is 2,000.
        Writing is how fast the answer comes out; reading is how fast the model takes in your prompt.
        Two runs are compared only when the model files, the test version and the context size match;
        a different Ollama or driver is named beside the comparison. Results stay on this PC.
      </p>
    </section>
  );
}
