import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Code2, Copy, Download, Film, Lightbulb, Play, RefreshCw, ShieldCheck } from "lucide-react";
import type { OllamaStatus, SystemProfile } from "../types";
import { agentArcadeApi } from "../api";
import { formatGb, getScoreTone } from "../lib/format";
import { extractHtmlDocument } from "../lib/labPreview";
import { isLikelyImageGenerationModel } from "../lib/modelCatalog";
import { readAdvancedLabResults, writeAdvancedLabResults, type AdvancedLabResult } from "../lib/labResults";
import {
  APP_BUILDER_PRESETS,
  DEFAULT_APP_BUILDER_PRESET_ID,
  resolveAppBuilderPrompt,
  ADVANCED_IMAGE_GENERATION_PROMPT,
  ADVANCED_IMAGE_WIDTH,
  ADVANCED_IMAGE_HEIGHT,
  ADVANCED_IMAGE_STEPS,
  IMAGE_GENERATION_MODEL_OPTIONS,
  imageModelMatches,
  getInstalledImageModelName,
  runAdvancedAppBuilderChallenge,
  runAdvancedImageGenerationChallenge,
  type ImageGenerationModelOption,
} from "../lib/labChallenges";
import { AppBuilderPreviewModal } from "./AppBuilderPreview";

type AdvancedLabRunState = {
  phase: 'idle' | 'running' | 'complete' | 'failed';
  result: AdvancedLabResult | null;
  message: string;
};

