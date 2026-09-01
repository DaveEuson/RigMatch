// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion, BenchmarkQuestionCount } from '../benchmarkSuite';
import { BENCHMARK_PRESETS, DEFAULT_BENCHMARK_QUESTIONS, buildBenchmarkPromptPlan } from '../benchmarkSuite';
import { CLOUD_JUDGE_PRESETS } from '../lib/appConfig';
import { CODE_LANGUAGES, CODE_TASK_PRESETS } from '../lib/codeChallenge';
import { IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';
import { APP_BUILDER_PRESETS, VISION_TEST_IMAGES } from '../lib/labChallenges';
import { GpuContentionNote } from './GpuContentionNote';
import { getCudaDetail, getCudaSummary, isCloudModel, isEmbeddingModel, isLikelyImageGenerationModel, isVisionModel } from '../lib/modelCatalog';
import { formatDuration } from '../lib/runEstimates';
import { useDialog } from '../lib/useDialog';
import { isVideoCheckpoint } from '../lib/videoGen';
import { VIDEO_SIZE_PRESETS } from '../lib/videoGenChallenge';
import type { GpuContention, PendingRunMode, SkillTestSelection, SystemProfile } from '../types';
import { Activity, AlertTriangle, Download, ImagePlus, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import { useRef, useState } from 'react';

export function RunWarningModal({
  mode,
  selectedModel,
  shortlistedCount,
  uninstalledContestantCount,
  questionCount,
  benchmarkQuestions,
  system,
  onCancel,
  onConfirm,
  onDownloadMissing,
  onChangeQuestionCount,
  onLoadPreset,
  autoJudgeModel,
  goalPresetId,
  goalDesire,
  onEditQuestions,
  lineupModels,
  skillSelection,
  onSkillSelectionChange,
  listenCapable,
  qualityMode,
  judgeModel,
  judgeModelOptions,
  onChangeQualityMode,
  onChangeJudgeModel,
  judgeSource,
  onChangeJudgeSource,
  cloudJudgeModel,
  onChangeCloudJudgeModel,
  openRouterKey,
  onChangeOpenRouterKey,
  judgeActive,
  gpuContention,
  measuredPerModelMs,
  comfyCheckpoints,
  comfyTextEncoders,
}: {
  mode: PendingRunMode;
  selectedModel: string;
  shortlistedCount: number;
  uninstalledContestantCount: number;
  questionCount: BenchmarkQuestionCount;
  benchmarkQuestions: BenchmarkQuestion[];
  system: SystemProfile;
  onCancel: () => void;
  onConfirm: () => void;
  onDownloadMissing?: () => void;
  onChangeQuestionCount: (count: BenchmarkQuestionCount) => void;
  onLoadPreset?: (questions: BenchmarkQuestion[]) => void;
  /** A local model that will mark the prose questions, when judging is off. */
  autoJudgeModel?: string;
  /** The preset that measures the user's main goal, when one does. */
  goalPresetId?: string;
  /** That goal in the user's own words, for the copy. */
  goalDesire?: string;
  onEditQuestions?: () => void;
  lineupModels: string[];
  skillSelection: SkillTestSelection;
  onSkillSelectionChange: (selection: SkillTestSelection) => void;
  /** Whether any model in this run reports the audio capability. Computed
      where the rows are, since the dialog only receives model names. */
  listenCapable: boolean;
  /** Checkpoints ComfyUI has loaded. Image generation is the one skill that
      does not run on a model from the lineup, so it is offered on the strength
      of this rather than on what was picked. */
  comfyCheckpoints: string[];
  /** T5 encoders ComfyUI has. A video model cannot render without one. */
  comfyTextEncoders: string[];
  qualityMode: 'heuristic' | 'judge';
  judgeModel: string;
  judgeModelOptions: string[];
  onChangeQualityMode: (mode: 'heuristic' | 'judge') => void;
  onChangeJudgeModel: (model: string) => void;
  judgeSource: 'local' | 'openrouter';
  onChangeJudgeSource: (source: 'local' | 'openrouter') => void;
  cloudJudgeModel: string;
  onChangeCloudJudgeModel: (model: string) => void;
  openRouterKey: string;
  onChangeOpenRouterKey: (key: string) => void;
  judgeActive: boolean;
  /** Measured when this modal opened; null while the probe is still running. */
  gpuContention: GpuContention | null;
  /**
   * Per-model duration from this rig's own run history, when it has one.
   * Null means no history yet — the static rule-of-thumb table applies.
   */
  measuredPerModelMs?: number | null;
}) {
  const runWarnRef = useDialog<HTMLElement>(onCancel);
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const recognizeUploadRef = useRef<HTMLInputElement>(null);
  // Questions the rules cannot mark: chat and writing have no shape to match.
  // Counted from the plan, not the suite: the plan repeats the suite to reach
  // questionCount, so a ten-question Chat suite run at 50 asks 30 prose
  // questions, not 6 — and this sentence exists to explain the extra time.
  const proseQuestionCount = buildBenchmarkPromptPlan(questionCount, benchmarkQuestions).filter(
    (question) => question.type === 'assistant' || question.type === 'writing',
  ).length;
  const activePreset = BENCHMARK_PRESETS.find(
    (p) => p.questions.length === benchmarkQuestions.length &&
      p.questions.every((q, i) => q.id === benchmarkQuestions[i]?.id),
  ) ?? null;
  /**
   * What this particular run would send off the machine.
   *
   * RigMatch's premise is that nothing leaves the computer, and for a local
   * model graded by the local judge that is exactly true of these questions
   * too. Two settings break it: a cloud model answers them remotely, and the
   * OpenRouter judge is sent both the question and the answer to grade. Whether
   * that matters is the reader's context to weigh, not this app's to assume —
   * so it states what happens and leaves the judgement where it belongs.
   */
  const candourCount = benchmarkQuestions.slice(0, questionCount).filter((q) => q.type === 'candour').length;
  const cloudAnswerers = (mode === 'speed-date' ? lineupModels ?? [] : [selectedModel])
    .filter((model) => model && isCloudModel(model));
  const answersLeaveToo = judgeSource === 'openrouter' && judgeActive;
  const offDeviceTargets = [
    ...(cloudAnswerers.length > 0 ? [`${cloudAnswerers.join(', ')} (cloud model${cloudAnswerers.length === 1 ? '' : 's'})`] : []),
    ...(answersLeaveToo ? ['openrouter.ai for grading'] : []),
  ];

  const title = mode === 'single' ? 'Test One Selected Model?' : 'Start Speed Dating?';
  const subject = mode === 'single' ? selectedModel : `${shortlistedCount} picked models`;
  const totalQuestions = mode === 'single' ? questionCount : questionCount * shortlistedCount;
  const runScope = mode === 'single'
    ? 'This tests only the model you selected in Contestants. Use Speed Dating when you want to compare a full lineup.'
    : 'This compares every picked model with the same questions and ranks the final Match scores.';

  // Skill-test capability + skip-questions state, hoisted so both the question
  // and skill sections (and the footer) can react to it.
  const appBuilderCapable = lineupModels.some((m) => !isLikelyImageGenerationModel(m) && !isEmbeddingModel(m));
  // Not from the lineup: generation runs on ComfyUI checkpoints, so whether it
  // is offered depends on ComfyUI, not on which models were picked.
  const hasImageModel = comfyCheckpoints.some((name) => !isVideoCheckpoint(name));
  const videoCheckpointCount = comfyCheckpoints.filter(isVideoCheckpoint).length;
  // A video model alone is not enough — LTX cannot run without a T5 encoder,
  // and offering the test without one produces a failure inside CLIPLoader
  // that reads as the model being broken.
  const videoCapable = videoCheckpointCount > 0 && comfyTextEncoders.length > 0;
  const visionCapable = lineupModels.some((m) => isVisionModel(m));
  const imageCapable = hasImageModel;
  // Code Challenge needs a code-capable model AND a judge — it's the only way to
  // grade arbitrary-language code (nothing to run/preview).
  const codeCapable = appBuilderCapable && judgeActive;
  // Every model in the lineup is image-only → the Q&A round can't run at all.
  const imageOnlyLineup = lineupModels.length > 0 && lineupModels.every(isLikelyImageGenerationModel);
  const anySkillSelected = (skillSelection.appBuilder && appBuilderCapable) || (skillSelection.code && codeCapable) || (skillSelection.image && imageCapable) || (skillSelection.video && videoCapable) || (skillSelection.recognize && visionCapable) || (skillSelection.listen && listenCapable);
  const skipQuestions = anySkillSelected && (skillSelection.skipQuestions || imageOnlyLineup);
  // Block the doomed case: an image-only model with no skill selected would just
  // fail the questions. Require a skill (the image one) first.
  const startBlocked = imageOnlyLineup && !anySkillSelected;

  const questionLabels: Record<BenchmarkQuestionCount, string> = {
    10:  '10 — Quick (~3 min per model)',
    20:  '20 — Standard (~5 min per model)',
    50:  '50 — Deep (~15 min per model)',
    100: '100 — Full suite (30+ min per model)',
  };

  // Not knowing how long a run takes is the biggest hesitation before the
  // app's main action, so state it on the button. Past runs on this rig beat
  // the static table — a measured pace is this machine's own, and it is
  // labelled so; the table stays as the rule of thumb for a first run.
  const minutesPerModel: Record<BenchmarkQuestionCount, number> = { 10: 3, 20: 5, 50: 15, 100: 30 };
  const runModelCount = mode === 'single' ? 1 : Math.max(1, shortlistedCount);
  const estimatedMs = skipQuestions ? 0 : (
    typeof measuredPerModelMs === 'number' && measuredPerModelMs > 0
      ? measuredPerModelMs * runModelCount
      : minutesPerModel[questionCount] * 60_000 * runModelCount
  );
  const measured = typeof measuredPerModelMs === 'number' && measuredPerModelMs > 0;
  const estimateLabel = estimatedMs > 0
    ? `${formatDuration(estimatedMs)}${runModelCount > 1 ? ` total · ${runModelCount} models` : ''}${measured ? ' · measured here' : ''}`
    : null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={runWarnRef} className="run-warning-modal" role="dialog" aria-modal="true" aria-labelledby="run-warning-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>{mode === 'single' ? 'One-model test' : 'Resource Warning'}</span>
            <strong id="run-warning-title">{title}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            {skipQuestions ? (
              <>RigMatch will run the selected <strong>skill test{skillSelection.appBuilder && skillSelection.image ? 's' : ''}</strong> on <strong>{subject}</strong> and skip the question round.</>
            ) : (
              <>RigMatch will test <strong>{subject}</strong> with <strong>{totalQuestions}</strong> total question{totalQuestions === 1 ? '' : 's'}.</>
            )} This can heavily use CPU, GPU, VRAM, RAM,
            storage bandwidth, fans, and battery until the run finishes.
          </p>
          <p>{runScope}</p>

          {/* On battery, a laptop throttles its GPU hard — the same model can
              score materially lower for a reason that has nothing to do with
              the model, and the run still lands in the timeline as a real
              result. Same rule as GPU contention: warn, never block. */}
          {system.battery.hasBattery && system.battery.acConnected === false && (
            <div className="gpu-contention-note level-busy" role="status">
              <Activity aria-hidden="true" />
              <div>
                <strong>Running on battery</strong>
                <p>
                  Most laptops throttle the graphics card on battery, so scores measured now can come out
                  below what this machine can really do{typeof system.battery.percent === 'number' ? ` (${system.battery.percent}% charge)` : ''}.
                  Plug in for a fair reading, or carry on — the result is still saved either way.
                </p>
              </div>
            </div>
          )}

          {/* Something else using the graphics card is the most common reason a
              score comes out below what a machine can really do — and since
              0.3.8 a contaminated run also lands in the timeline and produces a
              false delta against earlier results. Warn, never block. */}
          <GpuContentionNote contention={gpuContention} />

          {onLoadPreset && (
            <div className="run-focus-picker">
              <span className="run-focus-label">Test Focus</span>
              <div className="run-focus-chips">
                <button
                  type="button"
                  className={!activePreset ? 'active' : ''}
                  onClick={() => onLoadPreset(DEFAULT_BENCHMARK_QUESTIONS)}
                  aria-pressed={!activePreset ? 'true' : 'false'}
                >
                  General
                </button>
                {BENCHMARK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`${activePreset?.id === preset.id ? 'active' : ''}${preset.id === goalPresetId ? ' matches-goal' : ''}`}
                    onClick={() => onLoadPreset(preset.questions)}
                    aria-pressed={activePreset?.id === preset.id ? 'true' : 'false'}
                    title={preset.id === goalPresetId
                      ? `${preset.description} This is the focus that measures your goal.`
                      : preset.description}
                  >
                    {preset.label}
                    {preset.id === goalPresetId && <em className="focus-goal-flag">Your goal</em>}
                  </button>
                ))}
              </div>
              {/* The connection the app never made: a goal was chosen at first
                  run, and the run that would measure it had to be found
                  separately. Offered, not forced — a suite someone tuned by
                  hand must not be replaced without them asking. */}
              {goalPresetId && activePreset?.id !== goalPresetId && (
                <button
                  type="button"
                  className="run-focus-goal-suggest"
                  onClick={() => {
                    const preset = BENCHMARK_PRESETS.find((entry) => entry.id === goalPresetId);
                    if (preset) onLoadPreset(preset.questions);
                  }}
                >
                  <Sparkles aria-hidden="true" />
                  <span>
                    Focus on <strong>{goalDesire ?? 'your goal'}</strong> — asks more of the questions that
                    crown a Match for it, so a shorter run still names a winner.
                  </span>
                </button>
              )}
              <em className="run-focus-hint">
                {activePreset ? activePreset.description : 'Mixed general-purpose questions covering JSON output, instruction following, and daily tasks.'}
              </em>
              {/* Chat and writing answers have no shape for the rules to match,
                  so they get marked by a second model instead of by length.
                  Say so — it is why those questions take longer. */}
              {proseQuestionCount > 0 && (
                <em className="run-focus-hint judge-note">
                  {autoJudgeModel
                    ? `${proseQuestionCount} of these have no right answer to check against, so ${autoJudgeModel} reads and marks them. That is the only way chat and writing get a real score, and it is why those questions take a little longer.`
                    : `${proseQuestionCount} of these ask for chat or writing, which nothing installed can mark — download a second model and RigMatch will use it to grade them.`}
                </em>
              )}
            </div>
          )}

          <div className="run-question-picker">
            <div className="run-question-picker-head">
              <span>Questions per model</span>
              <div className="run-question-picker-actions">
                <button
                  type="button"
                  className="run-question-preview-toggle"
                  onClick={() => setQuestionsExpanded((v) => !v)}
                  aria-expanded={questionsExpanded}
                >
                  {questionsExpanded ? 'Hide questions' : 'Preview questions'}
                </button>
                {onEditQuestions && (
                  <button type="button" className="run-question-edit-link advanced-only" onClick={onEditQuestions}>
                    Edit suite ↗
                  </button>
                )}
              </div>
            </div>
            {skipQuestions && (
              <div className="run-question-skipped-note">
                Questions are skipped — this run does the selected skill test{anySkillSelected && (skillSelection.appBuilder && skillSelection.image) ? 's' : ''} only.
              </div>
            )}
            <div className={`run-question-options${skipQuestions ? ' is-muted' : ''}`} role="group" aria-label="Questions per model">
              {([10, 20, 50, 100] as BenchmarkQuestionCount[]).map((count) => (
                <button
                  key={count}
                  type="button"
                  className={count === questionCount ? 'active' : ''}
                  onClick={() => onChangeQuestionCount(count)}
                  aria-pressed={count === questionCount}
                >
                  {questionLabels[count]}
                </button>
              ))}
            </div>
            {questionsExpanded && (
              <ol className="run-question-preview-list">
                {benchmarkQuestions.slice(0, questionCount).map((q) => (
                  <li key={q.id}>
                    <span className="run-q-label">{q.label}</span>
                    <em className="run-q-prompt">{q.prompt}</em>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="run-question-picker">
            <div className="run-question-picker-head">
              <span>Answer grading</span>
              <em>How answer quality — and whether a built app actually works — is scored.</em>
            </div>
            <div className="run-question-options" role="group" aria-label="Answer grading mode">
              <button
                type="button"
                className={qualityMode === 'heuristic' ? 'active' : ''}
                onClick={() => onChangeQualityMode('heuristic')}
                aria-pressed={qualityMode === 'heuristic'}
              >
                Fast (built-in)
              </button>
              <button
                type="button"
                className={qualityMode === 'judge' ? 'active' : ''}
                onClick={() => onChangeQualityMode('judge')}
                aria-pressed={qualityMode === 'judge'}
              >
                Judge model
              </button>
            </div>
            {qualityMode === 'judge' && (
              <>
                <div className="run-question-options run-judge-source" role="group" aria-label="Judge source">
                  <button
                    type="button"
                    className={judgeSource === 'local' ? 'active' : ''}
                    onClick={() => onChangeJudgeSource('local')}
                    aria-pressed={judgeSource === 'local'}
                  >
                    Local model
                  </button>
                  <button
                    type="button"
                    className={judgeSource === 'openrouter' ? 'active' : ''}
                    onClick={() => onChangeJudgeSource('openrouter')}
                    aria-pressed={judgeSource === 'openrouter'}
                  >
                    Cloud (OpenRouter)
                  </button>
                </div>
                {judgeSource === 'local' ? (
                  judgeModelOptions.length === 0 ? (
                    <div className="run-question-skipped-note">
                      No local models installed to grade with — install one first, use the cloud judge, or use Fast grading.
                    </div>
                  ) : (
                    <>
                      <label className="run-judge-model">
                        <span>Graded by</span>
                        <select value={judgeModel} onChange={(e) => onChangeJudgeModel(e.target.value)}>
                          {judgeModelOptions.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      {lineupModels.includes(judgeModel) ? (
                        <div className="run-question-skipped-note">
                          Heads up: {judgeModel} is also being tested. A model grading itself can inflate its own score — pick a different judge if you can.
                        </div>
                      ) : (
                        <div className="run-question-skipped-note">
                          {judgeModel} grades every answer — and reads any app built in a skill test to judge whether it actually runs. Slower, but far more accurate than the built-in checks. Everything stays on this computer.
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <details className="run-judge-explainer">
                      <summary>What's OpenRouter, and why would I want this?</summary>
                      <p>
                        Grading answers well is a <em>reading</em> task, and the frontier cloud models are far
                        better graders than anything that fits on a home GPU — a small local judge can miss bugs
                        or grade a broken app as working. <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a> is
                        one account and one API key that gives pay-per-use access to all of them (Claude, GPT,
                        Gemini and more) — no subscription. Judging is tiny: each verdict reads a short rubric and
                        writes a one-line score, so grading a whole run costs pennies. Sign up at openrouter.ai,
                        add a few dollars of credit, create a key, and paste it below. Trade-off to know:
                        graded content leaves this computer, which is why this is opt-in and never the default.
                      </p>
                    </details>
                    <label className="run-judge-model">
                      <span>Guest judge</span>
                      <select
                        value={CLOUD_JUDGE_PRESETS.some((preset) => preset.id === cloudJudgeModel) ? cloudJudgeModel : '__custom__'}
                        onChange={(e) => onChangeCloudJudgeModel(e.target.value === '__custom__' ? '' : e.target.value)}
                      >
                        {CLOUD_JUDGE_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                        <option value="__custom__">Custom OpenRouter model…</option>
                      </select>
                    </label>
                    {!CLOUD_JUDGE_PRESETS.some((preset) => preset.id === cloudJudgeModel) && (
                      <label className="run-judge-model">
                        <span>Model id</span>
                        <input
                          type="text"
                          value={cloudJudgeModel}
                          onChange={(e) => onChangeCloudJudgeModel(e.target.value)}
                          placeholder="vendor/model — any OpenRouter id"
                          spellCheck={false}
                        />
                      </label>
                    )}
                    <label className="run-judge-model">
                      <span>API key</span>
                      <input
                        type="password"
                        value={openRouterKey}
                        onChange={(e) => onChangeOpenRouterKey(e.target.value)}
                        placeholder="sk-or-…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    {openRouterKey.trim() ? (
                      <div className="run-question-skipped-note">
                        Cloud judging sends each question, the model's answer, and any built-app code to OpenRouter for grading, and uses your OpenRouter credits. Your key stays on this computer. If the cloud judge fails, scoring falls back to the built-in checks.
                      </div>
                    ) : (
                      <div className="run-question-skipped-note">
                        Enter your OpenRouter API key to enable cloud grading — without it, this run uses the built-in checks. Cloud judging is never on by default: it sends graded content to OpenRouter and costs credits.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="run-skill-tests">
            <div className="run-skill-tests-head">
              <span>Skill Tests (optional)</span>
              <em>Extra Lab Grades — run them after the questions, or on their own. Models that cannot do a skill are grayed out.</em>
            </div>
            {(() => {
              // Capability flags are hoisted to the component body above. Image
              // generation is allowed on any platform (mirrors the Image Lab's
              // "try anyway"); MLX-only models fail with a clear message.
              return (
                <>
                  <label className={`run-skill-test-option${appBuilderCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.appBuilder && appBuilderCapable}
                      disabled={!appBuilderCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, appBuilder: event.target.checked })}
                    />
                    <span>
                      <strong>Build an app</strong>
                      <em>{appBuilderCapable
                        ? `Adds roughly 1–3 minutes per model. The finished app pops up to play when it's done.`
                        : 'No model in this run can write code — image and embedding models sit this one out.'}</em>
                    </span>
                  </label>
                  {appBuilderCapable && skillSelection.appBuilder && (
                    <div className="run-skill-app-picker">
                      <select
                        className="run-skill-app-select"
                        value={skillSelection.appPromptId}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, appPromptId: event.target.value })}
                        aria-label="App to build"
                      >
                        {APP_BUILDER_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                        <option value="custom">Custom prompt…</option>
                      </select>
                      {skillSelection.appPromptId === 'custom' && (
                        <input
                          type="text"
                          className="run-skill-image-prompt"
                          value={skillSelection.appCustomPrompt}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, appCustomPrompt: event.target.value })}
                          placeholder="Describe the app to build (e.g. a memory card game)"
                          aria-label="Custom app prompt"
                        />
                      )}
                    </div>
                  )}
                  <label className={`run-skill-test-option${codeCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.code && codeCapable}
                      disabled={!codeCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, code: event.target.checked })}
                    />
                    <span>
                      <strong>Code Challenge</strong>
                      <em>{!appBuilderCapable
                        ? 'No model in this run can write code — image and embedding models sit this one out.'
                        : !judgeActive
                          ? 'Turn on Judge grading above — code can only be graded by a model that reads it.'
                          : 'Solve a coding task in a language you pick. Graded by the judge (no run/preview). Adds ~1–2 min per model.'}</em>
                    </span>
                  </label>
                  {codeCapable && skillSelection.code && (
                    <div className="run-skill-app-picker">
                      <select
                        className="run-skill-app-select"
                        value={skillSelection.codeLanguage}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeLanguage: event.target.value })}
                        aria-label="Programming language"
                      >
                        {CODE_LANGUAGES.map((lang) => (
                          <option key={lang.id} value={lang.id}>{lang.label}</option>
                        ))}
                      </select>
                      <select
                        className="run-skill-app-select"
                        value={skillSelection.codeTaskId}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeTaskId: event.target.value })}
                        aria-label="Coding task"
                      >
                        {CODE_TASK_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                        <option value="custom">Custom task…</option>
                      </select>
                      {skillSelection.codeTaskId === 'custom' && (
                        <input
                          type="text"
                          className="run-skill-image-prompt"
                          value={skillSelection.codeCustomTask}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeCustomTask: event.target.value })}
                          placeholder="Describe the coding task (e.g. merge two sorted lists)"
                          aria-label="Custom coding task"
                        />
                      )}
                    </div>
                  )}
                  <label className={`run-skill-test-option${imageCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.image && imageCapable}
                      disabled={!imageCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, image: event.target.checked })}
                    />
                    <span>
                      <strong>Create an image</strong>
                      <em>{!hasImageModel
                        ? 'Needs ComfyUI running with at least one checkpoint. Ollama cannot generate images.'
                        : `Runs the prompt below on ${comfyCheckpoints.length === 1 ? 'your checkpoint' : `all ${comfyCheckpoints.length} checkpoints`} in ComfyUI, separately from the Ollama models above.`}</em>
                    </span>
                  </label>
                  {imageCapable && skillSelection.image && (
                    // A fixed list rather than free text: the score depends on a
                    // judge answering checkable propositions about the picture,
                    // and an arbitrary prompt has none to check against.
                    <select
                      className="run-skill-image-prompt"
                      value={skillSelection.imagePrompt}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, imagePrompt: event.target.value })}
                      aria-label="Image generation prompt"
                    >
                      {IMAGE_BENCHMARK_PROMPTS.map((prompt) => (
                        <option key={prompt.id} value={prompt.id}>{prompt.prompt}</option>
                      ))}
                    </select>
                  )}
                  <label className={`run-skill-test-option${videoCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.video && videoCapable}
                      disabled={!videoCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, video: event.target.checked })}
                    />
                    <span>
                      <strong>Generate a video</strong>
                      <em>{!videoCapable
                        ? 'Needs ComfyUI running with a video model and a T5 text encoder.'
                        : `Renders 4 seconds on ${videoCheckpointCount === 1 ? 'your video model' : `all ${videoCheckpointCount} video models`}. Slowest test here — roughly 12s per model at the smallest size, and minutes at Full HD.`}</em>
                    </span>
                  </label>
                  {videoCapable && skillSelection.video && (
                    <select
                      className="run-skill-image-prompt"
                      value={skillSelection.videoSizeId}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, videoSizeId: event.target.value })}
                      aria-label="Video size"
                    >
                      {VIDEO_SIZE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  )}
                  <label className={`run-skill-test-option${visionCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.recognize && visionCapable}
                      disabled={!visionCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, recognize: event.target.checked })}
                    />
                    <span>
                      <strong>Recognize an image</strong>
                      <em>{visionCapable
                        ? 'Shows a vision model a picture and streams its live description. Pick one below or upload your own. Adds about a minute per model.'
                        : 'No vision/OCR model in this run. Add one (like llava or a -vl model) to unlock.'}</em>
                    </span>
                  </label>
                  <label className={`run-skill-test-option${listenCapable ? '' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skillSelection.listen && listenCapable}
                      disabled={!listenCapable}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, listen: event.target.checked })}
                    />
                    <span>
                      <strong>Listen to the sample clip</strong>
                      <em>{listenCapable
                        ? 'Plays RigMatch\u2019s own short recording and compares the transcript word for word against what was actually said. The only score here measured against a right answer rather than judged. About twenty seconds per model. To test your own voice instead, use the Listening card in Activity.'
                        : 'No model in this run can hear. Add one that reports audio support (like gemma4) to unlock.'}</em>
                    </span>
                  </label>
                  {visionCapable && skillSelection.recognize && (
                    <div className="run-recognize-picker" role="group" aria-label="Choose the image the model should read">
                      {VISION_TEST_IMAGES.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          className={`run-recognize-thumb${skillSelection.recognizeImage === img.src ? ' active' : ''}`}
                          onClick={() => onSkillSelectionChange({ ...skillSelection, recognizeImage: img.src })}
                          title={img.label}
                          aria-label={img.label}
                          aria-pressed={skillSelection.recognizeImage === img.src}
                        >
                          <img src={img.src} alt={img.label} />
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`run-recognize-thumb upload${skillSelection.recognizeImage.startsWith('data:') ? ' active' : ''}`}
                        onClick={() => recognizeUploadRef.current?.click()}
                        title="Upload your own image"
                        aria-label="Upload your own image"
                      >
                        {skillSelection.recognizeImage.startsWith('data:')
                          ? <img src={skillSelection.recognizeImage} alt="Uploaded" />
                          : <><ImagePlus aria-hidden="true" /><span>Upload</span></>}
                      </button>
                      <input
                        ref={recognizeUploadRef}
                        type="file"
                        accept="image/*"
                        className="chat-file-input"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (!file || !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') onSkillSelectionChange({ ...skillSelection, recognizeImage: reader.result });
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </div>
                  )}
                  {/* Run only the skills, skipping the Q&A round. Placed right
                      under the skill choices (before the coming-soon video row)
                      so a "coding job, no questions" run is easy to find. Forced
                      on for image-only lineups, which can't answer questions. */}
                  <label className={`run-skill-test-option skip-questions${anySkillSelected ? ' is-active' : ' disabled'}`}>
                    <input
                      type="checkbox"
                      checked={skipQuestions}
                      disabled={!anySkillSelected || imageOnlyLineup}
                      onChange={(event) => onSkillSelectionChange({ ...skillSelection, skipQuestions: event.target.checked })}
                    />
                    <span>
                      <strong>Skip the questions — run the skill test only</strong>
                      <em>{imageOnlyLineup
                        ? 'This is an image model — it can\'t answer text questions, so RigMatch runs only the image skill.'
                        : anySkillSelected
                          ? 'Jump straight to the selected skill test (e.g. a coding job) — no question round, no Match score.'
                          : 'Tick a skill test above to enable a skill-only run.'}</em>
                    </span>
                  </label>

                </>
              );
            })()}
          </div>

          {startBlocked && (
            <div className="run-download-warning">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>This is an image model and can't answer the questions. Tick <strong>Create an image</strong> above to test it.</span>
            </div>
          )}

          <div className="modal-warning-grid">
            <div>
              <span>GPU</span>
              <strong>{system.gpu.model}</strong>
              <em>{system.gpu.vramGb ? `${system.gpu.vramGb} GB VRAM` : 'VRAM unknown'}</em>
            </div>
            <div>
              <span>CUDA</span>
              <strong>{getCudaSummary(system.cuda)}</strong>
              <em>{getCudaDetail(system.cuda)}</em>
            </div>
            <div>
              <span>Battery</span>
              <strong>{system.battery.hasBattery ? `${system.battery.percent ?? '?'}%` : 'AC desktop'}</strong>
              <em>{system.battery.hasBattery ? 'Plug in before long runs.' : 'No battery detected.'}</em>
            </div>
          </div>
        </div>
        {uninstalledContestantCount > 0 && mode === 'speed-date' && (
          <div className="run-download-warning">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>
              {uninstalledContestantCount === 1
                ? "1 contestant in your lineup isn’t downloaded yet."
                : `${uninstalledContestantCount} contestants in your lineup aren’t downloaded yet.`}
              {' '}Download them before starting. Downloads run through your local Ollama install and may be subject to third-party model terms.
            </span>
            {onDownloadMissing && (
              <button type="button" className="mini-button outline" onClick={onDownloadMissing}>
                <Download aria-hidden="true" />
                Download All
              </button>
            )}
          </div>
        )}
        {/* Only when the run actually asks these questions, and it says what is
            true of THIS run rather than a general caution nobody reads. The
            suite is opt-in, so most runs never see this. */}
        {candourCount > 0 && (
          <section className="run-warning-candour" aria-label="What leaves this computer">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>
                {candourCount} question{candourCount === 1 ? '' : 's'} in this run ask about documented history
                and openly debated topics — Tiananmen, Xinjiang, Tulsa 1921, the Armenian genocide.
              </strong>
              {offDeviceTargets.length === 0 ? (
                <p>
                  Nothing leaves this computer: a local model answers them and the local judge grades them.
                  No request carrying these questions is sent anywhere.
                </p>
              ) : (
                <p>
                  With the current settings these questions{answersLeaveToo ? ', and the answers,' : ''} will be
                  sent to {offDeviceTargets.join(' and ')}. If that matters where you are, switch to a local
                  model and the local judge, or choose a different question set.
                </p>
              )}
            </div>
          </section>
        )}
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            className="primary-button compact"
            onClick={onConfirm}
            disabled={(uninstalledContestantCount > 0 && mode === 'speed-date') || startBlocked}
          >
            <Zap aria-hidden="true" />
            {skipQuestions ? 'Run Skill Test' : mode === 'single' ? 'Start Test' : 'Start Speed Dating'}
            {estimateLabel && <em className="run-estimate">{estimateLabel}</em>}
          </button>
        </div>
      </section>
    </div>
  );
}
