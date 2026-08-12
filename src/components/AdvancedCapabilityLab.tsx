import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Code2, Copy, Film, Lightbulb, Play, RefreshCw } from "lucide-react";
import type { ComfyStatus, OllamaStatus, SystemProfile } from "../types";
import { formatGb, getScoreTone } from "../lib/format";
import { extractHtmlDocument } from "../lib/labPreview";
import { readAdvancedLabResults, writeAdvancedLabResults, type AdvancedLabResult } from "../lib/labResults";
import {
  APP_BUILDER_PRESETS,
  DEFAULT_APP_BUILDER_PRESET_ID,
  resolveAppBuilderPrompt,
  runAdvancedAppBuilderChallenge,
} from "../lib/labChallenges";
import { IMAGE_BENCHMARK_PROMPTS } from "../lib/imageGenScoring";
import { IMAGE_RUN_SETTINGS, judgeCandidates, toLabResult } from "../lib/imageGenChallenge";
import { runImageLabChallenge } from "../lib/imageGenRunner";
import { comfyBridgeAvailable, getComfyStatus } from "../lib/comfyTransport";
import { AppBuilderPreviewModal } from "./AppBuilderPreview";

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
  if (!status.checkpoints.length) return { kind: 'no-checkpoints' };
  return { kind: 'ready', checkpoints: status.checkpoints };
}

