// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from '../lib/format';
import { copyText, type CopyState } from '../lib/clipboard';
import { AlertTriangle, Check, Code2, Copy, Lightbulb, Play, RefreshCw } from "lucide-react";
import type { ComfyStatus, OllamaStatus, PullProgressUpdate, SystemProfile } from "../types";
import { formatGb, getScoreTone } from "../lib/format";
import { extractHtmlDocument } from "../lib/labPreview";
import { readAdvancedLabResults, writeAdvancedLabResults, type AdvancedLabResult } from "../lib/labResults";
import {
  APP_BUILDER_PRESETS,
  DEFAULT_APP_BUILDER_PRESET_ID,
  resolveAppBuilderPrompt,
  runAdvancedAppBuilderChallenge,
} from "../lib/labChallenges";
import { CUSTOM_IMAGE_PROMPT_ID, IMAGE_BENCHMARK_PROMPTS } from "../lib/imageGenScoring";
import { samplingProfileFor } from '../lib/samplingProfile';
import { IMAGE_RUN_SETTINGS, judgeCandidates, toLabResult } from "../lib/imageGenChallenge";
import { runImageLabChallenge } from "../lib/imageGenRunner";
import { comfyBridgeAvailable, describeComfyBusy, getComfyStatus } from "../lib/comfyTransport";
import { readComfySettings } from "../lib/comfySettings";
import { onComfyStarted } from "../lib/comfyStarter";
import { canHearAudio } from "../lib/modelCatalog";
import { isVideoCheckpoint } from "../lib/videoGen";
import { useVideoLineupSession } from "../hooks/useVideoLineupSession";
import { ListeningLab } from "./ListeningLab";
import { PromptPicker } from "./PromptPicker";
import { VideoLineupLab } from "./VideoLineupLab";
import { ComfyStartButton } from "./ComfyStartButton";
import { GpuContentionNote } from './GpuContentionNote';
import { useGpuContention } from '../hooks/useGpuContention';
import { gpuBusyNote } from '../lib/gpuBusyNote';
import { AppBuilderPreviewModal } from "./AppBuilderPreview";
import { BalanceFader } from "./BalanceFader";
import { LabStandings } from "./LabStandings";
import { useLabResults } from "../hooks/useLabResults";
import { useComfyStart } from "../hooks/useComfyStart";
import type { Balances } from "../lib/balance";
import { describeLabAccuracy, rankLabResults } from "../lib/channelWinners";
import { workbenchById, type ChannelId, type LabCardId, type Workbench } from "../lib/workbench";

/** Every Lab card: the All channel, and any caller from before channels. */
const ALL_CHANNELS = workbenchById('all');
/** What the Image fader weighs against render time. */
const IMAGE_ACCURACY = workbenchById('images').accuracyMeans;

type AdvancedLabRunState = {
  phase: 'idle' | 'running' | 'complete' | 'failed';
  result: AdvancedLabResult | null;
  message: string;
};

/**
 * Where the Image Lab stands before a run can happen.
 *
 * There are four distinct states and they need different words. ComfyUI not
 * installed, ComfyUI running with no checkpoints, ready to go, and a build that
 * has no bridge at all. Collapsing them into "unavailable" is what made the old
 * Lab so confusing — it offered a Run button that could only ever produce an
 * error.
 */
type ImageReadiness =
  | { kind: 'no-bridge' }
  | { kind: 'not-running' }
  | { kind: 'no-checkpoints' }
  | { kind: 'ready'; checkpoints: string[] };

function readinessFrom(available: boolean, status: ComfyStatus | null): ImageReadiness {
  if (!available) return { kind: 'no-bridge' };
  if (!status?.reachable) return { kind: 'not-running' };
  // Counted after removing video models, not before. A ComfyUI holding only
  // an LTX checkpoint is not ready for *images* — judging readiness on the
  // raw list rendered the ready branch with an empty picker and a dead Run
  // button, explaining nothing.
  const usable = status.checkpoints.filter((name) => !isVideoCheckpoint(name));
  if (!usable.length) return { kind: 'no-checkpoints' };
  return { kind: 'ready', checkpoints: usable };
}

