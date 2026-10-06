// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion, BenchmarkQuestionCount, BenchmarkQuestionType } from '../benchmarkSuite';
import { BENCHMARK_PRESETS, buildBenchmarkPromptPlan } from '../benchmarkSuite';
import { CLOUD_JUDGE_PRESETS } from '../lib/appConfig';
import { CODE_LANGUAGES, CODE_TASK_PRESETS } from '../lib/codeChallenge';
import { IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';
import { APP_BUILDER_PRESETS, VISION_TEST_IMAGES } from '../lib/labChallenges';
import { isCloudModel, isEmbeddingModel, isLikelyImageGenerationModel, isVisionModel } from '../lib/modelCatalog';
import { formatDuration } from '../lib/runEstimates';
import {
  COUNT_OPTIONS, EDITABLE_QUESTION_TYPES, GENERAL_SET_DESCRIPTION, QUESTION_TYPE_LABELS, QUICK_MINUTES_PER_MODEL,
  activeQuestionSet, judgeChoiceOf, questionMarker, questionsForSet, sheetButtonLabel,
  type JudgeChoice, type QuestionSetId,
} from '../lib/runSheet';
import { useDialog } from '../lib/useDialog';
import { isPictureCheckpoint } from '../lib/checkpointKinds';
import type { GpuContention, SkillTestSelection, SystemProfile } from '../types';
import { BalanceFader } from './BalanceFader';
import { GpuContentionNote } from './GpuContentionNote';
import { UiIcon } from './icons/UiIcon';
import { Activity, ImagePlus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Simple Mode's rounds. Vision and listening ask no questions; code asks them, then builds an app. */
export type SimpleRound = 'chat' | 'code' | 'vision' | 'listening';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const about = (ms: number) => formatDuration(ms).replace('~', 'about ');

/**
 * Before the show, or before the test: the one sheet every run that works the
 * graphics card goes through.
 *
 * It replaced four things that each asked part of this: the run warning, the
 * quick-check warning, the question editor that floated beside the app, and
 * Simple Mode's own "What matters more?" dialog. Top to bottom it reads in the
 * order the decisions are made: what this will cost the machine, a quick look
 * or a real run, what to rank by, what to ask, how many, who marks it, and any
 * extra skill tests. The footer says what leaves the computer and how long the
 * run should take.
 */
export function RunSheet({
  mode,
  simpleRound,
  selectedModel,
  shortlistedCount,
  uninstalledContestantCount,
  questionCount,
  benchmarkQuestions,
  system,
  quick,
  onQuickChange,
  initialEditing = false,
  startBlockedReason = null,
  onCancel,
  onConfirm,
  onDownloadMissing,
  onChangeQuestionCount,
  onChangeQuestions,
  autoJudgeModel,
  goalPresetId,
  goalDesire,
  lineupModels,
  skillSelection,
  onSkillSelectionChange,
  listenCapable,
  comfyCheckpoints,
  videoLineup,
  balance,
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
  codeJudgeActive,
  gpuContention,
  measuredPerModelMs,
}: {
  mode: 'single' | 'speed-date';
  /** Set when Simple Mode opened the sheet. Its round decides what runs, so skill tests are not offered. */
  simpleRound?: SimpleRound;
  selectedModel: string;
  shortlistedCount: number;
  uninstalledContestantCount: number;
  questionCount: BenchmarkQuestionCount;
  benchmarkQuestions: BenchmarkQuestion[];
  system: SystemProfile;
  quick: boolean;
  onQuickChange: (quick: boolean) => void;
  /** Open with the question editor showing, for "Questions and judge". */
  initialEditing?: boolean;
  /** Why this run cannot start yet. The sheet still opens, to change settings. */
  startBlockedReason?: string | null;
  onCancel: () => void;
  /** skillsOnly: the run skips the questions and runs only the skill tests picked here. */
  onConfirm: (options: { skipQuickSheet: boolean; skillsOnly: boolean }) => void;
  onDownloadMissing?: () => void;
  onChangeQuestionCount: (count: BenchmarkQuestionCount) => void;
  onChangeQuestions: (questions: BenchmarkQuestion[]) => void;
  /** A local model that marks the prose questions when judging is off. */
  autoJudgeModel?: string;
  /** The set that measures the user's main goal, when one does. */
  goalPresetId?: string;
  /** That goal in the user's own words. */
  goalDesire?: string;
  lineupModels: string[];
  skillSelection: SkillTestSelection;
  onSkillSelectionChange: (selection: SkillTestSelection) => void;
  /** Whether any model in this run reports the audio capability. */
  listenCapable: boolean;
  /** Checkpoints ComfyUI has loaded; image generation runs on these, not on the lineup. */
  comfyCheckpoints: string[];
  /** The video models that can render here now, and roughly how long all of them take. */
  videoLineup: { count: number; estimate: string };
  /** The Balance fader for this run's channel. Only the ranking depends on it. */
  balance: { value: number; onChange: (value: number) => void; channel: string; accuracyMeans: string };
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
  /**
   * The code challenge is marked through Ollama (Labs' skill tests), so it
   * needs a judge there. A judge in LM Studio marks the show's questions but
   * not the code; judgeActive alone said both or neither.
   */
  codeJudgeActive: boolean;
  /** Measured when the sheet opened; null while the probe is still running. */
  gpuContention: GpuContention | null;
  /** Per-model duration from this computer's own runs, when it has any. */
  measuredPerModelMs?: number | null;
}) {
  const sheetRef = useDialog<HTMLElement>(onCancel);
  const uid = useId();
  const [editing, setEditing] = useState(initialEditing);
  // The set someone started editing from, for "Back to the standard set".
  const [editBase, setEditBase] = useState<Exclude<QuestionSetId, 'custom'> | null>(null);
  const [skipQuickSheet, setSkipQuickSheet] = useState(false);
  const recognizeUploadRef = useRef<HTMLInputElement>(null);
  // A picture refused for its size or type said nothing: the click just did nothing.
  const [uploadNote, setUploadNote] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  // Opened for "Questions and judge": start at the questions, not the warning.
  useEffect(() => {
    if (initialEditing) bodyRef.current?.querySelector('.run-sheet-editor')?.closest('.run-sheet-section')?.scrollIntoView({ block: 'start' });
    // Once, on open; later edits must not yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const asksQuestions = !simpleRound || simpleRound === 'chat' || simpleRound === 'code';
  const offersQuick = !simpleRound;
  const offersSkills = !simpleRound;
  const isQuick = offersQuick && quick;
  const setId = activeQuestionSet(benchmarkQuestions);
  const choice = judgeChoiceOf(qualityMode, judgeSource);

  // Skill tests: what this lineup can do. Image generation runs on ComfyUI's
  // checkpoints, so it depends on ComfyUI, not on which models were picked.
  const appBuilderCapable = lineupModels.some((m) => !isLikelyImageGenerationModel(m) && !isEmbeddingModel(m));
  const imageCapable = comfyCheckpoints.some(isPictureCheckpoint);
  const videoCapable = videoLineup.count > 0;
  const visionCapable = lineupModels.some((m) => isVisionModel(m));
  // Code can only be graded by a model that reads it.
  const codeCapable = appBuilderCapable && codeJudgeActive;
  const imageOnlyLineup = lineupModels.length > 0 && lineupModels.every(isLikelyImageGenerationModel);
  const anySkillSelected = offersSkills && !isQuick && (
    (skillSelection.appBuilder && appBuilderCapable) || (skillSelection.code && codeCapable)
    || (skillSelection.image && imageCapable) || (skillSelection.video && videoCapable)
    || (skillSelection.recognize && visionCapable) || (skillSelection.listen && listenCapable));
  const skillsOnly = anySkillSelected && (skillSelection.skipQuestions || imageOnlyLineup);
  // An image-only lineup with no skill picked would only fail the questions.
  const imageOnlyBlocked = offersSkills && imageOnlyLineup && !anySkillSelected;
  const missingBlocked = !simpleRound && mode === 'speed-date' && uninstalledContestantCount > 0;

  // Counted from the plan, which repeats the set to reach the count: a run of
  // 50 from a ten-question set asks five times the judged questions it lists.
  const plan = buildBenchmarkPromptPlan(questionCount, benchmarkQuestions);
  const judgedInPlan = plan.filter((q) => questionMarker(q) === 'judge').length;
  // Who will actually mark them: a judge picked but not usable (no key, no
  // model) hands them to the automatic judge, as the built-in checks do.
  const judgeFallback = choice !== 'built-in' && !judgeActive;
  const judgeName = choice === 'built-in' || judgeFallback ? autoJudgeModel
    : choice === 'cloud' ? 'the OpenRouter judge' : judgeModel;

  // What this run sends off the machine: a cloud model answers remotely, and
  // the OpenRouter judge is sent each question and answer to mark.
  const cloudAnswerers = (mode === 'speed-date' ? lineupModels : [selectedModel]).filter((m) => m && isCloudModel(m));
  const answersLeave = choice === 'cloud' && judgeActive && !isQuick;
  const offDevice = [
    ...(cloudAnswerers.length > 0 ? [`${cloudAnswerers.join(', ')} (cloud model${cloudAnswerers.length === 1 ? '' : 's'})`] : []),
    ...(answersLeave ? ['openrouter.ai, for marking'] : []),
  ];
  const candourCount = isQuick || !asksQuestions ? 0 : plan.filter((q) => q.type === 'candour').length;

  const runModels = mode === 'single' ? 1 : Math.max(1, shortlistedCount);
  const measured = typeof measuredPerModelMs === 'number' && measuredPerModelMs > 0;
  const tableMinutes = COUNT_OPTIONS.find((o) => o.count === questionCount)?.minutes ?? 3;
  const estimateMs = isQuick ? QUICK_MINUTES_PER_MODEL * 60_000 * runModels
    : skillsOnly || !asksQuestions ? 0
      : (measured ? (measuredPerModelMs as number) : tableMinutes * 60_000) * runModels;
  const buttonLabel = sheetButtonLabel({
    quick: isQuick,
    mode,
    skillsOnly,
    duration: estimateMs > 0 ? about(estimateMs) : null,
    measured,
  });
  const blockedReason = startBlockedReason
    ?? (imageOnlyBlocked ? 'This is an image model and cannot answer questions. Tick "Create an image" to test it.' : null);
  const startDisabled = Boolean(blockedReason) || missingBlocked;

  const contestants = plural(shortlistedCount, 'contestant');
  const subtitle = skillsOnly
    ? `Runs the skill tests you picked on ${mode === 'single' ? selectedModel : contestants}, and skips the questions.`
    : mode === 'single'
      ? isQuick
        ? `Runs three quick questions on ${selectedModel}. Use the show to compare a lineup.`
        : `Tests only ${selectedModel} with ${questionCount} questions. Use the show to compare a lineup.`
      : simpleRound === 'vision' ? `${contestants} each describe the same picture, one at a time.`
        : simpleRound === 'listening' ? `${contestants} each write down the same short clip, one at a time.`
          : simpleRound === 'code' ? `${contestants} answer the same questions, then each builds a small app. One at a time; each is unloaded before the next.`
            : `${contestants} answer the same questions, one at a time. Each is unloaded before the next.`;

  const gpuName = system.gpu.model && system.gpu.model !== 'Unknown GPU' ? system.gpu.model : 'graphics card';
  const onBattery = system.battery.hasBattery && system.battery.acConnected === false;

  const pickSet = (id: Exclude<QuestionSetId, 'custom'>) => {
    onChangeQuestions(questionsForSet(id));
    setEditBase(null);
  };
  const toggleEditing = () => {
    if (!editing && setId !== 'custom') setEditBase(setId);
    setEditing(!editing);
  };
  const updateQuestion = (index: number, patch: Partial<BenchmarkQuestion>) => {
    onChangeQuestions(benchmarkQuestions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };
  const chooseJudge = (next: JudgeChoice) => {
    if (next === 'built-in') { onChangeQualityMode('heuristic'); return; }
    onChangeQualityMode('judge');
    onChangeJudgeSource(next === 'cloud' ? 'openrouter' : 'local');
  };

  const setDescription = setId === 'custom'
    ? 'Questions you wrote or changed. Scores from them may not compare with the standard sets.'
    : setId === 'general' ? GENERAL_SET_DESCRIPTION : BENCHMARK_PRESETS.find((p) => p.id === setId)?.description ?? '';
  const goalLine = goalPresetId && setId === goalPresetId
    ? ` This is the set that measures your goal${goalDesire ? ` (${goalDesire})` : ''}: it asks more of the questions that crown a Match for it, so a shorter run still names a winner.`
    : '';
  const judgeNote = judgedInPlan === 0
    ? 'Every question here can be checked by rules.'
    : judgeName
      ? `${judgedInPlan} of the ${questionCount} questions have no right answer to check against, so ${judgeName} reads and marks them${judgeFallback ? ', since the judge picked below is not ready' : ''}. That is why they take longer.`
      : `${judgedInPlan} of the ${questionCount} questions need a judge to mark them, and nothing else installed can. Install a second model and RigMatch will use it.`;

  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section ref={sheetRef} className="run-sheet" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <header className="run-sheet-head">
          <div>
            <h2 id={`${uid}-title`}>{mode === 'single' ? 'Before the test' : 'Before the show'}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={onCancel}>Close</button>
        </header>

        <div className="run-sheet-body" ref={bodyRef}>
          <div className="run-sheet-warning">
            <UiIcon name="warn" size={20} />
            <p>
              Your {gpuName}, processor and fans will work hard until this finishes.
              {gpuContention?.level === 'clear' && ' Nothing else is using the graphics card right now.'}
              {system.battery.hasBattery && !onBattery && ' Keep the laptop plugged in for a fair reading.'}
            </p>
          </div>
          {/* On battery a laptop throttles its graphics card, and the score
              comes out low for a reason that has nothing to do with the model.
              Warn, never block: the result is still saved. */}
          {onBattery && (
            <div className="gpu-contention-note level-busy" role="status">
              <Activity aria-hidden="true" />
              <div>
                <strong>Running on battery</strong>
                <p>
                  Most laptops slow the graphics card on battery, so scores measured now can come out below what
                  this computer can really do{typeof system.battery.percent === 'number' ? ` (${system.battery.percent}% charge)` : ''}.
                  Plug in for a fair reading, or carry on; the result is saved either way.
                </p>
              </div>
            </div>
          )}
          <GpuContentionNote contention={gpuContention} />

          {offersQuick && (
            <div className="run-sheet-quick">
              <button type="button" className="check-toggle" aria-pressed={quick} onClick={() => onQuickChange(!quick)}>
                <span className="check-toggle-box" aria-hidden="true">{quick && <Tick />}</span>
                <span>
                  <strong>Quick check · 3 questions, about a minute a model</strong>
                  One code question, one accuracy trap and one format check. A first look; the full set is what
                  crowns a Match. The settings below apply to full runs.
                </span>
              </button>
              {quick && mode === 'single' && (
                <label className="run-sheet-inline-check">
                  <input type="checkbox" checked={skipQuickSheet} onChange={(event) => setSkipQuickSheet(event.target.checked)} />
                  Start quick checks without this sheet from now on
                </label>
              )}
            </div>
          )}

          <BalanceFader
            variant="row"
            value={balance.value}
            onChange={balance.onChange}
            accuracyMeans={balance.accuracyMeans}
            label={`What matters more for ${balance.channel.toLowerCase()}?`}
          />

          {asksQuestions && (
            <Section title="Question set" muted={isQuick || skillsOnly}>
              <div className="chip-row" role="group" aria-label="Question set">
                <SetChip active={setId === 'general'} onClick={() => pickSet('general')} label="General" />
                {BENCHMARK_PRESETS.map((preset) => (
                  <SetChip
                    key={preset.id}
                    active={setId === preset.id}
                    onClick={() => pickSet(preset.id)}
                    label={preset.label}
                    goal={preset.id === goalPresetId}
                  />
                ))}
                {setId === 'custom' && <SetChip active onClick={() => undefined} label="Your questions" />}
              </div>
              <p className="run-sheet-note">{setDescription}{goalLine}</p>

              {editing ? (
                <div className="run-sheet-editor">
                  {benchmarkQuestions.map((question, index) => {
                    const types: BenchmarkQuestionType[] = EDITABLE_QUESTION_TYPES.includes(question.type)
                      ? EDITABLE_QUESTION_TYPES : [question.type, ...EDITABLE_QUESTION_TYPES];
                    return (
                      <div className="run-sheet-edit-row" key={`${question.id}-${index}`}>
                        <span className="run-sheet-num">{String(index + 1).padStart(2, '0')}</span>
                        <div className="run-sheet-edit-fields">
                          <input
                            value={question.label}
                            onChange={(event) => updateQuestion(index, { label: event.target.value })}
                            aria-label={`Question ${index + 1} title`}
                          />
                          <textarea
                            value={question.prompt}
                            onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                            aria-label={`Question ${index + 1} wording`}
                            rows={3}
                          />
                        </div>
                        <select
                          value={question.type}
                          onChange={(event) => updateQuestion(index, { type: event.target.value as BenchmarkQuestionType })}
                          aria-label={`Question ${index + 1} type`}
                        >
                          {types.map((type) => <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>)}
                        </select>
                        <button
                          type="button"
                          className="btn btn-line btn-sm"
                          onClick={() => onChangeQuestions(benchmarkQuestions.filter((_q, i) => i !== index))}
                          disabled={benchmarkQuestions.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  <div className="run-sheet-actions-row">
                    <button
                      type="button"
                      className="btn btn-line btn-sm"
                      onClick={() => onChangeQuestions([...benchmarkQuestions, { id: `custom_${Date.now()}`, label: 'New question', type: 'assistant', prompt: '' }])}
                    >
                      Add a question
                    </button>
                    <button type="button" className="btn btn-line btn-sm" onClick={() => pickSet(editBase ?? 'general')} disabled={setId !== 'custom'}>
                      Back to the standard set
                    </button>
                  </div>
                  <p className="run-sheet-note">
                    Changes save as you type. Each run keeps the questions it asked, so its answers always show what was
                    actually asked. Rules check JSON, accuracy-trap, format and some code questions; a judge marks the rest.
                  </p>
                </div>
              ) : (
                <ol className="run-sheet-questions" aria-label="Questions in this set">
                  {benchmarkQuestions.map((question, index) => {
                    const marker = questionMarker(question);
                    return (
                      <li key={`${question.id}-${index}`}>
                        <span className="run-sheet-num">{String(index + 1).padStart(2, '0')}</span>
                        <span className="run-sheet-q-label">{question.label}</span>
                        <span className="run-sheet-q-type">{QUESTION_TYPE_LABELS[question.type]}</span>
                        <span className={`run-sheet-q-mark ${marker}`}>{marker === 'judge' ? 'Read by a judge' : 'Checked by rules'}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="run-sheet-actions-row">
                <button type="button" className="btn btn-link" onClick={toggleEditing} aria-expanded={editing}>
                  {editing ? 'Done editing' : setId === 'custom' ? 'Edit your questions' : 'Edit these questions'}
                </button>
                <span className="run-sheet-note">{judgeNote}</span>
              </div>
            </Section>
          )}

          {asksQuestions && (
            <Section title="How many questions" muted={isQuick || skillsOnly}>
              <div className="chip-row" role="group" aria-label="How many questions">
                {COUNT_OPTIONS.map((option) => (
                  <button
                    key={option.count}
                    type="button"
                    className="chip"
                    aria-pressed={option.count === questionCount}
                    onClick={() => onChangeQuestionCount(option.count)}
                  >
                    {option.count} · {option.name} · {option.perModel}
                  </button>
                ))}
              </div>
              {benchmarkQuestions.length < questionCount && (
                <p className="run-sheet-note">The set has {benchmarkQuestions.length} questions, so it repeats to reach {questionCount}.</p>
              )}
            </Section>
          )}

          {asksQuestions && (
            <Section title="Who marks the answers" muted={isQuick}>
              <div className="chip-row" role="group" aria-label="Who marks the answers">
                <button type="button" className="chip" aria-pressed={choice === 'built-in'} onClick={() => chooseJudge('built-in')}>Built-in checks</button>
                <button type="button" className="chip" aria-pressed={choice === 'local'} onClick={() => chooseJudge('local')}>A judge on this computer</button>
                <button type="button" className="chip" aria-pressed={choice === 'cloud'} onClick={() => chooseJudge('cloud')}>OpenRouter (cloud)</button>
              </div>
              {choice === 'built-in' && (
                <p className="run-sheet-note">
                  Rules mark every answer that has a right answer.
                  {autoJudgeModel
                    ? ` Chat and writing answers are read by ${autoJudgeModel}, on this computer.`
                    : ' Nothing else installed can read chat and writing answers, so those stay unmarked.'}
                </p>
              )}
              {choice === 'local' && (judgeModelOptions.length === 0 ? (
                <p className="run-sheet-note">No local model is installed to judge with. Install one, use OpenRouter, or use the built-in checks.</p>
              ) : (
                <>
                  <label className="run-sheet-field">
                    <span>Judge</span>
                    <select value={judgeModel} onChange={(event) => onChangeJudgeModel(event.target.value)}>
                      {judgeModelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  {lineupModels.includes(judgeModel) ? (
                    <p className="run-sheet-note warn" role="status">
                      {judgeModel} is also being tested. A model marking its own answers can inflate its score; pick a
                      different judge if you can.
                    </p>
                  ) : (
                    <p className="run-sheet-note">
                      {judgeModel} reads and marks every answer, and any app a skill test builds. Slower than the built-in
                      checks and far more accurate. Everything stays on this computer.
                    </p>
                  )}
                </>
              ))}
              {choice === 'cloud' && (
                <>
                  <p className="run-sheet-note warn">
                    Each question and answer, and any app a skill test builds, is sent to OpenRouter for marking and uses
                    your credits. Your key stays on this computer. This is the one setting where your test content leaves
                    the computer, so it is never the default.
                  </p>
                  <details className="run-sheet-explainer">
                    <summary>What's OpenRouter, and why would I want this?</summary>
                    <p>
                      Marking answers well is a reading task, and the big cloud models are much better markers than
                      anything that fits on a home graphics card. A small local judge can miss a bug or pass a broken app.{' '}
                      <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a> is one
                      account and one key for pay-per-use access to many of them, with no subscription. Each verdict is a
                      short rubric and a one-line score, so marking a whole run costs very little. Sign up, add a few
                      dollars of credit, create a key and paste it below.
                    </p>
                  </details>
                  <label className="run-sheet-field">
                    <span>Guest judge</span>
                    <select
                      value={CLOUD_JUDGE_PRESETS.some((preset) => preset.id === cloudJudgeModel) ? cloudJudgeModel : '__custom__'}
                      onChange={(event) => onChangeCloudJudgeModel(event.target.value === '__custom__' ? '' : event.target.value)}
                    >
                      {CLOUD_JUDGE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                      <option value="__custom__">Another OpenRouter model…</option>
                    </select>
                  </label>
                  {!CLOUD_JUDGE_PRESETS.some((preset) => preset.id === cloudJudgeModel) && (
                    <label className="run-sheet-field">
                      <span>Model id</span>
                      <input
                        type="text"
                        value={cloudJudgeModel}
                        onChange={(event) => onChangeCloudJudgeModel(event.target.value)}
                        placeholder="vendor/model"
                        spellCheck={false}
                      />
                    </label>
                  )}
                  <label className="run-sheet-field">
                    <span>OpenRouter API key</span>
                    <input
                      type="password"
                      value={openRouterKey}
                      onChange={(event) => onChangeOpenRouterKey(event.target.value)}
                      placeholder="sk-or-…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <p className="run-sheet-note">
                    {openRouterKey.trim()
                      ? 'If OpenRouter fails, marking falls back to the built-in checks.'
                      : 'Without a key, this run uses the built-in checks.'}
                  </p>
                </>
              )}
            </Section>
          )}

          {offersSkills && (
            <Section title="Extra skill tests" aside="optional, after the questions">
              {isQuick ? (
                <p className="run-sheet-note">A quick check runs its three questions only.</p>
              ) : (
                <div className="run-sheet-skills">
                  <SkillOption
                    label="Build an app"
                    checked={skillSelection.appBuilder && appBuilderCapable}
                    disabled={!appBuilderCapable}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, appBuilder: on })}
                    detail={appBuilderCapable
                      ? 'Adds about 1 to 3 minutes a model. The finished app opens to play when it is done.'
                      : 'No model in this run can write code. Image and embedding models sit this one out.'}
                  >
                    {appBuilderCapable && skillSelection.appBuilder && (
                      <div className="run-sheet-skill-pickers">
                        <select
                          value={skillSelection.appPromptId}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, appPromptId: event.target.value })}
                          aria-label="App to build"
                        >
                          {APP_BUILDER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                          <option value="custom">Your own prompt…</option>
                        </select>
                        {skillSelection.appPromptId === 'custom' && (
                          <input
                            type="text"
                            value={skillSelection.appCustomPrompt}
                            onChange={(event) => onSkillSelectionChange({ ...skillSelection, appCustomPrompt: event.target.value })}
                            placeholder="Describe the app, e.g. a memory card game"
                            aria-label="Your app prompt"
                          />
                        )}
                      </div>
                    )}
                  </SkillOption>
                  <SkillOption
                    label="Code challenge"
                    checked={skillSelection.code && codeCapable}
                    disabled={!codeCapable}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, code: on })}
                    detail={!appBuilderCapable
                      ? 'No model in this run can write code. Image and embedding models sit this one out.'
                      : !judgeActive
                        ? 'Needs a judge above: code is marked by a model that reads it.'
                        : !codeJudgeActive
                          ? 'Code is marked through Ollama, and the judge above is in LM Studio. Install a model in Ollama to judge code.'
                        : 'Solves a coding task in a language you pick, marked by the judge. Adds 1 to 2 minutes a model.'}
                  >
                    {codeCapable && skillSelection.code && (
                      <div className="run-sheet-skill-pickers">
                        <select
                          value={skillSelection.codeLanguage}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeLanguage: event.target.value })}
                          aria-label="Programming language"
                        >
                          {CODE_LANGUAGES.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
                        </select>
                        <select
                          value={skillSelection.codeTaskId}
                          onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeTaskId: event.target.value })}
                          aria-label="Coding task"
                        >
                          {CODE_TASK_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                          <option value="custom">Your own task…</option>
                        </select>
                        {skillSelection.codeTaskId === 'custom' && (
                          <input
                            type="text"
                            value={skillSelection.codeCustomTask}
                            onChange={(event) => onSkillSelectionChange({ ...skillSelection, codeCustomTask: event.target.value })}
                            placeholder="Describe the task, e.g. merge two sorted lists"
                            aria-label="Your coding task"
                          />
                        )}
                      </div>
                    )}
                  </SkillOption>
                  <SkillOption
                    label="Create an image"
                    checked={skillSelection.image && imageCapable}
                    disabled={!imageCapable}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, image: on })}
                    detail={!imageCapable
                      ? 'Needs ComfyUI running with at least one picture model. Ollama cannot make images.'
                      : `Runs the prompt below on ${comfyCheckpoints.length === 1 ? 'your picture model' : `all ${comfyCheckpoints.length} picture models`} in ComfyUI, apart from the models above.`}
                  >
                    {/* A fixed list: the score comes from a judge checking things
                        the prompt asked for, and free text has none to check. */}
                    {imageCapable && skillSelection.image && (
                      <select
                        value={skillSelection.imagePrompt}
                        onChange={(event) => onSkillSelectionChange({ ...skillSelection, imagePrompt: event.target.value })}
                        aria-label="Picture prompt"
                      >
                        {IMAGE_BENCHMARK_PROMPTS.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.prompt}</option>)}
                      </select>
                    )}
                  </SkillOption>
                  <SkillOption
                    label="Make a video"
                    checked={skillSelection.video && videoCapable}
                    disabled={!videoCapable}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, video: on })}
                    detail={!videoCapable
                      ? 'Needs ComfyUI running with a video model from the Video lab that fits this computer.'
                      : `Renders the same prompt on ${videoLineup.count === 1 ? 'your video model' : `each of your ${videoLineup.count} video models`}, one at a time: ${videoLineup.estimate} in total. The slowest test here.`}
                  />
                  <SkillOption
                    label="Read a picture"
                    checked={skillSelection.recognize && visionCapable}
                    disabled={!visionCapable}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, recognize: on })}
                    detail={visionCapable
                      ? 'Shows a vision model a picture and streams its description. Pick one below or add your own. About a minute a model.'
                      : 'No model in this run can see. Add one, like llava or a -vl model.'}
                  >
                    {visionCapable && skillSelection.recognize && (
                      <div className="run-recognize-picker" role="group" aria-label="Picture the model reads">
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
                          title="Add your own picture"
                          aria-label="Add your own picture"
                        >
                          {skillSelection.recognizeImage.startsWith('data:')
                            ? <img src={skillSelection.recognizeImage} alt="Yours" />
                            : <><ImagePlus aria-hidden="true" /><span>Add</span></>}
                        </button>
                        <input
                          ref={recognizeUploadRef}
                          type="file"
                          accept="image/*"
                          className="chat-file-input"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (!file) return;
                            if (!file.type.startsWith('image/')) { setUploadNote('That file is not a picture.'); return; }
                            if (file.size > 8 * 1024 * 1024) { setUploadNote('That picture is over 8 MB. Pick a smaller one.'); return; }
                            setUploadNote('');
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') onSkillSelectionChange({ ...skillSelection, recognizeImage: reader.result });
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        {uploadNote && <p className="run-sheet-note warn" role="status">{uploadNote}</p>}
                      </div>
                    )}
                  </SkillOption>
                  <SkillOption
                    label="Listen to the sample clip"
                    checked={skillSelection.listen && listenCapable}
                    disabled={!listenCapable}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, listen: on })}
                    detail={listenCapable
                      ? 'Plays RigMatch’s own short recording and compares the transcript word for word with what was said: the one score here measured against a right answer. About twenty seconds a model. To test your own voice, use the Listening lab.'
                      : 'No model in this run can hear. Add one that reports audio support, like gemma4.'}
                  />
                  <SkillOption
                    label="Skip the questions and run only the skill tests"
                    checked={skillsOnly}
                    disabled={!anySkillSelected || imageOnlyLineup}
                    onChange={(on) => onSkillSelectionChange({ ...skillSelection, skipQuestions: on })}
                    detail={imageOnlyLineup
                      ? 'An image model cannot answer text questions, so RigMatch runs only the image test.'
                      : anySkillSelected
                        ? 'Goes straight to the skill tests: no questions, so no Match score.'
                        : 'Tick a skill test above first.'}
                  />
                </div>
              )}
            </Section>
          )}

          {missingBlocked && (
            <div className="run-sheet-alert" role="status">
              <UiIcon name="warn" size={18} />
              <span>
                {uninstalledContestantCount === 1
                  ? '1 contestant in your lineup is not downloaded yet.'
                  : `${uninstalledContestantCount} contestants in your lineup are not downloaded yet.`}
                {' '}Download them before the show. Downloads go through Ollama and may come with the model maker's terms.
              </span>
              {onDownloadMissing && (
                <button type="button" className="btn btn-line btn-sm" onClick={onDownloadMissing}>Download all</button>
              )}
            </div>
          )}

          {/* Only when this run asks these questions, and it says what is true
              of this run rather than a general caution nobody reads. */}
          {candourCount > 0 && (
            <div className="run-sheet-alert candour" role="note">
              <UiIcon name="warn" size={18} />
              <span>
                <strong>
                  {plural(candourCount, 'question')} in this run ask about documented history and openly debated topics:
                  Tiananmen, Xinjiang, Tulsa 1921, the Armenian genocide.
                </strong>{' '}
                {offDevice.length === 0
                  ? 'Nothing leaves this computer: a local model answers them and a local judge marks them.'
                  : `With these settings the questions${answersLeave ? ' and the answers' : ''} go to ${offDevice.join(' and ')}. If that matters where you are, use a local model and a local judge, or another question set.`}
              </span>
            </div>
          )}
        </div>

        <footer className="run-sheet-foot">
          <p className={`run-sheet-leaves${offDevice.length > 0 ? ' off-device' : ''}`}>
            {blockedReason
              ?? (offDevice.length > 0
                ? `Sent off this computer: ${offDevice.join(' and ')}.`
                : choice === 'cloud' && !openRouterKey.trim() && asksQuestions && !isQuick
                  ? 'No OpenRouter key, so this run uses the built-in checks. Nothing leaves this computer.'
                  : 'Nothing leaves this computer.')}
          </p>
          <button type="button" className="btn btn-line" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => onConfirm({ skipQuickSheet: isQuick && mode === 'single' && skipQuickSheet, skillsOnly })}
            disabled={startDisabled}
          >
            {buttonLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Section({ title, aside, muted = false, children }: { title: string; aside?: string; muted?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`run-sheet-section${muted ? ' muted' : ''}`} aria-labelledby={id}>
      <h3 id={id}>{title}{aside && <span> {aside}</span>}</h3>
      {children}
    </section>
  );
}

function SetChip({ active, onClick, label, goal = false }: { active: boolean; onClick: () => void; label: string; goal?: boolean }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {label}
      {goal && <em>your goal</em>}
    </button>
  );
}

function SkillOption({ label, detail, checked, disabled, onChange, children }: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="run-sheet-skill">
      <label className={`check-toggle${disabled ? ' disabled' : ''}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className="check-toggle-box" aria-hidden="true">{checked && <Tick />}</span>
        <span>
          <strong>{label}</strong>
          {detail}
        </span>
      </label>
      {children}
    </div>
  );
}
