// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Film, Lightbulb, Play, X } from 'lucide-react';
import type { ModelRow } from '../types';
import { JUDGE_PASS, type Balances } from '../lib/balance';
import { readComfySettings } from '../lib/comfySettings';
import { ensureComfyRunning } from '../lib/comfyStarter';
import { describeComfyBusy, fetchComfyOutput } from '../lib/comfyTransport';
import { dataUrlToBlob } from '../lib/dataUrl';
import { formatDateTime, getErrorMessage } from '../lib/format';
import { generationModelById, type ComfyFolderListing } from '../lib/generationCatalog';
import { IMAGE_RUN_SETTINGS, toLabResult } from '../lib/imageGenChallenge';
import { runImageLabChallenge } from '../lib/imageGenRunner';
import { CUSTOM_IMAGE_PROMPT_ID, IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';
import { readAdvancedLabResults, writeAdvancedLabResults, type AdvancedLabResult } from '../lib/labResults';
import { samplingProfileFor } from '../lib/samplingProfile';
import { readVideoCalibration } from '../lib/videoCalibrationStore';
import { formatVideoDuration, formatVideoEstimate, type VideoMachine } from '../lib/videoFit';
import { lineupCardFacts, lineupEntry, measuredSecondsFor } from '../lib/videoLineup';
import { startVideoLineup, stopVideoLineup } from '../lib/videoLineupSession';
import { workbenchById } from '../lib/workbench';
import { useAudioLineupSession } from '../hooks/useAudioLineupSession';
import { useImageLineupSession } from '../hooks/useImageLineupSession';
import { useRowPanel } from '../hooks/useRowPanel';
import { useLabResults } from '../hooks/useLabResults';
import { useVideoLineupSession } from '../hooks/useVideoLineupSession';
import { BalanceFader } from './BalanceFader';
import { ComfyNeeded } from './ComfyNeeded';
import { Elapsed } from './Elapsed';
import { PromptPicker } from './PromptPicker';

/** The channels a ComfyUI model's own test belongs to. */
export type GenerationChannel = 'images' | 'video' | 'audio';

/** What a model's own test needs from the rest of the app. */
export type GenerationTestContext = {
  comfyReachable: boolean;
  comfyFolders: ComfyFolderListing;
  /** The vision model that checks pictures and clips; empty when none is installed. */
  judgeModel: string;
  /** The model that listens to made audio; empty when nothing installed can hear. */
  listenerModel: string;
  ollamaBaseUrl: string;
  machine: VideoMachine;
  balances: Balances;
  onBalanceChange: (channel: GenerationChannel, value: number) => void;
  /** Why accuracy cannot count on a channel right now, or null when it can. */
  lockedReason: (channel: GenerationChannel) => string | null;
  /** Another test holds the graphics card, so a time taken now would measure the contention. */
  gpuBusy: boolean;
  onCheckComfy: () => void;
  /** Comparison, where several models take the same prompt side by side. */
  onOpenComparison: (channel: GenerationChannel) => void;
};

type ImageRun = { phase: 'idle' | 'running' | 'complete' | 'failed'; message: string };

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Test a picture or video model where it is listed.
 *
 * The row used to say "Open Lab": go to another screen and pick the model you
 * were already looking at from a second list. Everything one test needs fits
 * under the row instead: a prompt, the question of what matters more, and the
 * result. It runs what the Lab runs, the same graph, settings and judge, and
 * saves the result where the Lab does, so Scorecards and Comparison see it too.
 * Comparison is where several models take the same prompt, one link away.
 *
 * Asking to test a ComfyUI model is asking for ComfyUI, so opening this starts
 * it when it is not running and Settings allows it.
 */
export function GenerationTestPanel({
  id,
  row,
  context,
  onClose,
}: {
  id: string;
  row: ModelRow;
  context: GenerationTestContext;
  onClose: () => void;
}) {
  const video = row.generationKind === 'video';
  const channel = video ? 'video' : 'images';
  const saved = useLabResults();
  const session = useVideoLineupSession();
  const imageLineup = useImageLineupSession();
  const audioSession = useAudioLineupSession();
  const [promptId, setPromptId] = useState(IMAGE_BENCHMARK_PROMPTS[0].id);
  const [customPrompt, setCustomPrompt] = useState('');
  const [confirmUnload, setConfirmUnload] = useState(false);
  const [imageRun, setImageRun] = useState<ImageRun>({ phase: 'idle', message: '' });
  const imageAbort = useRef<AbortController | null>(null);
  const { ref: panelRef, size, style } = useRowPanel();
  // Clips are fetched only when asked for: a few seconds of footage is
  // megabytes, and the scored artifact is the frame.
  const [clip, setClip] = useState<{ url: string; of: string } | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [clipError, setClipError] = useState('');
  const clipUrls = useRef(new Set<string>());

  // Asking to test a ComfyUI model is asking for ComfyUI: start it now, so it
  // loads while the prompt is picked. Settings can turn this off.
  useEffect(() => {
    if (!context.comfyReachable) void ensureComfyRunning('test');
  }, [context.comfyReachable]);

  // Object URLs outlive the panel unless revoked, and each pins a clip in memory.
  useEffect(() => {
    const urls = clipUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); };
  }, []);

  const entry = video && row.generationId ? lineupEntry(row.generationId) : undefined;
  const model = !video && row.generationId ? generationModelById(row.generationId) : undefined;
  // The file as ComfyUI lists it, which is the name its loader is asked for.
  const checkpoint = model
    ? (context.comfyFolders.checkpoints ?? []).find((name) => name.toLowerCase() === model.filename.toLowerCase())
      ?? model.filename
    : '';
  // The keys the Lab saves under, so a test here and one there are the same record.
  const resultKey = entry ? `video:${entry.key}` : checkpoint ? `image:${checkpoint}` : '';
  const last: AdvancedLabResult | undefined = resultKey ? saved[resultKey] : undefined;
  const facts = entry
    ? lineupCardFacts(entry, {
      machine: context.machine,
      installed: context.comfyFolders,
      calibration: readVideoCalibration(),
      measuredSeconds: measuredSecondsFor(entry, saved, context.machine.gpuName),
    })
    : null;
  const sampling = checkpoint ? samplingProfileFor(checkpoint) : null;

  const balance = context.balances[channel];
  const lockedReason = context.lockedReason(channel);
  // Nothing can check a picture, so the run counts speed alone, and says so.
  const rankAt = lockedReason ? 0 : balance;
  const mine = Boolean(entry && session.solo?.key === entry.key);
  const running = video ? mine && session.running : imageRun.phase === 'running';
  const promptReady = promptId !== CUSTOM_IMAGE_PROMPT_ID || customPrompt.trim().length > 0;
  // Why it cannot run right now, in a sentence. ComfyUI not answering has a box of its own.
  const blocked = !context.comfyReachable
    ? null
    : context.gpuBusy
      ? 'Another test is using the graphics card. This can run when it finishes.'
      : imageLineup.running
        ? 'Pictures are being compared. This can run when they finish.'
        : audioSession.running
        ? 'Audio is being made. This can run when it finishes.'
        : session.running && !mine
        ? 'Another video is rendering. This can run when it finishes.'
        : video
          ? (entry ? facts?.blocked ?? null : 'RigMatch has no graph for this model yet.')
          : !model || !row.installed
            ? 'ComfyUI does not list this model’s file, so there is nothing to run. Download it from its row.'
            : null;
  const canRun = context.comfyReachable && !blocked && promptReady && !running && !confirmUnload;

  const runImage = async () => {
    // Claimed before the first await, so a second click cannot draw a second picture.
    const controller = new AbortController();
    imageAbort.current = controller;
    setImageRun({ phase: 'running', message: 'Checking that ComfyUI is free…' });
    try {
      // Asked before anything is submitted: queuing behind someone else's render
      // produces a time that measures the queue.
      const busy = await describeComfyBusy();
      if (busy || controller.signal.aborted) {
        setImageRun(busy ? { phase: 'failed', message: busy } : { phase: 'idle', message: '' });
        return;
      }
      setImageRun({
        phase: 'running',
        message: `Drawing ${IMAGE_RUN_SETTINGS.width}×${IMAGE_RUN_SETTINGS.height} with ${row.displayName}…`,
      });
      const drawn = await runImageLabChallenge({
        checkpoint,
        promptId,
        customPrompt,
        judgeModel: context.judgeModel || undefined,
        ollamaBaseUrl: context.ollamaBaseUrl,
        signal: controller.signal,
      });
      // With where the fader stood as it started, like every other test.
      const result = { ...toLabResult(drawn, promptId, customPrompt), balance: rankAt };
      if (result.error) {
        setImageRun({ phase: 'failed', message: result.error });
        return;
      }
      // Read-modify-write against live storage, as the Lab does, so a result
      // saved elsewhere while this one drew is not erased.
      writeAdvancedLabResults({ ...readAdvancedLabResults(), [resultKey]: result });
      setImageRun({
        phase: 'complete',
        message: `${row.displayName} drew it in ${(drawn.elapsedMs / 1000).toFixed(1)} s${
          drawn.judged
            ? `, and ${context.judgeModel} confirmed ${Math.round((drawn.adherence ?? 0) * 100)}% of the prompt.`
            : '. Nothing could check the picture, so it is unjudged.'
        }`,
      });
    } catch (error) {
      setImageRun({ phase: 'failed', message: getErrorMessage(error) });
    } finally {
      imageAbort.current = null;
    }
  };

  const beginVideo = async () => {
    setConfirmUnload(false);
    if (!entry || !facts) return;
    await startVideoLineup({
      entries: [entry],
      expected: { [entry.key]: { low: facts.estimate.low, high: facts.estimate.high, basis: facts.estimate.basis } },
      promptId,
      customPrompt,
      judgeModel: context.judgeModel || undefined,
      ollamaBaseUrl: context.ollamaBaseUrl,
      // Started cold, the way its estimate was measured. The person agreed in
      // Settings, or in the warning below.
      unloadBetweenRuns: true,
      gpuName: context.machine.gpuName,
      balance: rankAt,
      solo: true,
    });
  };

  const start = () => {
    if (!video) void runImage();
    else if (readComfySettings().dedicated) void beginVideo();
    else setConfirmUnload(true);
  };

  const stop = () => {
    if (video) stopVideoLineup();
    else imageAbort.current?.abort();
  };

  const playClip = async (result: AdvancedLabResult) => {
    const ref = result.videoRef;
    if (!ref) return;
    setClipLoading(true);
    setClipError('');
    try {
      const dataUrl = await fetchComfyOutput(ref);
      // A blob costs one copy and then behaves like a file; a multi-megabyte
      // data: URL sitting in the DOM does not.
      const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
      clipUrls.current.add(url);
      if (clip) {
        URL.revokeObjectURL(clip.url);
        clipUrls.current.delete(clip.url);
      }
      setClip({ url, of: result.completedAt });
    } catch (error) {
      // Usually the clip was cleared from ComfyUI's output folder since the run.
      setClipError(getErrorMessage(error));
    } finally {
      setClipLoading(false);
    }
  };

  const shownClip = clip && last && clip.of === last.completedAt ? clip.url : null;
  const share = typeof last?.adherence === 'number' ? last.adherence : null;
  const message = video ? (mine ? session.message : '') : imageRun.message;
  const tone = video ? (session.failed ? 'failed' : session.running ? 'running' : 'complete') : imageRun.phase;
  const idleNote = facts
    ? facts.estimate.basis === 'measured'
      ? `One clip took ${formatVideoDuration(facts.estimate.seconds)} here last time.`
      : `One clip: ${lowerFirst(formatVideoEstimate(facts.estimate, { roughNote: false }))}.`
    : '';

  return (
    <section
      ref={panelRef}
      id={id}
      className={`generation-test ${video ? 'video' : 'image'} ${size}`}
      style={style}
      aria-label={`Test ${row.displayName}`}
      tabIndex={-1}
    >
      <header className="generation-test-head">
        {video ? <Film aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}
        <div>
          <span>{video ? 'Video test' : 'Image test'} · runs on ComfyUI</span>
          <strong>Test {row.displayName}</strong>
        </div>
        <button
          type="button"
          className="icon-action"
          onClick={onClose}
          aria-label={`Close the test of ${row.displayName}`}
          title="Close"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="generation-test-setup">
        <PromptPicker
          idPrefix={`generation-test-${row.generationId ?? 'model'}`}
          value={promptId}
          onChange={setPromptId}
          customPrompt={customPrompt}
          onCustomPromptChange={setCustomPrompt}
          disabled={running}
        />
        <div className="advanced-lab-safeguards">
          {entry ? (
            <>
              <span>
                {entry.output.width}×{entry.output.height} · {Math.round(entry.output.seconds)} s
                {entry.output.sound ? ' · sound' : ''}
              </span>
              <span title="ComfyUI is unloaded first, so the time compares with the Lab's.">starts cold</span>
            </>
          ) : (
            <>
              <span>{IMAGE_RUN_SETTINGS.width}×{IMAGE_RUN_SETTINGS.height}</span>
              {sampling && <span title={sampling.reason}>{sampling.steps} steps</span>}
            </>
          )}
          <span>{context.judgeModel ? `checked by ${context.judgeModel}` : 'unjudged: no vision model'}</span>
          {video && (
            <span title="Temporal consistency and flicker have no right answer and no local model judges them reliably.">
              motion not scored
            </span>
          )}
        </div>

        {!context.comfyReachable ? (
          <ComfyNeeded runs={`${row.displayName} runs on ComfyUI`} onCheck={context.onCheckComfy} />
        ) : (
          <>
            {confirmUnload && (
              <div className="video-lineup-confirm" role="alertdialog" aria-label="Unload ComfyUI first?">
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>This unloads ComfyUI first.</strong>
                  <span>
                    {row.displayName} then starts cold, the way its estimate was measured, so its time
                    compares fairly with the Lab’s. Anything you have loaded in ComfyUI yourself is
                    unloaded too.
                  </span>
                  <div className="advanced-lab-actions">
                    <button type="button" className="primary-button compact" onClick={() => void beginVideo()}>
                      Unload and render
                    </button>
                    <button type="button" className="mini-button outline" onClick={() => setConfirmUnload(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="generation-test-run">
              {running ? (
                <button type="button" className="mini-button outline" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button type="button" className="primary-button compact" onClick={start} disabled={!canRun}>
                  <Play aria-hidden="true" />
                  {video ? 'Render it' : 'Draw it'}
                </button>
              )}
              <span>
                {running && video && session.current
                  ? <>Rendering, <Elapsed since={session.current.startedAt} /> so far.</>
                  : blocked ?? (running ? '' : idleNote)}
              </span>
            </div>
          </>
        )}

        {message && <p className={`advanced-lab-message ${tone}`} role="status">{message}</p>}

        <button type="button" className="generation-test-lab-link" onClick={() => context.onOpenComparison(channel)}>
          {video ? 'Race it against other video models' : 'Compare it with other picture models'}
        </button>
      </div>

      <BalanceFader
        value={balance}
        onChange={(value) => context.onBalanceChange(channel, value)}
        accuracyMeans={workbenchById(channel).accuracyMeans}
        lockedReason={lockedReason}
        disabled={running}
      />

      <div className="generation-test-result">
        {last ? (
          <>
            <span className="generation-test-label">Latest result</span>
            <figure className="generation-test-picture">
              {shownClip ? (
                <video src={shownClip} controls autoPlay loop muted />
              ) : last.imageDataUrl ? (
                <img
                  src={last.imageDataUrl}
                  alt={video ? `The middle frame of the clip ${row.displayName} rendered` : `The picture ${row.displayName} drew`}
                />
              ) : (
                <div className="generation-test-empty">No picture came back</div>
              )}
              <figcaption>
                <strong>{video ? formatVideoDuration(last.elapsedMs / 1000) : `${(last.elapsedMs / 1000).toFixed(1)} s`}</strong>
                <span className={share === null ? 'unjudged' : share >= JUDGE_PASS ? 'passed' : 'short'}>
                  {share === null
                    ? 'unjudged'
                    : `${Math.round(share * 100)}% of the prompt${share < JUDGE_PASS ? ', below the pass line' : ''}`}
                </span>
                {video && last.videoRef && !shownClip && (
                  <button
                    type="button"
                    className="mini-button outline"
                    onClick={() => void playClip(last)}
                    disabled={clipLoading}
                  >
                    <Play aria-hidden="true" />
                    {clipLoading ? 'Loading' : 'Play the clip'}
                  </button>
                )}
              </figcaption>
            </figure>
            <p className="generation-test-meta">
              “{last.response}” · {formatDateTime(last.completedAt)}{last.gpu ? ` · ${last.gpu}` : ''}
            </p>
            {clipError && <em className="video-lineup-error">Could not load the clip. {clipError}</em>}
            {/* A picture's checks are the prompt's own questions. A clip's are
                a speed rubric the leaderboard does not use: its standing is its
                time and its frame's match, both shown above. */}
            {!video && last.checks.length > 0 && (
              <div className="advanced-lab-checks">
                {last.checks.map((check) => (
                  <div key={check.label} className={check.passed ? 'passed' : 'failed'} title={check.detail}>
                    <span>{check.passed ? 'Pass' : 'Miss'}</span>
                    <strong>{check.label}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="generation-test-placeholder">
            {video ? <Film aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}
            <span>
              {video
                ? 'The clip’s middle frame appears here, with the clip itself one click away.'
                : 'The picture appears here.'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