async function pullOllamaModelWithProgress(
  model: string,
  baseUrl: string,
  onProgress: (message: string, percent: number | null) => void,
  signal: AbortSignal,
) {
  const progressId = `advanced-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (signal.aborted) throw new DOMException('Image model pull cancelled.', 'AbortError');
  const unsubscribe = agentArcadeApi.onPullProgress?.((update) => {
    if (update.id !== progressId) return;
    onProgress(update.status || 'Downloading image model...', update.percent);
  });
  const abortPull = () => void agentArcadeApi.abortPull(progressId);

  try {
    signal.addEventListener('abort', abortPull, { once: true });
    await agentArcadeApi.pullModel({ model, baseUrl, progressId });
  } finally {
    signal.removeEventListener('abort', abortPull);
    unsubscribe?.();
  }
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
  const [imageModel, setImageModel] = useState(IMAGE_GENERATION_MODEL_OPTIONS[0].model);
  const [imageConsent, setImageConsent] = useState(false);
  const [imageTryAnyway, setImageTryAnyway] = useState(false);
  const [imageRunState, setImageRunState] = useState<AdvancedLabRunState>({ phase: 'idle', result: null, message: '' });
  const [pulledImageModels, setPulledImageModels] = useState<Set<string>>(() => new Set());
  const [imagePullState, setImagePullState] = useState<{
    phase: 'idle' | 'pulling' | 'complete' | 'failed';
    percent: number | null;
    message: string;
  }>({ phase: 'idle', percent: null, message: '' });
  const imagePullAbortRef = useRef<AbortController | null>(null);

  const imageModelOptions = useMemo<ImageGenerationModelOption[]>(() => {
    const detected = ollama.models
      .filter((model) => isLikelyImageGenerationModel(model.name || model.model || ''))
      .filter((model) => !IMAGE_GENERATION_MODEL_OPTIONS.some((option) => imageModelMatches(model.name || model.model || '', option.model)))
      .map((model) => ({
        model: model.name || model.model || '',
        label: `${model.name || model.model} · installed`,
        sizeGb: model.sizeGb ?? 0,
        license: 'Already in your library',
        note: 'Detected in your local Ollama library — no new download needed.',
      }));
    return [...IMAGE_GENERATION_MODEL_OPTIONS, ...detected];
  }, [ollama.models]);

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
  const imageOption = imageModelOptions.find((option) => option.model === imageModel) ?? imageModelOptions[0];
  const installedImageModel = getInstalledImageModelName(installedModels, imageOption.model);
  const pulledImageModel = pulledImageModels.has(imageOption.model) ? imageOption.model : '';
  const activeImageModel = installedImageModel || pulledImageModel || imageOption.model;
  const imageResultKey = `image:${activeImageModel}`;
  const visibleImageResult = imageRunState.result?.model === activeImageModel ? imageRunState.result : savedResults[imageResultKey] ?? null;
  const imagePlatformSupported = system.platform === 'darwin';
  const imagePlatformAllowed = imagePlatformSupported || imageTryAnyway;
  const imageInstalled = Boolean(installedImageModel || pulledImageModel);
  const imagePulling = imagePullState.phase === 'pulling';
  const imageRunning = imageRunState.phase === 'running';
  const canPullImageModel = ollama.ready && imagePlatformAllowed && imageConsent && !imageInstalled && !imagePulling && !imageRunning;
  const canRunImageTest = ollama.ready && imagePlatformAllowed && imageInstalled && !imagePulling && !imageRunning;

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

  const startImagePull = useCallback(async () => {
    if (!canPullImageModel) return;
    const controller = new AbortController();
    imagePullAbortRef.current = controller;
    setImagePullState({ phase: 'pulling', percent: null, message: `Pulling ${imageOption.label} (${formatGb(imageOption.sizeGb)})...` });
    try {
      await pullOllamaModelWithProgress(
        imageOption.model,
        ollama.baseUrl,
        (message, percent) => setImagePullState({ phase: 'pulling', percent, message }),
        controller.signal,
      );
      setPulledImageModels((current) => {
        const next = new Set(current);
        next.add(imageOption.model);
        return next;
      });
      setImagePullState({ phase: 'complete', percent: 100, message: `${imageOption.label} is ready for the Image Lab.` });
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'Image model pull cancelled.'
        : error instanceof Error ? error.message : 'Image model pull failed.';
      setImagePullState({ phase: 'failed', percent: null, message });
    } finally {
      imagePullAbortRef.current = null;
    }
  }, [canPullImageModel, imageOption, ollama.baseUrl]);

  const cancelImagePull = useCallback(() => {
    imagePullAbortRef.current?.abort();
  }, []);

  const startImageChallenge = useCallback(async () => {
    if (!canRunImageTest) return;
    setImageRunState({ phase: 'running', result: null, message: `Generating a ${ADVANCED_IMAGE_WIDTH}x${ADVANCED_IMAGE_HEIGHT} beta image with ${activeImageModel}...` });
    const result = await runAdvancedImageGenerationChallenge(activeImageModel, ollama.baseUrl);
    setImageRunState({
      phase: result.error ? 'failed' : 'complete',
      result,
      message: result.error ? result.error : `${activeImageModel} generated an image in ${(result.elapsedMs / 1000).toFixed(1)}s.`,
    });
    if (!result.error) {
      const merged = { ...readAdvancedLabResults(), [imageResultKey]: result };
      writeAdvancedLabResults(merged);
      setSavedResults(merged);
    }
  }, [activeImageModel, canRunImageTest, imageResultKey, ollama.baseUrl]);

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
            Runs an experimental Ollama image model through the same local API. This is intentionally separate from the core Match score.
          </p>
          <div className="advanced-lab-image-controls">
            <label htmlFor="advanced-image-model">Image model</label>
            <select
              id="advanced-image-model"
              value={imageOption.model}
              onChange={(event) => {
                setImageModel(event.target.value);
                setImageConsent(false);
              }}
              disabled={imagePulling || imageRunning}
            >
              {imageModelOptions.map((option) => (
                <option key={option.model} value={option.model}>
                  {option.label} · {formatGb(option.sizeGb)}
                </option>
              ))}
            </select>
          </div>
          <div className="advanced-lab-safeguards">
            <span>{formatGb(imageOption.sizeGb)} pull</span>
            <span>{ADVANCED_IMAGE_WIDTH}x{ADVANCED_IMAGE_HEIGHT}</span>
            <span>{ADVANCED_IMAGE_STEPS} steps</span>
            <span>{imageOption.license}</span>
          </div>
          <div className="advanced-lab-image-preview">
            <span>Prompt</span>
            <strong>{ADVANCED_IMAGE_GENERATION_PROMPT}</strong>
            <em>{imageOption.note}</em>
          </div>
          <div className="advanced-lab-warning">
            <ShieldCheck aria-hidden="true" />
            <span>Extra beta safeguard: RigMatch will not auto-pull this. You must explicitly accept the size/platform warning before downloading.</span>
          </div>
          {!imagePlatformSupported && (
            <label className="advanced-lab-consent warning">
              <input
                type="checkbox"
                checked={imageTryAnyway}
                onChange={(event) => setImageTryAnyway(event.target.checked)}
                disabled={imagePulling || imageRunning}
              />
              <span>Ollama currently labels image generation as macOS-only. Let me try anyway on this platform.</span>
            </label>
          )}
          {!imageInstalled && (
            <label className="advanced-lab-consent">
              <input
                type="checkbox"
                checked={imageConsent}
                onChange={(event) => setImageConsent(event.target.checked)}
                disabled={!imagePlatformAllowed || imagePulling || imageRunning}
              />
              <span>I understand this may download about {formatGb(imageOption.sizeGb)} and may be slow or unsupported.</span>
            </label>
          )}
          <div className="advanced-lab-actions">
            {!imageInstalled ? (
              <button type="button" className="primary-button compact" onClick={() => void startImagePull()} disabled={!canPullImageModel}>
                <Download aria-hidden="true" />
                {imagePulling ? 'Downloading' : `Pull ${imageOption.label}`}
              </button>
            ) : (
              <button type="button" className="primary-button compact" onClick={() => void startImageChallenge()} disabled={!canRunImageTest}>
                <RefreshCw className={imageRunning ? 'spin' : ''} aria-hidden="true" />
                {imageRunning ? 'Generating' : 'Run Image Test'}
              </button>
            )}
            {imagePulling && (
              <button type="button" className="mini-button outline" onClick={cancelImagePull}>
                Stop Pull
              </button>
            )}
          </div>
          {imagePullState.message && (
            <div className={`advanced-lab-download ${imagePullState.phase}`}>
              <span>{imagePullState.message}</span>
              <div className="popularity-track" aria-hidden="true">
                <i style={{ width: `${imagePullState.percent ?? 12}%` }} />
              </div>
            </div>
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