export function AdvancedCapabilityLab({
  selectedModel,
  ollama,
  system,
}: {
  selectedModel: string;
  ollama: OllamaStatus;
  system: SystemProfile;
}) {
  const installedModels = useMemo(
    () => ollama.models.map((model) => model.name || model.model).filter(Boolean),
    [ollama.models],
  );
  const defaultModel = installedModels.includes(selectedModel) ? selectedModel : (installedModels[0] ?? '');
  const [labModel, setLabModel] = useState(defaultModel);
  const [savedResults, setSavedResults] = useState<Record<string, AdvancedLabResult>>(() => readAdvancedLabResults());
  const [runState, setRunState] = useState<AdvancedLabRunState>({ phase: 'idle', result: null, message: '' });
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [appPromptId, setAppPromptId] = useState(DEFAULT_APP_BUILDER_PRESET_ID);
  const [appCustomPrompt, setAppCustomPrompt] = useState('');
  const [imageRunState, setImageRunState] = useState<AdvancedLabRunState>({ phase: 'idle', result: null, message: '' });
  const [comfyStatus, setComfyStatus] = useState<ComfyStatus | null>(null);
  const [comfyChecking, setComfyChecking] = useState(true);
  const [checkpoint, setCheckpoint] = useState('');
  const [imagePromptId, setImagePromptId] = useState(IMAGE_BENCHMARK_PROMPTS[0].id);
  const [judgeModel, setJudgeModel] = useState('');
  const imageAbortRef = useRef<AbortController | null>(null);

  /** For the Check again button, where setting state synchronously is fine. */
  const checkComfy = useCallback(async () => {
    setComfyChecking(true);
    const status = await getComfyStatus();
    setComfyStatus(status);
    setComfyChecking(false);
  }, []);

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

  const readiness = readinessFrom(comfyBridgeAvailable(), comfyStatus);
  const availableCheckpoints = readiness.kind === 'ready' ? readiness.checkpoints : [];
  const activeCheckpoint = availableCheckpoints.includes(checkpoint)
    ? checkpoint
    : (availableCheckpoints[0] ?? '');

  const judges = useMemo(() => judgeCandidates(ollama.models), [ollama.models]);
  const activeJudge = judges.includes(judgeModel) ? judgeModel : (judges[0] ?? '');

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
  const canRunImageTest = readiness.kind === 'ready' && Boolean(activeCheckpoint) && !imageRunning;

  const startChallenge = useCallback(async () => {
    if (!activeModel || !ollama.ready) return;
    setCopied(false);
    setPreviewOpen(false);
    setRunState({ phase: 'running', result: null, message: `Asking ${activeModel} to build an app...` });
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
      const merged = { ...readAdvancedLabResults(), [activeModel]: result };
      writeAdvancedLabResults(merged);
      setSavedResults(merged);
      // Pop the finished app straight into the sandbox when it's runnable.
      if (extractHtmlDocument(result.response)) setPreviewOpen(true);
    }
  }, [activeModel, appPromptId, appCustomPrompt, ollama.baseUrl, ollama.ready]);

  const copyResult = useCallback(() => {
    if (!visibleResult?.response) return;
    void navigator.clipboard?.writeText(visibleResult.response).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }).catch(() => undefined);
  }, [visibleResult]);

  const startImageChallenge = useCallback(async () => {
    if (!canRunImageTest) return;
    const controller = new AbortController();
    imageAbortRef.current = controller;
    setImageRunState({
      phase: 'running',
      result: null,
      message: `Generating ${IMAGE_RUN_SETTINGS.width}x${IMAGE_RUN_SETTINGS.height} with ${activeCheckpoint}...`,
    });

    let run;
    try {
      run = await runImageLabChallenge({
        checkpoint: activeCheckpoint,
        promptId: imagePromptId,
        judgeModel: activeJudge || undefined,
        ollamaBaseUrl: ollama.baseUrl,
        signal: controller.signal,
      });
    } finally {
      imageAbortRef.current = null;
    }
    const result = toLabResult(run, imagePromptId);

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
      const merged = { ...readAdvancedLabResults(), [imageResultKey]: result };
      writeAdvancedLabResults(merged);
      setSavedResults(merged);
    }
  }, [activeCheckpoint, activeJudge, canRunImageTest, imagePromptId, imageResultKey, ollama.baseUrl]);

  const stopImageRun = useCallback(() => {
    imageAbortRef.current?.abort();
  }, []);

  return (
    <section className="advanced-lab" aria-label="Advanced capability lab">
      <div className="advanced-lab-head">
        <div>
          <span>Advanced Lab</span>
          <strong>Optional skill tests beyond quick questions</strong>
          <em>Separate Lab Grades. They do not affect the core RigMatch score.</em>
        </div>
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
      </div>

      <div className="advanced-lab-grid">
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
            <button type="button" className="mini-button outline" onClick={copyResult} disabled={!visibleResult?.response}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy Output'}
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
                  <strong>ComfyUI is running, but has no models</strong>
                  <span>
                    Put a checkpoint (a <code>.safetensors</code> file) in ComfyUI&apos;s
                    <code> models/checkpoints</code> folder and check again.
                  </span>
                </>
              ) : (
                <>
                  <strong>{comfyChecking ? 'Looking for ComfyUI...' : 'ComfyUI is not running'}</strong>
                  <span>
                    Start ComfyUI and it will be found on port 8188. It is a separate free program —
                    RigMatch does not install or bundle it.
                  </span>
                </>
              )}
              <button type="button" className="mini-button outline" onClick={() => void checkComfy()} disabled={comfyChecking}>
                <RefreshCw className={comfyChecking ? 'spin' : ''} aria-hidden="true" />
                Check again
              </button>
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
              <div className="advanced-lab-image-controls">
                <label htmlFor="advanced-image-prompt">Prompt</label>
                <select
                  id="advanced-image-prompt"
                  value={imagePromptId}
                  onChange={(event) => setImagePromptId(event.target.value)}
                  disabled={imageRunning}
                >
                  {IMAGE_BENCHMARK_PROMPTS.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>{prompt.prompt}</option>
                  ))}
                </select>
              </div>
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
                <span>{IMAGE_RUN_SETTINGS.steps} steps</span>
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
              <div className="advanced-lab-actions">
                <button type="button" className="primary-button compact" onClick={() => void startImageChallenge()} disabled={!canRunImageTest}>
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
        </article>

        <article className="advanced-lab-card video-locked">
          <div className="advanced-lab-card-head">
            <Film aria-hidden="true" />
            <div>
              <span>Research preview</span>
              <strong>Video Generation</strong>
            </div>
            <b className="advanced-lab-grade locked">Locked</b>
          </div>
          <p>
            No local backend RigMatch supports can generate video yet — Ollama has no video models today, so there
            is honestly nothing to test. This card unlocks when that changes instead of pretending.
          </p>
          <div className="advanced-lab-checks">
            <div className="failed" title="Ollama and LM Studio expose no video-generation endpoint today.">
              <span>Miss</span>
              <strong>Local video backend available</strong>
            </div>
            <div
              className={(system.gpu.vramGb || 0) >= 16 ? 'passed' : 'failed'}
              title={`Early local video models are expected to want roughly 16 GB+ of VRAM. This computer reports ${system.gpu.vramGb || 0} GB.`}
            >
              <span>{(system.gpu.vramGb || 0) >= 16 ? 'Pass' : 'Miss'}</span>
              <strong>VRAM headroom (~16 GB+)</strong>
            </div>
          </div>
          <div className="advanced-lab-safeguards">
            <span>No auto-downloads</span>
            <span>Separate Lab Grade</span>
            <span>Backend + size warnings first</span>
          </div>
        </article>
      </div>
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