export function AdvancedCapabilityLab({
  selectedModel,
  ollama,
  system,
  onDownloadVideoModel,
  onStopVideoDownload,
  pullProgressByModel,
  workbench = ALL_CHANNELS,
  balances,
  onBalanceChange,
  onOpenComparison,
}: {
  selectedModel: string;
  ollama: OllamaStatus;
  system: SystemProfile;
  /** Starts a video model's download, after the consent dialog. */
  onDownloadVideoModel?: (generationId: string) => void;
  onStopVideoDownload?: () => void;
  /** Download progress by model name, so a video model's row can show its own. */
  pullProgressByModel?: Record<string, PullProgressUpdate>;
  /** The channel Advanced Mode is on. Only its Lab cards are shown. */
  workbench?: Workbench;
  /** Each channel's Balance fader. */
  balances: Balances;
  onBalanceChange: (channel: ChannelId, value: number) => void;
  /** Where a channel with no Lab card sends people instead. */
  onOpenComparison?: () => void;
}) {
  const installedModels = useMemo(
    () => ollama.models.map((model) => model.name || model.model).filter(Boolean),
    [ollama.models],
  );
  const defaultModel = installedModels.includes(selectedModel) ? selectedModel : (installedModels[0] ?? '');
  const [labModel, setLabModel] = useState(defaultModel);
  const savedResults = useLabResults();
  const [runState, setRunState] = useState<AdvancedLabRunState>({ phase: 'idle', result: null, message: '' });
  const [copied, setCopied] = useState<CopyState>('idle');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [appPromptId, setAppPromptId] = useState(DEFAULT_APP_BUILDER_PRESET_ID);
  const [appCustomPrompt, setAppCustomPrompt] = useState('');
  const [imageRunState, setImageRunState] = useState<AdvancedLabRunState>({ phase: 'idle', result: null, message: '' });
  const [comfyStatus, setComfyStatus] = useState<ComfyStatus | null>(null);
  const [comfyChecking, setComfyChecking] = useState(true);
  const [checkpoint, setCheckpoint] = useState('');
  const [imagePromptId, setImagePromptId] = useState(IMAGE_BENCHMARK_PROMPTS[0].id);
  // Free text for the "write my own" option. Shared by the image and video
  // panels because they have always shared the prompt — video simply never
  // showed which one it was using.
  const [customPrompt, setCustomPrompt] = useState('');
  const usingCustomPrompt = imagePromptId === CUSTOM_IMAGE_PROMPT_ID;
  const customPromptReady = customPrompt.trim().length > 0;
  const [judgeModel, setJudgeModel] = useState('');
  const imageAbortRef = useRef<AbortController | null>(null);
  // Held outside this panel, so a lineup survives leaving the Activity screen.
  const lineup = useVideoLineupSession();

  /** For the Check again button, where setting state synchronously is fine. */
  const checkComfy = useCallback(async () => {
    setComfyChecking(true);
    const status = await getComfyStatus();
    setComfyStatus(status);
    setComfyChecking(false);
  }, []);

  // A start RigMatch made is watched until ComfyUI answers. Look again then,
  // rather than leaving this panel saying it is not running.
  useEffect(() => onComfyStarted(() => { void checkComfy(); }), [checkComfy]);
  const comfyStart = useComfyStart();

  // ComfyUI is a separate program the user starts themselves, so it may not be
  // up when this panel opens. The initial look does not set state on the way in
  // — comfyChecking already starts true — and drops its answer if the panel
  // closed while the probe was in flight.
  useEffect(() => {
    let live = true;
    void (async () => {
      const status = await getComfyStatus();
      if (!live) return;
      setComfyStatus(status);
      setComfyChecking(false);
    })();
    return () => { live = false; };
  }, []);

  // Ask once when the lab opens, before anything is clicked. The benchmark flow
  // has always checked this; the lab never did, so a run started while a game
  // held the GPU hung for four minutes and then blamed the connection.
  const { contention, refresh: refreshContention } = useGpuContention();

  /**
   * Re-check as the run starts, and hand back a sentence for its status line.
   *
   * The panel note is three to five seconds late — nvidia-smi is slow on a
   * loaded card — so clicking Run immediately still showed nothing. This closes
   * that window: the answer lands in the message the user is already watching.
   */
  const gpuNoteForRun = useCallback(async () => gpuBusyNote(await refreshContention()), [refreshContention]);
  useEffect(() => {
    void (async () => { await refreshContention(); })();
  }, [refreshContention]);

  // readinessFrom has already removed video checkpoints: handing an LTX model
  // to a still-image graph fails deep inside the sampler with a shape error no
  // user could act on.
  const readiness = readinessFrom(comfyBridgeAvailable(), comfyStatus);
  const availableCheckpoints = readiness.kind === 'ready' ? readiness.checkpoints : [];
  const activeCheckpoint = availableCheckpoints.includes(checkpoint)
    ? checkpoint
    : (availableCheckpoints[0] ?? '');

  const judges = useMemo(() => judgeCandidates(ollama.models), [ollama.models]);
  // Only models the provider reports as able to hear. Nothing in a name says
  // so, and asking one that cannot returns "Failed to load image or audio
  // file" — which would score the model down for being asked the wrong thing.
  const hearingModels = useMemo(
    () => ollama.models.filter((row) => canHearAudio(row)).map((row) => row.name || row.model).filter(Boolean),
    [ollama.models],
  );
  const activeJudge = judges.includes(judgeModel) ? judgeModel : (judges[0] ?? '');
  const cards = workbench.labCards;
  const shows = (card: LabCardId) => cards.includes(card);
  const gridCards = cards.filter((card) => card !== 'video');
  // Nothing installed can check a picture, so accuracy cannot count here.
  const imageLock = judges.length
    ? null
    : 'No model that can check pictures is available right now, so only speed can be measured. Install one, or start Ollama, and accuracy counts again.';
  const imageStandings = useMemo(
    () => rankLabResults(savedResults, 'images', imageLock ? 0 : balances.images),
    [savedResults, imageLock, balances.images],
  );

  const activeModel = installedModels.includes(labModel) ? labModel : defaultModel;
  const activeModelInfo = ollama.models.find((model) => model.name === activeModel || model.model === activeModel);
  const savedResult = activeModel ? savedResults[activeModel] ?? null : null;
  const visibleResult = runState.result?.model === activeModel ? runState.result : savedResult;
  const previewHtml = useMemo(
    () => (visibleResult && !visibleResult.error ? extractHtmlDocument(visibleResult.response) : null),
    [visibleResult],
  );
  const isRunning = runState.phase === 'running';
  const isLargeModel = (activeModelInfo?.sizeGb ?? 0) >= Math.max(8, system.gpu.vramGb || 0);
  const canRun = ollama.ready && Boolean(activeModel) && !isRunning;
  const imageResultKey = `image:${activeCheckpoint}`;
  const visibleImageResult = imageRunState.result?.model === activeCheckpoint
    ? imageRunState.result
    : savedResults[imageResultKey] ?? null;
  const imageRunning = imageRunState.phase === 'running';
  // Images and the video lineup share one GPU, so neither may start while the
  // other is rendering. "Write my own" with an empty box would render whatever
  // the fallback prompt happens to be and report it as your run, so the button
  // waits for words.
  const promptReady = !usingCustomPrompt || customPromptReady;
  const canRunImageTest = readiness.kind === 'ready' && Boolean(activeCheckpoint)
    && promptReady && !imageRunning && !lineup.running;

  const startChallenge = useCallback(async () => {
    if (!activeModel || !ollama.ready) return;
    setCopied('idle');
    setPreviewOpen(false);
    setRunState({ phase: 'running', result: null, message: `Asking ${activeModel} to build an app...${await gpuNoteForRun()}` });
    const prompt = resolveAppBuilderPrompt(appPromptId, appCustomPrompt);
    const result = await runAdvancedAppBuilderChallenge(activeModel, ollama.baseUrl, prompt);
    setRunState({
      phase: result.error ? 'failed' : 'complete',
      result,
      message: result.error ? result.error : `${activeModel} finished the App Builder challenge.`,
    });
    if (!result.error) {
      // Read-modify-write against live storage, matching App.tsx. Writing a
      // mount-time snapshot back would erase any lab result the skill-test
      // runner saved for another model while this panel was open.
      writeAdvancedLabResults({ ...readAdvancedLabResults(), [activeModel]: result });
      // Pop the finished app straight into the sandbox when it's runnable.
      if (extractHtmlDocument(result.response)) setPreviewOpen(true);
    }
  }, [activeModel, appPromptId, appCustomPrompt, ollama.baseUrl, ollama.ready, gpuNoteForRun]);

  const copyResult = useCallback(() => {
    if (!visibleResult?.response) return;
    void copyText(visibleResult.response).then((ok) => {
      setCopied(ok ? 'copied' : 'failed');
      window.setTimeout(() => setCopied('idle'), 2200);
    });
  }, [visibleResult]);

  const startImageChallenge = useCallback(async () => {
    if (!canRunImageTest) return;
    // Asked before anything is submitted: queuing behind someone else's render
    // produces a time that measures the queue, and a wrong number that looks
    // like a measurement is worse than refusing.
    const busy = await describeComfyBusy();
    if (busy) {
      setImageRunState({ phase: 'failed', result: null, message: busy });
      return;
    }
    const controller = new AbortController();
    imageAbortRef.current = controller;
    setImageRunState({
      phase: 'running',
      result: null,
      message: `Generating ${IMAGE_RUN_SETTINGS.width}x${IMAGE_RUN_SETTINGS.height} with ${activeCheckpoint}...${await gpuNoteForRun()}`,
    });

    let run;
    try {
      run = await runImageLabChallenge({
        checkpoint: activeCheckpoint,
        promptId: imagePromptId,
        customPrompt,
        judgeModel: activeJudge || undefined,
        ollamaBaseUrl: ollama.baseUrl,
        signal: controller.signal,
      });
    } finally {
      imageAbortRef.current = null;
    }
    // With where the fader stood as it started, like every other test.
    const result = { ...toLabResult(run, imagePromptId, customPrompt), balance: imageLock ? 0 : balances.images };

    setImageRunState({
      phase: result.error ? 'failed' : 'complete',
      result,
      // An unjudged run is a real result with a missing part, so it says so
      // rather than presenting the score as if adherence had been measured.
      message: result.error
        ? result.error
        : `${activeCheckpoint} drew it in ${(run.elapsedMs / 1000).toFixed(1)}s${
          run.judged
            ? `, and ${activeJudge} confirmed ${Math.round((run.adherence ?? 0) * 100)}% of the prompt.`
            : '. No vision model was available to check the picture, so this run is unjudged.'
        }`,
    });

    if (!result.error) {
      writeAdvancedLabResults({ ...readAdvancedLabResults(), [imageResultKey]: result });
    }
  }, [activeCheckpoint, activeJudge, balances.images, canRunImageTest, customPrompt, imageLock, imagePromptId, imageResultKey, ollama.baseUrl, gpuNoteForRun]);

  const stopImageRun = useCallback(() => {
    imageAbortRef.current?.abort();
  }, []);

  return (
    <section className="advanced-lab" aria-label="Advanced capability lab">
      <GpuContentionNote contention={contention} />
      <div className="advanced-lab-head">
        <div>
          <span>{workbench.id === 'all' ? 'Advanced Lab' : `Advanced Lab · ${workbench.label}`}</span>
          <strong>Optional skill tests beyond quick questions</strong>
          <em>Separate Lab Grades. They do not affect the core RigMatch score.</em>
        </div>
        {shows('app-builder') && (
        <div className="advanced-lab-model">
          <label htmlFor="advanced-lab-model">Installed model</label>
          <select
            id="advanced-lab-model"
            value={activeModel}
            onChange={(event) => setLabModel(event.target.value)}
            disabled={!installedModels.length || isRunning}
          >
            {installedModels.length ? installedModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            )) : (
              <option value="">No installed models</option>
            )}
          </select>
        </div>
        )}
      </div>

      {gridCards.length > 0 && (
      <div className="advanced-lab-grid">
        {shows('app-builder') && (
        <article className="advanced-lab-card runnable">
          <div className="advanced-lab-card-head">
            <Code2 aria-hidden="true" />
            <div>
              <span>Text model challenge</span>
              <strong>App Builder</strong>
            </div>
            {visibleResult && (
              <b className={`advanced-lab-grade ${getScoreTone(visibleResult.score)}`}>
                {visibleResult.score} · {visibleResult.grade}
              </b>
            )}
          </div>
          <p>
            Asks the model to write a complete single-file HTML app, grades the result, then pops it into a sandbox to run.
          </p>
          <div className="advanced-lab-image-controls">
            <label htmlFor="advanced-app-prompt">App to build</label>
            <select
              id="advanced-app-prompt"
              value={appPromptId}
              onChange={(event) => setAppPromptId(event.target.value)}
              disabled={isRunning}
            >
              {APP_BUILDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
              <option value="custom">Custom prompt…</option>
            </select>
          </div>
          {appPromptId === 'custom' && (
            <input
              type="text"
              className="run-skill-image-prompt"
              value={appCustomPrompt}
              onChange={(event) => setAppCustomPrompt(event.target.value)}
              placeholder="Describe the app to build (e.g. a memory card game)"
              aria-label="Custom app prompt"
              disabled={isRunning}
            />
          )}
          <div className="advanced-lab-safeguards">
            <span>No auto-downloads</span>
            <span>3 minute timeout</span>
            <span>{activeModelInfo?.sizeGb ? `${formatGb(activeModelInfo.sizeGb)} installed` : 'Installed models only'}</span>
          </div>
          {isLargeModel && (
            <div className="advanced-lab-warning">
              <AlertTriangle aria-hidden="true" />
              <span>This is a heavier prompt for your current VRAM. It may run slowly, but RigMatch will not pull anything new.</span>
            </div>
          )}
          <div className="advanced-lab-actions">
            <button type="button" className="primary-button compact" onClick={() => void startChallenge()} disabled={!canRun}>
              <RefreshCw className={isRunning ? 'spin' : ''} aria-hidden="true" />
              {isRunning ? 'Running Lab Test' : 'Run App Builder'}
            </button>
            <button
              type="button"
              className="mini-button outline"
              onClick={copyResult}
              disabled={!visibleResult?.response}
              title={visibleResult?.response ? 'Copy the answer' : 'Run a test first — there is no output to copy'}
            >
              {copied === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied === 'copied' ? 'Copied' : 'Copy Output'}
            </button>
            <button
              type="button"
              className="mini-button outline"
              onClick={() => setPreviewOpen(true)}
              disabled={!previewHtml}
              title={previewHtml
                ? 'Run the generated game in an isolated sandbox with network and file access blocked.'
                : 'Run the App Builder first — the preview unlocks when the answer contains a runnable single-file app.'}
            >
              <Play aria-hidden="true" />
              Play It
            </button>
          </div>
          {visibleResult && !visibleResult.error && !previewHtml && (
            <p className="advanced-lab-message failed">
              This answer did not contain a runnable single-file app, so the sandboxed preview stays locked.
            </p>
          )}
          {!ollama.ready && (
            <div className="utility-empty compact">
              <strong>Ollama is offline</strong>
              <span>Start Ollama before running advanced local tests.</span>
            </div>
          )}
          {runState.message && (
            <p className={`advanced-lab-message ${runState.phase}`}>{runState.message}</p>
          )}
          {visibleResult && (
            <div className="advanced-lab-result">
              <div className="advanced-lab-result-head">
                <span>{visibleResult.error ? 'Run failed' : `Completed in ${(visibleResult.elapsedMs / 1000).toFixed(1)}s`}</span>
                <strong>{visibleResult.model}</strong>
              </div>
              {visibleResult.error ? (
                <div className="utility-empty compact">
                  <strong>{visibleResult.error}</strong>
                  <span>No Lab Grade was saved for this run.</span>
                </div>
              ) : (
                <>
                  <div className="advanced-lab-checks">
                    {visibleResult.checks.map((check) => (
                      <div key={check.label} className={check.passed ? 'passed' : 'failed'} title={check.detail}>
                        <span>{check.passed ? 'Pass' : 'Miss'}</span>
                        <strong>{check.label}</strong>
                      </div>
                    ))}
                  </div>
                  <pre className="advanced-lab-output">{visibleResult.response || 'No response returned.'}</pre>
                </>
              )}
            </div>
          )}
        </article>
        )}

        {shows('image') && (
        <article className="advanced-lab-card image-beta">
          <div className="advanced-lab-card-head">
            <Lightbulb aria-hidden="true" />
            <div>
              <span>Extra beta creative test</span>
              <strong>Image Generation</strong>
            </div>
            <b className={visibleImageResult ? `advanced-lab-grade ${getScoreTone(visibleImageResult.score)}` : 'advanced-lab-grade locked'}>
              {visibleImageResult ? `${visibleImageResult.score} · ${visibleImageResult.grade}` : 'Extra beta'}
            </b>
          </div>
          <p>
            Image generation runs on ComfyUI, not Ollama — Ollama hosts no image models and its
            runtime refuses the ones that exist. This is intentionally separate from the core Match score.
          </p>

          {readiness.kind !== 'ready' ? (
            <div className="utility-empty compact">
              {readiness.kind === 'no-bridge' ? (
                <>
                  <strong>Image generation needs the desktop app</strong>
                  <span>This build has no bridge to ComfyUI, so pictures cannot be generated here.</span>
                </>
              ) : readiness.kind === 'no-checkpoints' ? (
                <>
                  <strong>ComfyUI is running, but has no image model</strong>
                  <span>
                    Put an image checkpoint (a <code>.safetensors</code> file) in ComfyUI&apos;s
                    <code> models/checkpoints</code> folder and check again. A video model on its
                    own does not count — it cannot render a still.
                  </span>
                </>
              ) : (
                <>
                  <strong>
                    {comfyChecking ? 'Looking for ComfyUI...' : comfyStart.phase === 'starting' ? 'Starting ComfyUI…' : 'ComfyUI is not running'}
                  </strong>
                  <span>
                    Start ComfyUI and it will be found on port 8188. It is a separate free program —
                    RigMatch does not install or bundle it, but it can start the copy you have.
                  </span>
                </>
              )}
              <div className="advanced-lab-actions">
                <button type="button" className="mini-button outline" onClick={() => void checkComfy()} disabled={comfyChecking}>
                  <RefreshCw className={comfyChecking ? 'spin' : ''} aria-hidden="true" />
                  Check again
                </button>
                {readiness.kind === 'not-running' && <ComfyStartButton folder={readComfySettings().folder} />}
              </div>
            </div>
          ) : (
            <>
              <div className="advanced-lab-image-controls">
                <label htmlFor="advanced-image-checkpoint">Checkpoint</label>
                <select
                  id="advanced-image-checkpoint"
                  value={activeCheckpoint}
                  onChange={(event) => setCheckpoint(event.target.value)}
                  disabled={imageRunning}
                >
                  {availableCheckpoints.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <PromptPicker
                idPrefix="advanced-image"
                value={imagePromptId}
                onChange={setImagePromptId}
                customPrompt={customPrompt}
                onCustomPromptChange={setCustomPrompt}
                disabled={imageRunning}
              />
              <div className="advanced-lab-image-controls">
                <label htmlFor="advanced-image-judge">Checked by</label>
                <select
                  id="advanced-image-judge"
                  value={activeJudge}
                  onChange={(event) => setJudgeModel(event.target.value)}
                  disabled={imageRunning || !judges.length}
                >
                  {judges.length ? (
                    judges.map((name) => <option key={name} value={name}>{name}</option>)
                  ) : (
                    <option value="">No vision model installed</option>
                  )}
                </select>
              </div>
              <div className="advanced-lab-safeguards">
                <span>{IMAGE_RUN_SETTINGS.width}x{IMAGE_RUN_SETTINGS.height}</span>
                {/* The real number for this checkpoint, not a fixed 20 — a
                    distilled model is run at its own step count, and the row
                    would otherwise state a setting the run does not use. */}
                <span title={samplingProfileFor(activeCheckpoint).reason}>
                  {samplingProfileFor(activeCheckpoint).steps} steps
                </span>
                <span>fixed seed</span>
                <span>{judges.length ? 'adherence judged' : 'unjudged'}</span>
              </div>
              {!judges.length && (
                <div className="advanced-lab-warning">
                  <AlertTriangle aria-hidden="true" />
                  <span>
                    No vision model is installed, so nothing can check whether the picture matches the
                    prompt. The run still measures speed and fit, and is reported unjudged rather than
                    scored as if the picture were wrong.
                  </span>
                </div>
              )}
              <BalanceFader
                value={balances.images}
                onChange={(value) => onBalanceChange('images', value)}
                accuracyMeans={IMAGE_ACCURACY}
                lockedReason={imageLock}
              />
              <div className="advanced-lab-actions">
                <button type="button" className="primary-button compact" onClick={() => void startImageChallenge().catch((error: unknown) => {
                  // Without this a throw before the run's own try — requireBridge,
                  // say — left phase:'running' forever: a permanent spinner and an
                  // unhandled rejection, with nothing on screen to explain it.
                  setImageRunState({ phase: 'failed', result: null, message: getErrorMessage(error) });
                })} disabled={!canRunImageTest}>
                  <RefreshCw className={imageRunning ? 'spin' : ''} aria-hidden="true" />
                  {imageRunning ? 'Generating' : 'Run Image Test'}
                </button>
                {imageRunning && (
                  <button type="button" className="mini-button outline" onClick={stopImageRun}>
                    Stop
                  </button>
                )}
              </div>
            </>
          )}
          {imageRunState.message && (
            <p className={`advanced-lab-message ${imageRunState.phase}`}>{imageRunState.message}</p>
          )}
          {visibleImageResult && (
            <div className="advanced-lab-result">
              {visibleImageResult.error ? (
                <div className="utility-empty compact">
                  <strong>{visibleImageResult.error}</strong>
                  <span>Image Lab could not save a grade for this run.</span>
                </div>
              ) : (
                <>
                  {visibleImageResult.imageDataUrl ? (
                    <img
                      className="advanced-lab-generated-image"
                      src={visibleImageResult.imageDataUrl}
                      alt="Generated Image Lab output"
                    />
                  ) : (
                    <div className="utility-empty compact">
                      <strong>No image returned</strong>
                      <span>Ollama completed, but RigMatch did not receive an image payload.</span>
                    </div>
                  )}
                  <div className="advanced-lab-checks">
                    {visibleImageResult.checks.map((check) => (
                      <div key={check.label} className={check.passed ? 'passed' : 'failed'} title={check.detail}>
                        <span>{check.passed ? 'Pass' : 'Miss'}</span>
                        <strong>{check.label}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {imageStandings.length > 1 && (
            <LabStandings
              ranked={imageStandings}
              balance={imageLock ? 0 : balances.images}
              heading="Every image test on this PC"
              describeAccuracy={(accuracy) => describeLabAccuracy('images', accuracy)}
            />
          )}
        </article>
        )}

        {shows('listening') && (
          <ListeningLab
            ollama={ollama}
            models={hearingModels}
            gpuNoteForRun={gpuNoteForRun}
            balance={balances.listening}
            onBalanceChange={(value) => onBalanceChange('listening', value)}
          />
        )}
      </div>
      )}

      {/* A channel tested somewhere else says where, rather than showing an
          empty Lab or someone else's cards. */}
      {cards.length === 0 && (
        <article className="advanced-lab-card lab-channel-note">
          <div className="advanced-lab-card-head">
            <Lightbulb aria-hidden="true" />
            <div>
              <span>{workbench.label}</span>
              <strong>Tested in Comparison</strong>
            </div>
          </div>
          <p>{workbench.labNote}</p>
          {onOpenComparison && (
            <div className="advanced-lab-actions">
              <button type="button" className="primary-button compact" onClick={onOpenComparison}>
                Open Comparison
              </button>
            </div>
          )}
        </article>
      )}

      {/* Full width: eighteen models with five facts each do not fit half a
          grid, and the leaderboard and the clips side by side want the room. */}
      {shows('video') && (
      <VideoLineupLab
        comfyStatus={comfyStatus}
        comfyChecking={comfyChecking}
        onCheckComfy={() => void checkComfy()}
        system={system}
        judgeModel={activeJudge}
        promptId={imagePromptId}
        onPromptIdChange={setImagePromptId}
        customPrompt={customPrompt}
        onCustomPromptChange={setCustomPrompt}
        otherRunActive={imageRunning}
        ollamaBaseUrl={ollama.baseUrl}
        gpuNoteForRun={gpuNoteForRun}
        onDownloadModel={onDownloadVideoModel}
        onStopDownload={onStopVideoDownload}
        pullProgressByModel={pullProgressByModel}
        balance={balances.video}
        onBalanceChange={(value) => onBalanceChange('video', value)}
      />
      )}
      {previewOpen && previewHtml && visibleResult && (
        <AppBuilderPreviewModal
          html={previewHtml}
          model={visibleResult.model}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </section>
  );
}
