// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, HandFist, Lock, Trophy, X } from 'lucide-react';
import type { ModelRow, OllamaInstallProgress, PullProgressUpdate, RunFailure, RunProgress, SystemProfile } from '../types';
import { STEPS, STEP_LABELS, downloadTimeLeft, footerHint, minPicksFor, nextBlockedHint, pickShortHint, showAnnouncement, showTimeLeft, winnerField, type StepId } from '../lib/wizardCopy';
import { copyText, type CopyState } from '../lib/clipboard';
import { Explain, ExplainText, InfoViewProvider } from './InfoView';
import { useExplaining } from '../lib/infoContext';
import { formatBytes, formatBytesPerSecond } from '../lib/format';
import { roundLabel } from '../lib/roundLabels';
import { getModelAvatarSrc, HOST_AVATAR_SRC } from '../lib/modelAvatars';
import { getFriendlyModelName, type DreamTag } from '../lib/modelCatalog';
import { MIN_CONTESTANTS, getDownloadRowStatus, summarizeDownloadStep } from '../lib/downloadStatus';
import type { ComfyFolderListing } from '../lib/generationCatalog';
import { IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';
import { AllDemosButton, ModelDemoChips } from './SkillDemoViewers';
import { VideoLineupLab } from './VideoLineupLab';
import { ComparisonRunCard, type ComparisonRunContext } from './ComparisonRunCard';
import { drawableModels } from '../lib/pictureRecipes';
import { installedAudioEntries } from '../lib/audioLineup';
import { LabComparison } from './LabComparison';
import { useLabResults } from '../hooks/useLabResults';
import { BALANCE_NOTCHES, balanceLabel, notchAt } from '../lib/balance';
import { ShowMarquee } from './ShowMarquee';
import { setShowExtras, useShowExtras, useShowStage } from '../lib/showExtras';
import { TROJAN_HOST_COPY, ajaxHostLine } from '../lib/trojanStage';
import { HOST_LINES, hostLine } from '../lib/hostScript';
import { BUY_ME_A_COFFEE_URL } from '../lib/appConfig';
import { LOW_DISK_GB } from '../lib/loadLevel';
import { UiIcon } from './icons/UiIcon';
import { AchievementUnlocked } from './AchievementShelf';
import { GetComfyLink } from './GetComfyLink';
import { useShowTheme, type ShowMusicState } from '../hooks/useShowTheme';
import speedDateShow from '../assets/robot-speed-date-show.webp';
import ceremonyStage from '../assets/robot-scorecard-ceremony.webp';
import './SimpleWizard.css';
import './TrojanStage.css';

export type DreamFilterId = DreamTag | 'all';

/** A model prepared for the wizard's Pick grid (App computes fit/copy). */
export type WizardModel = {
  row: ModelRow;
  name: string;
  epithet: string;
  goodForLine: string;
  fitTier: 'great' | 'well' | 'slower';
  /** Concrete fit, e.g. "4.7 of 12 GB" — the grid is pre-filtered to
   *  models that fit, so the tier alone reads identically on every card. */
  fitDetail: string;
  dreamTags: DreamTag[];
  /** How many size/quant variants this card is standing in for (> 1 only when
   *  siblings were collapsed). Beginners were shown every variant as its own
   *  near-identical card — "many versions of Gemma 4... I don't know how these
   *  parameters/differences work" was the first outside review's top confusion. */
  variantCount?: number;
};

/**
 * The run, as the App actually sends it.
 *
 * This was a hand-copied subset of RunProgress, and it lost a field every time
 * one was added upstream. It had already dropped `message`, so Simple Mode
 * discarded every failure reason it was handed and left beginners on a frozen
 * game show with no explanation. It then dropped `questionType`, so the screen
 * had to guess what a question was testing from its label — and captioned a
 * live Tiananmen Square question "Everyday questions".
 *
 * Two silent data losses from one hand-maintained duplicate is enough. The App
 * passes RunProgress; this is RunProgress.
 */
type SimpleRunProgress = RunProgress | null;

export type { StepId };

/** The host's line, the progress noun and the board's note, per round. */
const ROUND_LINES: Record<'code' | 'vision' | 'listening', { host: string; unit: string; note: string }> = {
  code: {
    host: 'Coding round! Everyone answers the same questions first, then builds the same small app — and you can open what they hand in.',
    unit: 'questions',
    note: 'Every one of these answered the same questions and built the same app on your PC. Open the winner and click around: that is the other half of the test.',
  },
  vision: {
    host: 'Picture round! Everyone sees the same picture and tells me what is in it — no peeking at each other.',
    unit: 'pictures',
    note: 'Every one of these was shown the same picture on your PC, and the score is how much of it they named.',
  },
  listening: {
    host: 'Listening round! Everyone hears the same recording, and they all get the same questions about it.',
    unit: 'recordings',
    note: 'Every one of these heard the same recording on your PC.',
  },
};

/**
 * One tab per thing RigMatch measures.
 *
 * It asked about five and tested seven: reading a picture, listening to a
 * recording and making music or sound effects were only reachable in Advanced
 * Mode, so a beginner who wanted one of those had no way to say so and no
 * reason to think the app could do it.
 */
const GOAL_TABS: Array<{ id: DreamFilterId; label: string }> = [
  { id: 'talk', label: 'Chat' },
  { id: 'write', label: 'Writing' },
  { id: 'code', label: 'Code' },
  { id: 'read-image', label: 'Reads pictures' },
  { id: 'hear', label: 'Listens' },
  { id: 'image', label: 'Makes pictures' },
  { id: 'video', label: 'Makes video' },
  { id: 'audio', label: 'Makes sound' },
  { id: 'all', label: 'Show everyone' },
];

type SimpleWizardProps = {
  system: SystemProfile;
  /** Ollama or LM Studio answered: either is enough to test what is installed. */
  ollamaReady: boolean;
  /**
   * LM Studio answered and Ollama did not. The setup screen said "Ollama found
   * and running" anyway, and the pick list offered downloads that waited in
   * line forever, because downloads go through Ollama.
   */
  lmStudioOnly?: boolean;
  isScanning: boolean;
  onCheckComputer: () => void;
  onGetOllama: () => void;
  // The same one-click installer Advanced Mode offers. Beginners need it more
  // than power users do, so Simple Mode must not just link out to a website.
  ollamaInstallProgress: OllamaInstallProgress;
  onStartOllamaInstall: () => void;
  onLaunchOllamaInstaller: (path: string) => void;
  wizardModels: WizardModel[];
  modelsLoading: boolean;
  shortlistIds: Set<string>;
  shortlistedRows: ModelRow[];
  onTogglePick: (row: ModelRow) => void;
  /**
   * ComfyUI's part in "is this computer ready?", when the goals need it.
   *
   * Setup checked Ollama, the graphics card and disk space, then said "You're
   * all set!". For someone whose goal was making pictures that sentence was
   * simply untrue: the program that makes them was never looked for, and the
   * refusal did not arrive until the download three steps later.
   *
   * Absent when no chosen goal needs ComfyUI, because someone who only wants a
   * chat model should not be told about a program they will never install.
   */
  comfySetup?: {
    /** A chosen goal runs through ComfyUI. Nothing below renders without this. */
    needed: boolean;
    /** Reachable AND holding a checkpoint that can actually draw. */
    ready: boolean;
    checkpoint?: string | null;
    /** ComfyUI answered at all, whether or not it can draw yet. */
    reachable?: boolean;
  } | null;
  /** The dream matching the first-run goal choice, so PICK opens on it. */
  initialDream?: DreamFilterId;
  /** What the show should test: the chip the Pick step is standing on. */
  onDreamChange?: (dream: DreamFilterId) => void;
  /** What this show is measuring, which is what the host announces. */
  round?: 'chat' | 'code' | 'vision' | 'listening';
  /**
   * Something the app needs this user to read — a refusal, a blocked queue, a
   * failed run. Advanced Mode shows these in the Ticker, which is Advanced-only,
   * so without this Simple Mode is mute by construction.
   */
  notice?: string | null;
  onDismissNotice?: () => void;
  /**
   * Reopens the report for the finished run. Absent when there is none, which
   * is what turns the Compare step from dead into disabled.
   */
  onOpenRunReport?: () => void;
  /**
   * Something the user can do about the notice, offered beside it.
   *
   * Without this a notice can only describe a problem, which was fine until one
   * of them said to open Settings — a panel Simple Mode does not have. A fix
   * named somewhere unreachable is not a fix.
   */
  noticeAction?: { label: string; run: () => void | Promise<void> } | null;
  /** Fills the lineup from the cards on screen, for people who can't choose. */
  onChooseForMe: (cards: WizardModel[]) => void;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  onStartDownloads: () => void;
  /** Cancels the whole download queue. Advanced Mode has always had this; the
   *  beginners' mode was the one place a multi-GB download couldn't be stopped
   *  (first outside review: "would be nice to have a stop/cancel button …
   *  oh its on advanced"). */
  onCancelDownloads: () => void;
  isListTesting: boolean;
  /** True while any benchmark is running (renderer or main-process state). */
  benchmarkActive: boolean;
  runProgress: SimpleRunProgress;
  /**
   * Opens the run sheet for the show. `begin` is called once the sheet is
   * confirmed, which is when the wizard moves to its show step.
   */
  onStartShow: (begin: () => void, options?: { settingsOpen?: boolean }) => void;
  onStopShow: () => void;
  /** What the show will ask, for the Pick footer, e.g. "10 questions, General." */
  planLine?: string;
  /**
   * How much accuracy counts against speed in the show: asked as it starts,
   * and shown beside the result.
   */
  balance: number;
  onBalanceChange: (value: number) => void;
  winner: {
    model: string;
    score: number;
    scoreLabel: string;
    grade: string;
    /** The measurements behind the score, when the round has them (questions do; a skill round does not). */
    measures?: Array<{ label: string; value: number }>;
  } | null;
  /**
   * What this PC can generate, which the Pick grid deliberately excludes.
   * Without it the empty grid was described as "no contestants can make video
   * on this PC" — a claim about the machine that the grid cannot support.
   */
  generation?: {
    image: { total: number; installed: number; names: string[] };
    video: { total: number; installed: number; names: string[] };
    audio: { total: number; installed: number; names: string[] };
  };
  /** Every model in the lineup that has a score, best first. */
  lineupResults?: Array<{
    model: string;
    name: string;
    scoreLabel: string;
    total: number;
    grade: string;
    /** A second measurement from the same show, e.g. the questions behind an app score. */
    note?: string;
  }>;
  /** Contestants in this show that could not finish; the show went on without them. */
  droppedOut?: RunFailure[];
  onChatWithWinner: () => void;
  onOpenScorecard: () => void;
  /** Where the step tracker goes: the app's top bar. */
  trackerSlot?: HTMLElement | null;
  /** Opens the shareable scorecard image for the winning model. */
  onShareScore: () => void;
  onRunAgain: () => void;
  onSwitchToAdvanced: () => void;
  /** Where the wizard was last time it was mounted. Switching to Advanced and
   *  back used to unmount this component and drop the user at step 1. */
  initialStep?: StepId;
  onStepChange?: (step: StepId) => void;
  /**
   * The video race, for the "A video maker" chip.
   *
   * Video makers cannot join Speed Dating — they render instead of chatting —
   * and the chip used to end there, sending a beginner to Advanced Mode to find
   * out what their PC could make. The same race runs here instead: one idea for
   * every model, fastest first, the clips side by side.
   */
  videoLineup?: {
    comfyReachable: boolean;
    comfyFolders: ComfyFolderListing;
    judgeModel: string;
    ollamaBaseUrl: string;
    onCheckComfy: () => void;
    onDownloadModel: (generationId: string) => void;
    onStopDownload: () => void;
    /** The Video fader, asked before the race and moving the leaderboard after. */
    balance: number;
    onBalanceChange: (value: number) => void;
  };
  /**
   * The image and sound makers' run, for their two chips.
   *
   * Same reason as the video race above, and the same card Advanced Mode's
   * Comparison screen runs, so the two can never measure differently. Simple
   * Mode's copy of it accepts a single maker: one installed checkpoint is the
   * ordinary first install, and refusing to measure it is the dead end these
   * chips used to be.
   */
  makerRun?: {
    context: ComparisonRunContext;
    /** Each maker channel's fader, already 0 where nothing can judge. */
    balances: { images: number; audio: number };
  };
};

export function SimpleWizard(props: SimpleWizardProps) {
  const { ollamaReady, shortlistedRows, winner, benchmarkActive } = props;

  /**
   * Put the notice where the click was.
   *
   * It renders at the top of the wizard, and the controls that raise it can be
   * most of a screen below. Pressing "Find ComfyUI for me" in the setup card
   * ran the search, wrote the answer into the notice, and looked from the
   * user's seat like the button did nothing at all — the same failure the
   * notice exists to prevent.
   */
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.notice) return;
    // Instant, not smooth. Measured in the Chromium this ships on: a smooth
    // scrollIntoView leaves scrollTop untouched, so the version of this fix
    // that asked for smooth did nothing at all — it re-created the bug it was
    // written to close. 'auto' lands, and is what reduced-motion wanted anyway.
    noticeRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [props.notice]);

  const setupDone = ollamaReady;
  // Lifted from Setup so the host can say what the page says. He went on
  // promising "One click and I'll handle the rest" beside "We couldn't find
  // Ollama", the one place a newcomer has to do something themselves.
  const [setupAttempted, setSetupAttempted] = useState(false);
  // A finished check counts, the one at launch included: it had already
  // told the notice that Ollama was missing while the page still offered
  // "Check my computer" and the host promised one click would do.
  const [wasScanning, setWasScanning] = useState(props.isScanning);
  if (wasScanning !== props.isScanning) {
    setWasScanning(props.isScanning);
    if (!props.isScanning) setSetupAttempted(true);
  }
  const minPicks = minPicksFor(props.round);
  const pickDone = shortlistedRows.length >= minPicks;
  const {
    canContinue: downloadCanContinue,
    allInstalled: downloadAllInstalled,
    blockedReason: downloadBlockedReason,
  } = summarizeDownloadStep(
    shortlistedRows.map((row) => getDownloadRowStatus(row.installed, props.pullProgressByModel[row.displayName])),
  );
  const downloadDone = pickDone && downloadCanContinue;
  // Once the user starts a show, Compare stays incomplete until that run
  // actually finishes. Inferring from `winner && !benchmarkActive` alone was
  // racy: at the moment the step advances the run hasn't flipped to active yet,
  // so a pre-existing Top Match made Compare instantly "done" — the wizard
  // skipped the whole Compare stage and crowned the OLD winner, and mid-run the
  // "Meet the winner" button stayed enabled and would declare a result from
  // partial data.
  const [awaitingRun, setAwaitingRun] = useState(false);
  const sawRunActive = useRef(false);
  useEffect(() => {
    if (!awaitingRun) { sawRunActive.current = false; return; }
    if (benchmarkActive) { sawRunActive.current = true; return; }
    // Released once the run we started goes inactive again — whether it finished,
    // failed, or the user stopped it. Waiting only for phase 'complete' would
    // strand the user on Compare with a disabled Next if the run ended any other way.
    const phase = props.runProgress?.phase;
    if (sawRunActive.current || phase === 'complete' || phase === 'failed') setAwaitingRun(false);
  }, [awaitingRun, benchmarkActive, props.runProgress?.phase]);

  // A finished show, whether or not it crowned anyone. Rounds can end with
  // every contestant short of the pass line — and gating the last step on a
  // winner left that show with Meet the winner locked, forever, saying nothing.
  //
  // A failed show is not a finished one. Counting it as ended sent a show that
  // stopped before anyone finished — a one-model lineup, Ollama quitting, Stop
  // pressed on the first model — to the Winner screen, where the host said "We
  // have a match!" over "Run the show to crown your Top Match." It stays on
  // Compare, which says why and offers to run it again. A show where some models
  // failed and others finished completes, and goes to Winner.
  // A show's own failure only: a single test failing in Advanced writes to the
  // same progress, and must not lock this wizard.
  const showFailed = props.runProgress?.phase === 'failed' && props.runProgress.mode === 'speed-date';
  const showEnded = props.runProgress?.phase === 'complete';
  const compareDone = !awaitingRun && !benchmarkActive && !showFailed && (Boolean(winner) || showEnded);
  const winnerDone = compareDone;

  // Not manually memoized: React Compiler handles this, and a hand-written
  // useMemo here made it bail on the whole component ("existing memoization
  // could not be preserved") once downloadDone started deriving from the
  // download-progress map. Five booleans into two small objects is exactly what
  // the compiler is for.
  const stepState = (() => {
    const done: Record<StepId, boolean> = { setup: setupDone, pick: pickDone, download: downloadDone, compare: compareDone, winner: winnerDone };
    const unlocked: Record<StepId, boolean> = {
      setup: true,
      pick: setupDone,
      download: pickDone,
      compare: downloadDone,
      winner: compareDone,
    };
    return { done, unlocked };
  })();

  const furthestStep: StepId = !setupDone ? 'setup' : !pickDone ? 'pick' : !downloadDone ? 'download' : !compareDone ? 'compare' : 'winner';
  // Opens where the user left off. A first visit starts at Setup — it's a guided
  // wizard, so it launches at step one rather than jumping to the furthest
  // unlocked step — but toggling to Advanced and back must not reset progress.
  const [chosenStep, setChosenStep] = useState<StepId>(props.initialStep ?? 'setup');

  // Derive the visible step: honor the user's choice, but clamp to the furthest
  // unlocked step if a prerequisite was lost, and auto-advance Compare -> Winner
  // once the show crowns a match. Deriving avoids setState-in-effect churn.
  // A failed show keeps its own screen, which says what went wrong, even when
  // the failure also undid an earlier step: Ollama quitting mid-show used to
  // drop the user back on "Welcome to RigMatch!" with only a toast to explain.
  const step: StepId = compareDone && chosenStep === 'compare'
    ? 'winner'
    : chosenStep === 'compare' && showFailed ? 'compare'
      : stepState.unlocked[chosenStep] ? chosenStep : furthestStep;
  const setStep = (next: StepId) => {
    setChosenStep(next);
    props.onStepChange?.(next);
  };

  // Only offer "Stop the show" while a show is actually running. Keyed to the
  // step alone, a finished or failed run left Compare with no Back button at
  // all — the one screen a beginner could get stranded on.
  const showRunning = step === 'compare' && benchmarkActive;
  // The theme song, if it is on: it loops while the contestants answer, and
  // the show's ending picks the sting — ta-da for a winner, a sad trombone for
  // a show that stopped or where nobody passed. A listening round is for the
  // ears, so nothing plays over it.
  const extras = useShowExtras();
  const stage = useShowStage();
  // The host's Ajax lines: who is in the lineup, who is answering, and whether
  // a judge has marked them yet. "Judged" is kept for the rest of that model's
  // turn, so the host does not flip back and forth between questions.
  const progress = props.runProgress;
  const [judged, setJudged] = useState<{ run?: string; models: string[] }>({ models: [] });
  if (progress?.questionPhase === 'judging' && progress.currentModel
    && !(judged.run === progress.progressId && judged.models.includes(progress.currentModel))) {
    setJudged({
      run: progress.progressId,
      models: [...(judged.run === progress.progressId ? judged.models : []), progress.currentModel],
    });
  }
  const ajaxLine = ajaxHostLine({
    step,
    lineup: shortlistedRows.map((row) => row.displayName),
    currentModel: progress?.currentModel,
    judged: Boolean(progress?.currentModel && judged.run === progress.progressId && judged.models.includes(progress.currentModel)),
    questionScores: progress?.questionScores,
  });
  const musicState: ShowMusicState = showRunning ? 'running'
    : step === 'compare' && showFailed ? 'flopped'
      : step === 'winner' && winner ? 'crowned'
        : step === 'winner' && (props.lineupResults?.length ?? 0) > 0 ? 'flopped'
          : 'idle';
  useShowTheme(musicState, extras.music && props.round !== 'listening');
  const stepIndex = STEPS.indexOf(step);
  // Compare is only "complete" once the show has actually finished — leaving it
  // true mid-run let a beginner click through to a winner crowned on partial data.
  const stepComplete: Record<StepId, boolean> = {
    setup: setupDone,
    pick: pickDone,
    download: downloadDone,
    compare: compareDone && !benchmarkActive,
    winner: true,
  };

  // Nothing to fetch means Download is a no-op: it rendered full green progress
  // bars, claimed a download was happening, and quoted an ETA for work that had
  // already been done. Skip it in both directions rather than showing theater.
  const skipDownload = downloadAllInstalled;

  // Every run goes through the sheet, which also asks what matters more. The
  // step moves on only once it is confirmed; Cancel leaves the wizard where it was.
  const begin = () => {
    // Set synchronously so the derived step can't promote Compare -> Winner
    // in the gap before the run reports itself as active.
    setAwaitingRun(true);
    setStep('compare');
  };
  const startShow = () => props.onStartShow(begin);
  // "Change" beside "10 questions, General": the same sheet, with its folded
  // settings open. It opened exactly as Start did once they were folded away.
  const changePlan = () => props.onStartShow(begin, { settingsOpen: true });

  const goNext = () => {
    if (step === 'pick') {
      if (skipDownload) { startShow(); return; }
      props.onStartDownloads();
    }
    if (step === 'download') { startShow(); return; }
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => {
    if (step === 'compare' && skipDownload) { setStep('pick'); return; }
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  // While anything is queued or pulling, the footer's Back slot becomes "Stop
  // downloads": mid-download, stopping is worth more than navigating — and Back
  // alone would leave a multi-GB queue running invisibly behind the Pick screen.
  const downloadsActive = step === 'download' && Object.values(props.pullProgressByModel)
    .some((p) => p.phase === 'queued' || p.phase === 'started' || p.phase === 'pulling' || p.phase === 'paused');

  // Size + time on the commitment buttons: "Download 5 models" with no GB and no
  // ETA is the scariest unqualified ask in the flow, and the data is right here.
  const pendingGb = shortlistedRows
    .filter((row) => !row.installed)
    .reduce((sum, row) => sum + (row.sizeGb ?? 0), 0);
  const downloadSuffix = pendingGb > 0 ? ` · ${pendingGb.toFixed(1)} GB` : ' · already on your PC';
  const showMinutes = Math.max(1, Math.round(shortlistedRows.length * 3));

  const nextLabel: Partial<Record<StepId, string>> = {
    // "Download 5 models · already on your PC" contradicted itself inside one
    // label. When nothing needs downloading, this button starts the show.
    pick: shortlistedRows.length === 0
      ? `Pick ${minPicks} or more`
      : skipDownload
      ? `Start the show · about ${showMinutes} min`
      : `Download ${shortlistedRows.length} model${shortlistedRows.length === 1 ? '' : 's'}${downloadSuffix}`,
    download: `Start the show · about ${showMinutes} min`,
  };

  // The host's line for where the show is. Ajax and the Trojan stage have
  // their own say; a stopped show is said plainly, over everything.
  const failedDownload = step === 'download'
    ? shortlistedRows.find((row) => getDownloadRowStatus(row.installed, props.pullProgressByModel[row.displayName]) === 'failed')
    : undefined;
  const questionNumber = (progress?.questionIndex ?? 0) + 1;
  // Only when the judge is marking its own answer. Any judge in the lineup used
  // to set this off, so with a contestant judging the others the host said
  // "marking its own homework" over and over, about answers that weren't.
  const judgeOnStage = progress?.questionJudge && progress.questionJudge === progress.currentModel
    ? progress.questionJudge : null;
  const scriptLine = (() => {
    switch (step) {
      case 'setup':
        return props.isScanning ? hostLine('setupChecking', {}, shortlistedRows.length)
          : ollamaReady && props.system.gpu.vramGb ? hostLine('setupDone', { vram: Math.round(props.system.gpu.vramGb) })
            : setupAttempted && !ollamaReady ? hostLine('setupNoOllama')
              : hostLine('setupIdle');
      case 'pick':
        return hostLine(shortlistedRows.length >= 5 ? 'pickFull' : 'pick', {}, shortlistedRows.length);
      case 'download':
        return failedDownload
          // "We'll carry on with the others" only when there are enough of them.
          ? hostLine('downloadFailed', { name: getFriendlyModelName(failedDownload.displayName) }, downloadBlockedReason ? 1 : 0)
          : pendingGb > 0 ? hostLine('download', { gb: pendingGb.toFixed(1) }) : hostLine('download', {}, 1);
      case 'compare':
        if (props.round && props.round !== 'chat') return ROUND_LINES[props.round].host;
        if (judgeOnStage) return hostLine('selfJudge', { name: getFriendlyModelName(judgeOnStage) });
        if (!progress?.currentModel) return "It's showtime! Everyone gets the same questions, no favorites.";
        {
          // Between contestants the question type is not known yet, and the
          // round line said "Round 1: the next question." Skip that line then.
          const topic = roundLabel(progress.questionType)?.toLowerCase();
          const turn = !topic && questionNumber % HOST_LINES.dating.length === 1 ? 0 : questionNumber;
          return hostLine('dating', { name: getFriendlyModelName(progress.currentModel), q: questionNumber, topic }, turn);
        }
      case 'winner':
        return winner ? hostLine('winner', { name: getFriendlyModelName(winner.model) }, shortlistedRows.length)
          : (props.lineupResults?.length ?? 0) > 0 ? hostLine('noWinner') : hostLine('pick');
      default:
        return '';
    }
  })();
  const hostSays = step === 'compare' && showFailed
    ? (progress?.failureKind === 'stopped' ? hostLine('stopped', {}, shortlistedRows.length)
      : "That didn't go to plan. Here's what happened, and we can go again whenever you're ready.")
    : ajaxLine ?? (stage === 'trojan' ? TROJAN_HOST_COPY[step] : scriptLine);

  // Only Pick and Download have a footer: Setup's one button is on the page,
  // the running show has no next step to offer, and the winner's doors are
  // its own actions.
  const footerStep = step === 'pick' || step === 'download';

  const tracker = (
    <nav className="sw-steps" aria-label="Wizard steps">
      {/* A skipped Download step is dropped from the stepper entirely rather
          than left sitting there permanently incomplete. */}
      {STEPS.filter((id) => !(id === 'download' && skipDownload)).map((id, index) => {
        const isActive = id === step;
        const isDone = stepState.done[id] && !isActive;
        const isLocked = !stepState.unlocked[id] && !isActive;
        const cls = isActive ? 'active' : isDone ? 'done' : 'locked';
        /**
         * Compare, once the show has crowned someone, opens the report.
         *
         * The step derivation auto-advances compare -> winner as soon as a
         * match exists, which is right: after the show the winner is the
         * point. The side effect was a button styled `done`, not disabled,
         * that did nothing at all when clicked — setStep('compare') simply
         * resolved back to 'winner'.
         *
         * Opening the report is what the word already promises, and in
         * Simple Mode it is the only route to the transcript at all: there
         * is no side menu here, so the Comparison screen does not exist.
         * With no report to open it is disabled rather than dead.
         */
        const opensReport = id === 'compare' && compareDone;
        const clickable = opensReport ? Boolean(props.onOpenRunReport) : isDone;
        return (
          <div className="sw-step-wrap" key={id}>
            {index > 0 && <i className="sw-step-dash" aria-hidden="true" />}
            <button
              type="button"
              className={`sw-step ${cls}`}
              onClick={() => {
                if (!clickable) return;
                if (opensReport) props.onOpenRunReport?.();
                else setStep(id);
              }}
              title={opensReport
                ? (props.onOpenRunReport ? 'See how the models answered' : 'No saved report for this run')
                : undefined}
              disabled={!clickable && !isActive}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="sw-step-mark" aria-hidden="true">
                {isDone ? <Check /> : isLocked ? <Lock /> : id === 'winner' && isActive ? <Trophy /> : index + 1}
              </span>
              {/* The label is the button's name. Narrow windows hide it from
                  view, never from screen readers — display: none did both,
                  and with the mark aria-hidden every step was just "button". */}
              <span className="sw-step-label">{STEP_LABELS[id]}</span>
              {/* Done is shown only as a check mark, which is aria-hidden.
                  Locked says itself through disabled, current through
                  aria-current. */}
              {isDone && <span className="sr-only">, done</span>}
            </button>
          </div>
        );
      })}
    </nav>
  );

  return (
    <InfoViewProvider>
    <div className={stage === 'trojan' ? 'sw-shell stage-trojan' : 'sw-shell'}>
      {/* The step tracker sits in the app's top bar, beside the badge case, theme
          and mode switch, which the bar now carries for both modes. Without a
          bar to sit in (a test, say) it falls back to its own header. */}
      {props.trackerSlot ? createPortal(tracker, props.trackerSlot) : <header className="sw-header">{tracker}</header>}

      {/* The main landmark and the page's one h1, so a screen reader can jump
          straight to the step: Simple Mode had neither, and each step's own
          title is an h2 under this. */}
      <main className="sw-content">
        <h1 className="sr-only">RigMatch Simple Mode, step {stepIndex + 1} of {STEPS.length}: {STEP_LABELS[step]}</h1>
        <HostStrip line={hostSays} />

        {props.notice && (
          <div className="sw-notice" role="status" ref={noticeRef}>
            <UiIcon name="warn" size={20} />
            <p>{props.notice}</p>
            {props.noticeAction && (
              <button
                type="button"
                className="btn btn-line btn-sm sw-notice-fix"
                onClick={() => void props.noticeAction?.run()}
              >
                {props.noticeAction.label}
              </button>
            )}
            {props.onDismissNotice && (
              <button type="button" className="btn btn-link" onClick={props.onDismissNotice}>Got it</button>
            )}
          </div>
        )}

        {step === 'setup' && <SetupScreen {...props} attempted={setupAttempted} onAttempt={() => setSetupAttempted(true)} onContinue={() => setStep('pick')} />}
        {step === 'pick' && <PickScreen {...props} />}
        {step === 'download' && <DownloadScreen {...props} />}
        {step === 'compare' && <CompareScreen {...props} onRetry={startShow} onChangeLineup={() => setStep('pick')} />}
        {step === 'winner' && <WinnerScreen {...props} onRunAgain={() => setStep('pick')} />}
      </main>

      {footerStep && (
        <footer className="sw-footer">
          <div className="sw-footer-left">
            <button
              type="button"
              className="btn btn-line"
              onClick={downloadsActive ? props.onCancelDownloads : goBack}
              title={downloadsActive ? 'Stops after the current file. Anything already downloaded stays on your PC.' : undefined}
            >
              {downloadsActive ? 'Stop downloads' : 'Back'}
            </button>
          </div>
          {step === 'pick'
            ? (
              <LineupTray
                shortlistedRows={shortlistedRows}
                onRemove={props.onTogglePick}
                minPicks={minPicks}
                plan={props.planLine}
                // Changing the questions opens the run sheet, which starts the
                // show; with downloads still to do, the sheet comes after them.
                onChangePlan={skipDownload && pickDone && props.round !== 'vision' && props.round !== 'listening' ? changePlan : undefined}
              />
            )
            : <span className="sw-footer-hint">{step === 'download' && downloadBlockedReason ? downloadBlockedReason : footerHint(step, ollamaReady, shortlistedRows.length, minPicks, showFailed)}</span>}
          <div className="sw-footer-right">
            <button
              type="button"
              className="btn btn-gold"
              onClick={goNext}
              disabled={!stepComplete[step]}
              title={stepComplete[step] ? undefined : nextBlockedHint(step, downloadBlockedReason, showFailed, shortlistedRows.length, minPicks)}
            >
              {nextLabel[step]}
            </button>
          </div>
        </footer>
      )}
    </div>
    </InfoViewProvider>
  );
}

/**
 * The Host, who narrates the step until you point at something you do not know
 * — then he explains that instead, and goes back to narrating when you stop.
 *
 * One voice, one place to look. A separate info panel would have been a second
 * thing to notice, and the whole problem is that a beginner does not know what
 * to look for.
 */
export function HostStrip({ line }: { line: string }) {
  const explaining = useExplaining();
  return (
    <div className={`sw-host-strip${explaining ? ' explaining' : ''}`}>
      <img className="sw-host-avatar" src={HOST_AVATAR_SRC} alt="" />
      {/* The narration stays in the layout at a constant height; the
          explanation is layered ON TOP of it rather than replacing it, so
          nothing below the host moves when the pointer crosses a term. */}
      <div className="sw-host-bubble">
        <p className="sw-host-line">{line}</p>
        {explaining && (
          <div className="sw-host-explain" role="status">
            <span>{explaining.term}</span>
            <p>{explaining.plain}</p>
            {explaining.because && <p className="sw-host-because">{explaining.because}</p>}
            {explaining.alsoCalled && (
              <p className="sw-host-also">Sometimes called “{explaining.alsoCalled}”.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The studio's APPLAUSE sign: unlit scenery until a contestant finishes a
 * turn, then it blinks. Never the only way anything is said — the status line
 * announces each finish — so it is hidden from assistive technology.
 */
function ApplauseSign({ lit }: { lit: boolean }) {
  return <div className={lit ? 'sw-applause lit' : 'sw-applause'} aria-hidden="true">Applause</div>;
}

// ---------------------------------------------------------------------------
// Setup

function SetupScreen({
  system,
  ollamaReady,
  lmStudioOnly,
  isScanning,
  onCheckComputer,
  onGetOllama,
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
  comfySetup,
  attempted,
  onAttempt,
  onContinue,
}: SimpleWizardProps & { attempted: boolean; onAttempt: () => void; onContinue: () => void }) {
  const checked = ollamaReady; // a successful check makes Ollama ready
  const gpu = system.gpu.model || 'Graphics card not identified';
  const vram = system.gpu.isUnifiedMemory ? 0 : Math.round(system.gpu.vramGb || 0);
  const freeGb = Math.round(system.storage.availableGb || 0);
  const memoryGb = Math.round(system.memory.totalGb || 0);
  // Only surface the "couldn't find Ollama" card after the user actually ran a
  // check that came back not-ready — never on first load before they've clicked.
  // For a Linux user on first run this copy button is the only way forward, and
  // it used to fail in total silence.
  const [copiedCommand, setCopiedCommand] = useState<CopyState>('idle');
  const runCheck = () => { onAttempt(); onCheckComputer(); };
  // Only "missing" when a goal actually needs it. No goal needing ComfyUI means
  // there is nothing missing, however absent ComfyUI happens to be.
  const comfyMissing = Boolean(comfySetup?.needed) && !comfySetup?.ready;
  const failed = attempted && !checked && !isScanning;

  // Install-flow state. Linux gets a copyable one-liner (no installer binary);
  // Windows/macOS get the in-app download → launch handoff.
  const install = ollamaInstallProgress;
  const isDesktop = typeof window !== 'undefined' && Boolean((window as { agentArcade?: unknown }).agentArcade);
  const isLinux = system.platform === 'linux';
  const isLinuxScript = install.phase === 'script' && 'command' in install;
  const installerReady = install.phase === 'ready' && 'installerPath' in install;
  const installDownloading = install.phase === 'downloading' && 'percent' in install;
  const installFailed = install.phase === 'error' && 'error' in install;

  return (
    <div className="sw-setup">
      <h2>{checked && !isScanning ? (comfyMissing ? 'Almost there: one more program' : 'Your computer is ready') : failed ? (comfyMissing ? 'Two programs to get' : 'One program to get') : "Let's check your computer"}</h2>
      {/* Said aloud when the check finishes, in the words of the headline. The
          button that started it changes, so nothing else told a screen reader
          the check had finished, or how. */}
      <p className="sr-only" role="status">
        {isScanning
          ? 'Checking your computer…'
          : checked
            ? (comfyMissing ? 'Almost there: one more program' : 'Your computer is ready')
            : attempted ? "We couldn't find Ollama" : ''}
      </p>

      {!checked && !failed && (
        <>
          <p className="sw-setup-lede">
            RigMatch looks at your <Explain id="graphics-card">graphics card</Explain> and memory, works out
            which AI models will run well, then has them compete so you can crown a winner. Everything stays
            on your PC: no account, no cloud.
          </p>
          <p className="sw-setup-explainer">
            <strong>What's a <Explain id="model">model</Explain>?</strong> A program that runs on your own
            computer. It can chat, help you write, explain code or make pictures. They're free, there are
            hundreds, and which one is best depends on your machine.
          </p>
        </>
      )}

      {/* Shown when Ollama is missing too: whether this PC is worth the
          install is the question a newcomer has before running one. */}
      {/* Not when the check itself failed: its placeholders ("0 GB free")
          would read as findings. */}
      {(checked || (failed && memoryGb > 0)) && !isScanning && (
        <ul className="sw-found" aria-label="What RigMatch found">
          <FoundRow label="Graphics card" value={vram ? `${gpu} · ${vram} GB video memory` : gpu} />
          {memoryGb > 0 && <FoundRow label="Memory" value={`${memoryGb} GB`} />}
          <FoundRow label="Disk space" value={`${freeGb} GB free for models`} warn={freeGb < LOW_DISK_GB} />
          {failed ? null : lmStudioOnly ? (
            <>
              <FoundRow label="LM Studio" value="Found and running. The models you have in it can take part." />
              <FoundRow
                label="Ollama"
                warn
                value={<>Not running. RigMatch downloads new models through <Explain id="ollama">Ollama</Explain>, so until it is installed you can test only what is already in LM Studio.</>}
              />
            </>
          ) : (
            <FoundRow label="Ollama" value={<><Explain id="ollama">Ollama</Explain> found and running</>} />
          )}
          {comfySetup?.needed && (
            <FoundRow
              label="ComfyUI"
              warn={!comfySetup.ready}
              value={comfySetup.ready
                ? `Running${comfySetup.checkpoint ? ` with ${comfySetup.checkpoint}` : ''}`
                // Running and able to draw are different claims; this one used
                // to say "Not found" about a ComfyUI that was answering.
                : comfySetup.reachable
                  ? 'Running, but it has no picture model yet. Pick one in the next step and RigMatch downloads it into ComfyUI.'
                  : 'Not running. You picked something that makes pictures or video, which is ComfyUI’s job: a separate free program. Everything else works without it.'}
            >
              {!comfySetup.ready && !comfySetup.reachable && <GetComfySteps platform={system.platform} arch={system.arch} />}
            </FoundRow>
          )}
        </ul>
      )}

      {failed && (
        <div className="sw-setup-error">
          <h3>We couldn't find Ollama</h3>
          <p>
            RigMatch needs <Explain id="ollama">Ollama</Explain>, a free program that does the actual work of
            running models on your PC.
            {isLinux ? (
              <> Copy the one-line command below into a <Explain id="terminal">terminal</Explain>, then check again.</>
            ) : (
              " RigMatch can download and start the installer for you, without leaving this window."
            )}
          </p>

          {isLinuxScript ? (
            <div className="sw-install-script">
              <code>{install.command}</code>
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => void copyText(install.command).then((ok) => {
                  setCopiedCommand(ok ? 'copied' : 'failed');
                  window.setTimeout(() => setCopiedCommand('idle'), 2400);
                })}
              >
                {copiedCommand === 'copied' ? 'Copied' : copiedCommand === 'failed' ? 'Select it above instead' : 'Copy'}
              </button>
            </div>
          ) : installerReady ? (
            <div className="sw-setup-actions">
              <button type="button" className="btn btn-gold" onClick={() => onLaunchOllamaInstaller(install.installerPath)}>
                Run the installer
              </button>
              {/* App polls for Ollama every 15 s until it answers, then re-checks. */}
              <span className="sw-muted">Follow Ollama's prompts. RigMatch notices when it's running.</span>
            </div>
          ) : installDownloading ? (
            <div className="sw-install-progress">
              <div className="sw-install-progress-bar"><i style={{ width: `${install.percent}%` }} /></div>
              <span className="sw-muted">Downloading Ollama… {install.percent}%</span>
            </div>
          ) : (
            <div className="sw-setup-actions">
              <button type="button" className="btn btn-gold" onClick={isDesktop ? onStartOllamaInstall : onGetOllama}>
                {installFailed ? 'Try the download again' : isLinux ? 'Show the install command' : 'Install Ollama for me'}
              </button>
              <button type="button" className="btn btn-line" onClick={onGetOllama}>
                Open ollama.com
              </button>
            </div>
          )}

          {installFailed && <p className="sw-muted">{install.error}</p>}

          <button type="button" className="btn btn-link" onClick={runCheck}>Check again</button>
        </div>
      )}

      {!failed && (
        <div className="sw-setup-actions">
          {checked && !isScanning ? (
            <>
              <button type="button" className="btn btn-gold sw-cta" onClick={onContinue}>Choose your models</button>
              <button type="button" className="btn btn-link" onClick={onCheckComputer}>Check again</button>
            </>
          ) : (
            <button type="button" className="btn btn-gold sw-cta" onClick={runCheck} disabled={isScanning}>
              {isScanning ? 'Looking…' : 'Check my computer'}
            </button>
          )}
        </div>
      )}

      {/* Beginners' real fear is "will this break my computer." Name it once,
          here, and truly: it said nothing at all gets installed, right
          under "Install Ollama for me". Models go where Ollama keeps them. */}
      <p className="sw-muted sw-setup-safety">
        {failed
          ? 'Ollama installs like any other program, and the models it downloads can be deleted from RigMatch any time.'
          : "Models download into Ollama's own folder. Nothing else is installed, and you can delete them from RigMatch any time."}
      </p>
    </div>
  );
}

/**
 * How to get ComfyUI, for a newcomer who picked a picture or video goal.
 *
 * ComfyUI Desktop is the one-click installer, and RigMatch finds it by itself
 * once it runs (on 8000, beside the portable build's 8188), so the steps end
 * at "come back" rather than at a settings field. What it needs is said before
 * the download rather than discovered after it (docs.comfy.org): about 5 GB,
 * and on a Mac, Apple silicon and macOS 13.
 */
function GetComfySteps({ platform, arch }: { platform: string; arch: string }) {
  const mac = platform === 'darwin';
  return (
    <div className="sw-get-comfy">
      <ol>
        <li>Get ComfyUI Desktop, the free one-click installer. It needs about 5 GB.</li>
        <li>Open it and let it finish setting up.</li>
        <li>Come back here. RigMatch finds it by itself.</li>
      </ol>
      <p className="sw-muted">
        {mac && arch !== 'arm64'
          ? 'ComfyUI Desktop needs a Mac with Apple silicon (M1 or later). On this Mac it has to be installed by hand, and the download page links the steps.'
          : mac
            ? 'On a Mac it needs Apple silicon and macOS 13 or later.'
            : 'It runs best with an NVIDIA or AMD graphics card.'}
      </p>
      <GetComfyLink />
    </div>
  );
}

function FoundRow({ label, value, warn = false, children }: { label: string; value: ReactNode; warn?: boolean; children?: ReactNode }) {
  return (
    <li className={warn ? 'sw-found-row warn' : 'sw-found-row'}>
      <i className="sw-found-dot" aria-hidden="true" />
      <span className="sw-found-label">{label}</span>
      <span className="sw-found-value">
        <span>{value}</span>
        {children}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Pick

/** "A", "A and B", "A, B and C" — a list a person reads, not an array dump. */
function listNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function PickScreen({
  generation, wizardModels, modelsLoading, shortlistIds, shortlistedRows, onTogglePick, onChooseForMe, initialDream,
  onDreamChange, videoLineup, makerRun, system, pullProgressByModel, benchmarkActive }: SimpleWizardProps) {
  // Opens on the dream matching the splash's primary goal, when there is one
  // — the person already answered this question once.
  const [dream, setDream] = useState<DreamFilterId>(initialDream ?? 'all');
  // Told once on arrival and on every change, so the round that follows tests
  // the thing that was asked for rather than always asking questions.
  useEffect(() => { onDreamChange?.(dream); }, [dream, onDreamChange]);
  const [showAll, setShowAll] = useState(false);
  // Everything measured here, for the maker boards below their run.
  const labResults = useLabResults();
  // The video race's idea, kept here so switching chips and back keeps it.
  const [videoPromptId, setVideoPromptId] = useState(IMAGE_BENCHMARK_PROMPTS[0].id);
  const [videoCustomPrompt, setVideoCustomPrompt] = useState('');
  const lineupFull = shortlistedRows.length >= 5;

  const filtered = useMemo(() => {
    if (dream === 'all') return wizardModels;
    return wizardModels.filter((m) => m.dreamTags.includes(dream as Exclude<DreamFilterId, 'all'>));
  }, [wizardModels, dream]);

  const visible = showAll ? filtered : filtered.slice(0, 9);
  const dreamNoun: Record<DreamTag, string> = {
    talk: 'love a good conversation',
    write: 'are great writing partners',
    code: 'are handy coding buddies',
    'read-image': 'can read a picture you give them',
    hear: 'can listen to a recording',
    image: 'can make images',
    video: 'can make video',
    audio: 'can make music and sound',
  };
  // Image and video makers are deliberately absent from this grid — they
  // cannot be benchmarked — so an empty grid here says nothing about whether
  // this PC can make images or video. It said "No contestants can make video
  // on this PC", which was simply false: the models exist, ship in the
  // catalog, and run. Report what is actually true of the machine.
  const makers = dream === 'video' ? generation?.video
    : dream === 'image' ? generation?.image
      : dream === 'audio' ? generation?.audio
        : undefined;
  const makerNoun = dream === 'video' ? 'video maker' : dream === 'audio' ? 'music and sound maker' : 'image maker';
  const makerCount = (n: number) => `${n} ${makerNoun}${n === 1 ? '' : 's'}`;
  // The picture and sound runs below offer only makers already in ComfyUI.
  // makers.total also counts ones that fit but need downloading, so "2 image
  // makers run on this PC, try them below" sat over a card offering one.
  // Picture makers the card below can download; sound makers have no download there.
  const moreToGet = dream === 'image' && makerRun?.context.comfyReachable ? makerRun.context.toDownload?.length ?? 0 : 0;
  const ready = makerRun && (dream === 'image' || dream === 'audio')
    ? (dream === 'image'
      ? drawableModels(makerRun.context.comfyFolders).length
      : installedAudioEntries(makerRun.context.comfyFolders).length)
    : null;
  const makerLine = !makers || makers.total === 0 ? null
    : ready === null
      ? `${makerCount(makers.total)} ${makers.total === 1 ? 'runs' : 'run'} on this PC. ${dream === 'video' && videoLineup ? `Try ${makers.total === 1 ? 'it' : 'them'} below.` : "They just don't compete here."}`
      : ready > 0
        ? `${makerCount(ready)} ${ready === 1 ? 'is' : 'are'} installed. Try ${ready === 1 ? 'it' : 'them'} below${moreToGet ? `, or download ${moreToGet === 1 ? 'one more that fits' : `${moreToGet} more that fit`}` : ''}.`
        : `${makerCount(makers.total)} ${makers.total === 1 ? 'fits' : 'fit'} this PC, but none is installed yet.${moreToGet ? ' Download one below.' : ''}`;
  const countLine = dream === 'all'
    ? `${filtered.length} contestant${filtered.length === 1 ? '' : 's'} fit your PC`
    : filtered.length === 0
      ? makerLine ?? `No contestants ${dreamNoun[dream]} on this PC`
      : `${filtered.length} contestant${filtered.length === 1 ? '' : 's'} ${dreamNoun[dream]} · all of them fit your PC`;

  return (
    <div className="sw-pick">
      {/* The step's heading, for screen readers only: the host bubble says the
          same thing to the eye, and each card below is an h3 under it. */}
      <h2 className="sr-only">Pick your contestants</h2>
      <div className="sw-goal-tabs" role="group" aria-label="What do you want a model for?">
        {GOAL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="sw-goal-tab"
            aria-pressed={dream === tab.id}
            onClick={() => { setDream(tab.id); setShowAll(false); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="sw-pick-count">
        <span>{modelsLoading ? 'Bringing out the contestants…' : countLine}</span>
        {/* The escape hatch for "I don't know how to choose", which is most of
            this audience. Fills the lineup from the cards for this goal. Not
            gold: Start the show is this step's one next action. No count:
            with big downloads it picks fewer than five. */}
        {!modelsLoading && filtered.length > 0 && shortlistedRows.length === 0 && (
          <button type="button" className="btn btn-line btn-sm sw-choose-for-me" onClick={() => onChooseForMe(filtered)}>
            Not sure? Choose for me
          </button>
        )}
      </div>

      {modelsLoading ? (
        <div className="sw-card-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sw-card sw-card-skeleton" aria-hidden="true" />)}
        </div>
      ) : filtered.length === 0 && (dream === 'image' || dream === 'audio') && makerRun ? (
        // The same answer video gets: a run, here, rather than directions to a
        // mode a beginner has not opened. "A music and sound maker" was the
        // last chip that ended in the generic "nobody fits that bill" line,
        // which was false — the makers exist, they just do not chat.
        <>
          <ComparisonRunCard
            channel={dream === 'image' ? 'images' : 'audio'}
            context={makerRun.context}
            balance={dream === 'image' ? makerRun.balances.images : makerRun.balances.audio}
            variant="simple"
          />
          {/* What they made, playable, right under the run that made it. The
              card's own closing line says the results are "side by side
              below", which in Simple Mode was true of nothing at all. */}
          <LabComparison
            channel={dream === 'image' ? 'images' : 'audio'}
            results={labResults}
            balance={dream === 'image' ? makerRun.balances.images : makerRun.balances.audio}
          />
          {/* The same door as the winner screen's. A maker run never reaches
              that screen — the race happens here — so without this the clips
              and pictures made in Simple Mode were the one thing "everything
              they made" could not be opened from. */}
          <div className="sw-maker-gallery">
            <AllDemosButton />
          </div>
        </>
      ) : filtered.length === 0 && dream === 'video' && videoLineup ? (
        // They cannot join Speed Dating, so they get a race of their own, here,
        // rather than directions to a mode a beginner has not opened.
        <VideoLineupLab
          variant="simple"
          comfyStatus={{ reachable: videoLineup.comfyReachable, folders: videoLineup.comfyFolders }}
          onCheckComfy={videoLineup.onCheckComfy}
          system={system}
          judgeModel={videoLineup.judgeModel}
          promptId={videoPromptId}
          onPromptIdChange={setVideoPromptId}
          customPrompt={videoCustomPrompt}
          onCustomPromptChange={setVideoCustomPrompt}
          otherRunActive={benchmarkActive}
          ollamaBaseUrl={videoLineup.ollamaBaseUrl}
          onDownloadModel={videoLineup.onDownloadModel}
          onStopDownload={videoLineup.onStopDownload}
          pullProgressByModel={pullProgressByModel}
          balance={videoLineup.balance}
          onBalanceChange={videoLineup.onBalanceChange}
        />
      ) : filtered.length === 0 ? (
        <div className="sw-pick-empty">
          {/* An empty wall is where the picture can go: there are no cards
              here for it to push down. */}
          {dream === 'image' || dream === 'video' ? (
            // Honest rather than empty: these models exist, they just are not
            // Speed Dating contestants — they render instead of chatting.
            <>
              {makers && makers.total > 0 ? (
                <p>
                  {listNames(makers.names)} {makers.total === 1 ? 'runs' : 'run'} on this PC.{' '}
                  {makers.installed === 0
                    ? `${makers.total === 1 ? 'It needs' : 'They need'} downloading first. `
                    : makers.installed < makers.total
                      ? `${makers.installed} of them ${makers.installed === 1 ? 'is' : 'are'} already installed. `
                      : `${makers.total === 1 ? 'It is' : makers.total === 2 ? 'Both are' : 'All of them are'} already installed. `}
                  They draw instead of chatting, so they cannot join Speed Dating — find them in
                  Advanced Mode under Models ({dream === 'video' ? '"Makes video"' : '"Makes images"'}),
                  and run them from the Lab.
                </p>
              ) : (
                <p>
                  {dream === 'video' ? 'Video makers' : 'Image makers'} are real, but they are not
                  contestants — they draw instead of chatting, so they cannot join Speed Dating.
                  Find them in Advanced Mode under Models ({dream === 'video' ? '"Makes video"' : '"Makes images"'}),
                  and run them from the Lab.
                </p>
              )}
            </>
          ) : (
            <p>Hmm, nobody fits that bill on this PC — try another type or show everyone.</p>
          )}
          <button type="button" className="btn btn-line btn-sm" onClick={() => setDream('all')}>Show everyone</button>
        </div>
      ) : (
        <>
          <div className="sw-card-grid">
            {visible.map((model) => {
              const picked = shortlistIds.has(model.row.displayName);
              const pickIndex = picked ? shortlistedRows.findIndex((r) => r.displayName === model.row.displayName) + 1 : 0;
              const disabled = !picked && lineupFull;
              return (
                <ContestantCard
                  key={model.row.displayName}
                  model={model}
                  picked={picked}
                  pickIndex={pickIndex}
                  disabled={disabled}
                  onToggle={() => onTogglePick(model.row)}
                />
              );
            })}
          </div>
          {!showAll && filtered.length > visible.length && (
            <button type="button" className="btn btn-link sw-show-more" onClick={() => setShowAll(true)}>Show more models that fit your PC</button>
          )}
        </>
      )}
    </div>
  );
}

function ContestantCard({ model, picked, pickIndex, disabled, onToggle }: {
  model: WizardModel;
  picked: boolean;
  pickIndex: number;
  disabled: boolean;
  onToggle: () => void;
}) {
  const fitLabel = model.fitTier === 'great' ? 'Runs great' : model.fitTier === 'well' ? 'Runs well' : 'A little slower';
  // Show effects: a few hearts float up from the button as a pick lands. Keyed
  // by a counter so each pick plays its own burst.
  const { effects } = useShowExtras();
  const stage = useShowStage();
  const [hearts, setHearts] = useState(0);
  const toggle = () => {
    if (effects && !picked) setHearts((n) => n + 1);
    onToggle();
  };
  return (
    <article className={`sw-card${picked ? ' picked' : ''}`}>
      {effects && hearts > 0 && (
        <span key={hearts} className="sw-heart-burst" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => <i key={i}>{stage === 'trojan' ? <HandFist /> : '♥'}</i>)}
        </span>
      )}
      <div className="sw-card-portrait">
        <img className="sw-card-avatar" src={getModelAvatarSrc(model.row.displayName)} alt="" />
        {/* Where it sits in the lineup. The button says "Picked" in words. */}
        {picked && <span className="sw-card-order" aria-hidden="true">{pickIndex}</span>}
      </div>
      <div className="sw-card-body">
        {/* A heading, so a screen reader can move row to row by name. The tag
            is for anyone who wants the exact model; friendly names drop it. */}
        <h3 title={model.row.displayName}>{model.name}</h3>
        <p className="sw-card-why">{model.goodForLine}</p>
        {/* Does it fit, and what does taking it cost. A beginner picking five
            most wants to know which ones cost nothing to try. */}
        <p className="sw-card-fit">
          <i className={`sw-fit-dot ${model.fitTier}`} aria-hidden="true" />
          {fitLabel}
          {model.row.installed
            ? ' · on your PC'
            : model.row.sizeGb
              ? <> · needs a <Explain id="download-size">{`${model.row.sizeGb} GB download`}</Explain></>
              : ''}
          {model.fitDetail && <span className="sw-card-vram"> · <ExplainText text={model.fitDetail} /></span>}
        </p>
      </div>
      {/* A full lineup is a status, so the button says it and stays out of reach. */}
      <button
        type="button"
        className={picked ? 'sw-card-btn picked' : 'sw-card-btn'}
        onClick={toggle}
        disabled={disabled}
      >
        {/* Nine buttons all named "Pick" told a screen reader nothing about
            which model each one takes. The model's name is added out of sight,
            after the visible words, so the name still starts with what is on
            screen for anyone who drives the app by voice. */}
        {picked ? (
          <>Picked · remove<span className="sr-only"> {model.name}</span></>
        ) : disabled ? (
          <>Lineup full<span className="sr-only">, so {model.name} cannot be picked</span></>
        ) : (
          <>Pick<span className="sr-only"> {model.name}</span></>
        )}
      </button>
    </article>
  );
}

function LineupTray({ shortlistedRows, onRemove, minPicks, plan, onChangePlan }: {
  shortlistedRows: ModelRow[];
  onRemove: (row: ModelRow) => void;
  minPicks: number;
  /** What the show will ask, e.g. "10 questions, General." */
  plan?: string;
  /** Opens the run sheet, where the questions are set. */
  onChangePlan?: () => void;
}) {
  // Why Start is disabled, where it can be read. It was only the disabled
  // button's tooltip, which a keyboard cannot reach and a touch never shows.
  const short = pickShortHint(shortlistedRows.length, minPicks);
  const sentence = shortlistedRows.length === 0
    ? 'Pick up to five models.'
    : short ? `Your lineup: ${shortlistedRows.length} of 5. ${short}.`
      : `Your lineup: ${shortlistedRows.length} of 5. Select one to remove it.`;
  return (
    <div className="sw-lineup-tray">
      {shortlistedRows.length > 0 && (
        <div className="sw-lineup-slots">
          {shortlistedRows.map((row) => (
            <button
              key={row.displayName}
              type="button"
              className="sw-lineup-slot filled"
              title={`Remove ${row.displayName} from your lineup`}
              aria-label={`Remove ${row.displayName} from your lineup`}
              onClick={() => onRemove(row)}
            >
              <img src={getModelAvatarSrc(row.displayName)} alt="" />
              <span className="sw-lineup-remove" aria-hidden="true"><X /></span>
            </button>
          ))}
        </div>
      )}
      <span className="sw-lineup-text" aria-live="polite">{sentence}</span>
      {plan && (
        <span className="sw-lineup-plan">
          {plan}
          {onChangePlan && <> <button type="button" className="btn btn-link" onClick={onChangePlan}>Change</button></>}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download

function DownloadScreen({ shortlistedRows, pullProgressByModel, onStartDownloads }: SimpleWizardProps) {
  const readyCount = shortlistedRows.filter((row) => row.installed).length;
  // Once nothing is moving, a failed download can be started again from here.
  // The row said "Start it again" and there was no way to, so a lineup short of
  // contestants was a dead end.
  const statuses = shortlistedRows.map((row) => getDownloadRowStatus(row.installed, pullProgressByModel[row.displayName]));
  const canRetry = statuses.includes('failed') && !statuses.some((s) => s === 'downloading' || s === 'queued');
  return (
    <div className="sw-download">
      <div className="sw-download-head">
        <h2>Getting your lineup ready</h2>
        <span>{readyCount} of {shortlistedRows.length} ready</span>
      </div>
      {shortlistedRows.map((row) => {
        const pull = pullProgressByModel[row.displayName];
        const installed = row.installed;
        // 'failed' and 'paused' both used to fall through to 'queued', so a
        // download that had died was announced as "Up next / Waiting in line"
        // with its error discarded, and a paused one showed a live byte counter
        // and an ETA for a transfer that was stopped.
        const percent = pull?.percent ?? 0;
        const status = getDownloadRowStatus(installed, pull);
        const meta = status === 'done'
          ? 'Ready to go'
          // The main process reports why it failed; say so instead of dropping it.
          : status === 'failed'
            ? (pull?.error || pull?.status || 'Download failed').replace(/^Error:\s*/, '')
            : status === 'paused'
              ? 'Paused'
              : status === 'queued'
                ? 'Waiting in line'
                : [
              pull?.completedBytes != null && pull?.totalBytes
                ? `${formatBytes(pull.completedBytes)} of ${formatBytes(pull.totalBytes)}`
                : (pull?.status || 'Downloading…'),
              pull?.speedBps ? formatBytesPerSecond(pull.speedBps) : '',
              downloadTimeLeft(pull),
            ].filter(Boolean).join(' · ');
        return (
          <div key={row.displayName} className={`sw-dl-row ${status}`}>
            <img className="sw-dl-avatar" src={getModelAvatarSrc(row.displayName)} alt="" />
            <div className="sw-dl-info">
              <strong>{getFriendlyModelName(row.displayName)}</strong>
              <em>{[row.displayName, meta].filter(Boolean).join(' · ')}</em>
              <div className="sw-dl-track" aria-hidden="true"><i style={{ width: `${status === 'done' ? 100 : status === 'downloading' || status === 'paused' ? Math.max(4, percent) : 0}%` }} /></div>
            </div>
            <span className="sw-dl-status">
              {status === 'done' ? <><Check aria-hidden="true" /> On your PC</>
                : status === 'failed' ? "Didn't download"
                : status === 'paused' ? 'Paused'
                : status === 'downloading' ? `${Math.round(percent)}%`
                : 'Up next'}
            </span>
          </div>
        );
      })}
      {canRetry && (
        <div className="sw-download-retry">
          <button type="button" className="btn btn-line" onClick={onStartDownloads}>Try the downloads again</button>
        </div>
      )}
      <p className="sw-muted sw-download-note">Downloads pick up where they left off if you close RigMatch.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare

/** What the show needs, so Advanced Mode's live show can be this one too. */
export type ShowStageProps = Pick<SimpleWizardProps, 'shortlistedRows' | 'runProgress' | 'round' | 'benchmarkActive' | 'onStopShow'> & {
  /** Absent where a stopped show has nowhere to go back to. */
  onRetry?: () => void;
  onChangeLineup?: () => void;
};

export function CompareScreen({ shortlistedRows, runProgress, round: showRound, benchmarkActive, onRetry, onChangeLineup, onStopShow }: ShowStageProps) {
  const failed = runProgress?.phase === 'failed';
  const activeModel = runProgress?.currentModel ?? '';
  const round = (runProgress?.questionIndex ?? 0) + 1;
  // questionTotal is the questions asked of EACH model. Falling back to the
  // model count was meaningless — those are different quantities.
  const totalRounds = runProgress?.questionTotal ?? 0;
  // A dead run must not keep claiming the host is lining up the next question.
  const question = failed
    ? (runProgress?.message ?? 'The show stopped early.')
    : runProgress?.questionPrompt ?? 'The host is lining up the next question…';
  const completed = runProgress?.completed ?? 0;
  const [showPrompt, setShowPrompt] = useState(false);

  const extras = useShowExtras();
  // The bulbs dance to the theme song while it plays.
  const onTheBeat = extras.music && showRound !== 'listening' && Boolean(benchmarkActive) && !failed;
  // The APPLAUSE sign lights each time a contestant finishes a turn.
  const [applause, setApplause] = useState(false);
  const finishedBefore = useRef(completed);
  useEffect(() => {
    const finishedOne = completed > finishedBefore.current;
    finishedBefore.current = completed;
    if (!finishedOne || !extras.effects) return undefined;
    setApplause(true);
    const timer = setTimeout(() => setApplause(false), 2400);
    return () => clearTimeout(timer);
  }, [completed, extras.effects]);

  // Models run one at a time, each answering every question, so "Round 4 of 10"
  // is the CURRENT model's progress — it resets to 1 each time a new model
  // starts. Shown on its own next to a bar that only ever advanced, it read as
  // the run going backwards four times in a five-model lineup.
  //
  // Both now describe the same thing: which model we are on, and how far
  // through the whole set of questions the run actually is.
  const modelCount = shortlistedRows.length;
  const modelNumber = Math.min(completed + 1, Math.max(1, modelCount));
  const totalQuestions = modelCount * totalRounds;
  const questionsDone = completed * totalRounds + (round - 1);
  const overallPercent = totalQuestions > 0
    ? Math.round((questionsDone / totalQuestions) * 100)
    // No question counts yet (the run has not reported one): fall back to the
    // model-level figure rather than showing a made-up number.
    : (runProgress?.percent ?? 0);

  // How much longer this will take, measured from the run in progress rather
  // than forecast up front. Someone sitting here for a quarter of an hour has
  // already spent the forecast; what they want to know is whether to wait.
  // Nothing is claimed until a few questions have actually been timed, so the
  // first number shown is evidence rather than a guess.
  const runningPhase = runProgress?.phase;
  // The tick owns the elapsed time. Reading a ref and the clock during render
  // instead would make the number depend on whenever React happened to
  // re-render, which is both impure and wrong on a screen that re-renders
  // every time a question lands.
  const [runClock, setRunClock] = useState<{ startedAt: number; now: number } | null>(null);
  useEffect(() => {
    if (runningPhase !== 'running') return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => setRunClock({ startedAt, now: Date.now() }), 1000);
    return () => {
      clearInterval(timer);
      // Drop the reading along with the run it belonged to, so the next show
      // cannot briefly forecast from the previous one's start time.
      setRunClock(null);
    };
  }, [runningPhase]);
  const elapsedMs = runClock ? runClock.now - runClock.startedAt : 0;

  // Scores for the model currently answering, as they land. The panel stretches
  // to fill the step, so without this the bottom third of the busiest screen in
  // the app was blank for the entire run — on the one screen where the user is
  // doing nothing but waiting and wants to know how it is going.
  const answered = Object.values(runProgress?.questionScores ?? {}).filter((value) => Number.isFinite(value));
  const answeredAverage = answered.length > 0
    ? Math.round(answered.reduce((sum, value) => sum + value, 0) / answered.length)
    : null;

  // When the current question began, on the run's own clock, so a stall can be
  // told from a slow run. Updated as the count moves, not read from the clock
  // during render.
  const [questionStartedAt, setQuestionStartedAt] = useState<{ done: number; at: number }>({ done: -1, at: 0 });
  if (runClock && questionStartedAt.done !== questionsDone) setQuestionStartedAt({ done: questionsDone, at: runClock.now });
  const judging = runProgress?.questionPhase === 'judging';
  const timeLeft = showTimeLeft({
    // Up to the last finished question, not now: the time since belongs to a
    // question still running and says nothing yet about the rest.
    elapsedMs: runClock && questionStartedAt.at ? questionStartedAt.at - runClock.startedAt : elapsedMs,
    questionsDone,
    totalQuestions,
    sinceLastQuestionMs: runClock ? runClock.now - (questionStartedAt.at || runClock.startedAt) : 0,
    judging,
  });

  // What this question tests, from the question itself.
  //
  // This read the label through a chain of regexes and defaulted to "Everyday
  // questions". Difficult Subjects questions are labeled by subject —
  // "Tiananmen 1989", "Tank Man", "Xinjiang", "Tulsa 1921" — and match none of
  // those patterns, so all eight took the default: Simple Mode captioned a live
  // Tiananmen Square question as everyday chat. The type was on the question
  // the whole time and was simply not being sent to the screen.
  const hasQuestion = Boolean(runProgress?.questionLabel);
  const plainRoundLabel = roundLabel(runProgress?.questionType)
    // Never a category when the category is unknown — a wrong specific caption
    // is worse than an honest vague one, which is the whole lesson here.
    ?? (hasQuestion ? 'Next question' : 'Warming up…');

  const lastResult = runProgress?.lastResult;
  const announcement = showAnnouncement({
    answering: activeModel ? getFriendlyModelName(activeModel) : '',
    modelNumber,
    modelCount,
    finished: lastResult ? { name: getFriendlyModelName(lastResult.model), total: lastResult.total } : undefined,
    failed,
    failure: runProgress?.message,
  });

  return (
    <div className="sw-compare">
      {/* Always rendered, so a change is announced: a live region that appears
          already holding its text is not reliably read. */}
      <p className="sr-only" role="status">{announcement}</p>
      {/* The stage: the show's photo, its bulbs, and a spotlight on whoever is
          answering. Only the question and the contestants stand on it — the
          progress and the scores below are data, and data is not lit. The
          photo was here all along, painted over by an opaque fill. */}
      <div className={failed ? 'sw-stage lights-down' : 'sw-stage'}>
        <div className="sw-stage-bg" style={{ backgroundImage: `url(${speedDateShow})` }} aria-hidden="true" />
        <ShowMarquee dark={failed} framed beat={onTheBeat} />
        {extras.effects && <ApplauseSign lit={applause} />}
        <div className="sw-compare-inner">
          {/* The raw benchmark prompt is dense jargon ("Return only valid JSON…
              use keys intent, action, target") and was the hero text on a beginner
              screen. Lead with a plain-English round label; keep the exact prompt
              one click away for anyone who wants to check the methodology. */}
          {failed ? (
            // A show nobody finished stays here and says why, with the way on.
            // It used to move to Winner, where the host said "We have a match!"
            // over "Run the show to crown your Top Match."
            <div className="sw-compare-question sw-compare-stopped">
              <p className="sw-round-meta">{runProgress?.failureKind === 'stopped' ? 'You stopped the show' : 'The show stopped'}</p>
              <h2>{runProgress?.message ?? 'The show stopped early.'}</h2>
              {runProgress?.failureKind === 'too-few' ? (
                <>
                  <p>Pick at least {MIN_CONTESTANTS} models that are on this PC.</p>
                  {onChangeLineup && (
                    <div className="sw-stage-actions">
                      <button type="button" className="btn btn-gold" onClick={onChangeLineup}>Change the lineup</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>Your lineup is still picked, so you can run it again or change it.</p>
                  {(onRetry || onChangeLineup) && (
                    <div className="sw-stage-actions">
                      {onRetry && <button type="button" className="btn btn-gold" onClick={onRetry}>Run the show again</button>}
                      {onChangeLineup && <button type="button" className="btn btn-line" onClick={onChangeLineup}>Change the lineup</button>}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="sw-compare-question">
              {/* Naming the model makes the per-model round count read as intended
                  rather than as the run resetting. */}
              <h2>{plainRoundLabel}</h2>
              <p className="sw-round-meta">
                {totalRounds > 0 && modelCount > 1
                  ? `Round ${round} of ${totalRounds} · contestant ${modelNumber} of ${modelCount}`
                  : totalRounds > 0
                    ? `Round ${round} of ${totalRounds}`
                    : 'Getting started'}
              </p>
              <button type="button" className="btn btn-link" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? 'Hide the exact question' : 'See the exact question'}
              </button>
              {showPrompt && <p className="sw-compare-raw">&ldquo;{question}&rdquo;</p>}
            </div>
          )}
          {/* Show effects: the contestants walk on one after another. */}
          <div className={extras.effects ? 'sw-podiums walk-on' : 'sw-podiums'}>
            {shortlistedRows.map((row, index) => {
              // Nobody is answering once the show has stopped.
              const isActive = !failed && row.displayName === activeModel;
              // Sat out: the show went on without it.
              const dropped = runProgress?.failedModels?.find((f) => f.model === row.displayName);
              // A model is "done" once the run has moved past its index. Per-model
              // scores aren't tracked in progress, so only the just-finished model
              // (lastResult) shows a number; earlier ones read "Answered".
              const isDone = !isActive && index < completed;
              // The one answering when the show stopped had started; the rest had not.
              const wasAnswering = failed && row.displayName === activeModel;
              const state = dropped ? 'dropped' : isActive ? 'answering' : isDone ? 'done' : wasAnswering ? 'stopped' : 'waiting';
              const rowScore = runProgress?.lastResult?.model === row.displayName ? runProgress?.lastResult?.total : undefined;
              return (
                <div key={row.displayName} className={`sw-podium ${state}`} style={{ '--i': index } as CSSProperties}>
                  <img src={getModelAvatarSrc(row.displayName)} alt="" />
                  {/* The name they picked, not the raw tag. Pick shows
                      "Qwen2.5"; showing "qwen2.5:7b" here reads as a different
                      contestant to someone who does not know the notation. */}
                  <strong>{getFriendlyModelName(row.displayName)}</strong>
                  <span className={`sw-podium-state ${state}`}>
                    {state === 'answering' ? (judging
                      ? (runProgress?.questionJudge ? `${getFriendlyModelName(runProgress.questionJudge)} is marking it` : 'Being marked')
                      : 'Answering…')
                      : state === 'dropped' ? "Couldn't finish"
                        : state === 'done' ? (rowScore != null ? `Done · scored ${rowScore}` : 'Done')
                          : state === 'stopped' ? 'Stopped partway'
                            : failed ? 'Did not run' : 'Up next'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="sw-stage-data">
        <div className="sw-show-progress">
          <div className="sw-show-progress-head">
            <span>Progress</span>
            {/* Counts every question the whole run will ask, so the label and the
                bar move together and neither ever goes backwards. */}
            <span>
              {totalQuestions > 0
                ? `${questionsDone} of ${totalQuestions} ${showRound && showRound !== 'chat' ? ROUND_LINES[showRound].unit : 'questions'}`
                : `${overallPercent}%`}
              {timeLeft && <em className="sw-eta"> · {timeLeft}</em>}
            </span>
          </div>
          <div
            className="sw-show-progress-track"
            role="progressbar"
            aria-valuenow={overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Show progress"
          >
            <i style={{ width: `${Math.max(2, overallPercent)}%` }} />
          </div>
        </div>

        <div className="sw-answer-strip">
          <div className="sw-answer-strip-head">
            <span>
              {/* Says what the numbers are for as long as they are on screen: the
                  "scored out of 100" line used to go once the first one arrived,
                  leaving a row of bare numbers. */}
              {activeModel ? `${getFriendlyModelName(activeModel)}'s answers so far, each scored out of 100` : 'Answers so far, each scored out of 100'}
            </span>
            {answeredAverage != null && (
              <em>{answered.length} scored · averaging <b>{answeredAverage}</b></em>
            )}
          </div>
          {answered.length === 0 ? (
            <p className="sw-muted">Every answer is scored out of 100 as it arrives.</p>
          ) : (
            <ol aria-label="Answer scores for the model currently answering">
              {answered.map((score, index) => (
                <li
                  key={index}
                  className={score >= 85 ? 'good' : score >= 70 ? 'fair' : 'poor'}
                  title={`Answer ${index + 1}: ${score} out of 100${score === 0 ? ', it missed the question' : ''}`}
                >
                  {score}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* No gold here: while the show runs there is no next step, only a way
            to stop it. The music switch is here too, for whoever wants quiet
            now rather than a trip to Settings. */}
        {benchmarkActive && !failed && (
          <div className="sw-show-controls">
            {showRound !== 'listening' && (
              <button
                type="button"
                className="btn btn-link"
                aria-pressed={extras.music}
                onClick={() => setShowExtras({ music: !extras.music })}
              >
                {extras.music ? 'Turn the music off' : 'Play the theme music'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-line"
              onClick={onStopShow}
              title="Stops after the current question. Models already scored keep their results."
            >
              Stop the show
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Winner

/** When the curtains have parted far enough for the winner to land. */
const CURTAIN_MS = 900;

function WinnerScreen({ winner, shortlistedRows, lineupResults, droppedOut, balance, onBalanceChange, round, onChatWithWinner, onOpenScorecard, onShareScore, onRunAgain, onSwitchToAdvanced }: SimpleWizardProps) {
  // Show effects: the curtains part on the winner, the bulbs flash, the
  // audience applauds. Without them the reveal plays exactly as before.
  const { effects } = useShowExtras();
  if (!winner) {
    // Two different nothings: a show that has not run, and a show where nobody
    // passed. The second one has a board to show and a reason to give.
    const board = lineupResults ?? [];
    if (board.length === 0) {
      return (
        <div className="sw-winner">
          <p className="sw-muted">Run the show to crown your Top Match.</p>
          <div className="sw-winner-actions">
            <button type="button" className="btn btn-gold" onClick={onRunAgain}>Pick a lineup</button>
          </div>
        </div>
      );
    }
    return (
      <div className="sw-winner">
        <h2 className="sw-winner-none">Nobody passed this round</h2>
        <p className="sw-muted">
          {board.length === 1 ? 'The one contestant' : `All ${board.length} contestants`} answered, and none of them
          got close enough to what was asked for to be crowned. That is a real result about this PC and these models,
          not a failed show.
        </p>
        <div className="sw-winner-actions">
          <button type="button" className="btn btn-gold" onClick={onRunAgain}>Run it again</button>
          <button type="button" className="btn btn-line" onClick={onSwitchToAdvanced}>Open the control room</button>
        </div>
        {/* A show nobody won still happened, and can still earn a badge. */}
        <AchievementUnlocked />
        <Scoreboard results={board} />
      </div>
    );
  }
  const name = getFriendlyModelName(winner.model);
  // Only the models that finished were compared: a dropout, or a show stopped
  // early, leaves fewer finishers than picks.
  const finished = lineupResults?.length || shortlistedRows.length;
  const { tested, onlyOne } = winnerField(finished, shortlistedRows.length);
  return (
    <div className="sw-winner crowned">
      {/* The reveal is the one moment the show gets its full lighting: the
          ceremony photo, the bulbs, the confetti. The actions and the board
          under it stay plain; they are the measurements and the way on. */}
      <div className={effects ? 'sw-winner-stage curtained' : 'sw-winner-stage'}>
        <div className="sw-stage-bg" style={{ backgroundImage: `url(${ceremonyStage})` }} aria-hidden="true" />
        <ShowMarquee framed flash={effects} />
        {effects && <ApplauseSign lit />}
        <div className="sw-confetti" aria-hidden="true">
          {['gold', 'pink', 'green', 'blue', 'gold', 'pink'].map((c, i) => (
            <i key={i} className={`sw-confetti-piece ${c}`} style={{ left: `${12 + i * 15}%`, animationDelay: `${(effects ? CURTAIN_MS : 0) + i * 90}ms` }} />
          ))}
        </div>
        {effects && (
          <div className="sw-curtains" aria-hidden="true">
            <i />
            <i />
          </div>
        )}
        <div className="sw-winner-reveal">
          <div className="sw-winner-avatar-wrap">
            <img src={getModelAvatarSrc(winner.model)} alt="" />
          </div>
          <div className="sw-winner-copy">
            <p className="sw-winner-kicker">Your Top Match</p>
            <div className="sw-winner-name">
              <h2>{getFriendlyModelName(winner.model)}</h2>
              <span className="sw-winner-tag">{winner.model}</span>
            </div>
            <div className="sw-winner-grade">
              <b>{winner.scoreLabel}</b>
              <span><Explain id="match-score">Match Score</Explain> · Grade {winner.grade} · {balanceLabel(balance)}</span>
            </div>
            {/* Say what the number means; a beginner has never seen either scale. */}
            <p className="sw-winner-why">
              {round === 'code'
                ? <>Answered the same questions as the rest and built the best app of the {tested}, on your PC, judged on whether it runs and does what was asked.</>
                : round === 'vision'
                  ? <>Named the most of the test picture out of the {tested}, and did it fastest on your PC.</>
                  : round === 'listening'
                    ? <>Heard the test recording best out of the {tested} on your PC.</>
                    : onlyOne
                      // Nothing was compared, so it is not "the best of" anything.
                      ? <>The only one of your picks that finished, so it had nothing to be compared with.</>
                      : <>The best mix of speed, answer quality and fit for your PC out of the {tested}.</>}
            </p>
            {winner.measures && winner.measures.length > 0 && (
              <dl className="sw-winner-measures">
                {winner.measures.map((measure) => (
                  <div key={measure.label}>
                    <dt>{measure.label}</dt>
                    <dd>{Math.round(measure.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {/* Asked here rather than before the show: it only re-ranks what was
                measured, and here the crown can be seen moving. The sheet asked
                it, and a chat show's order never used the answer. */}
            {/* Only where the scores move with it. A skill round's board
                re-sorted at the balance while each row kept its raw Lab score,
                so 70 sat above 95. */}
            {!onlyOne && (round ?? 'chat') === 'chat' && (
              <div className="sw-rank-by" role="group" aria-label="Rank by">
                <span>Rank by</span>
                {[...BALANCE_NOTCHES].reverse().map((notch) => (
                  <button
                    key={notch.id}
                    type="button"
                    className="chip"
                    aria-pressed={notchAt(balance)?.id === notch.id}
                    onClick={() => onBalanceChange(Math.round(notch.value))}
                  >
                    {notch.label}
                  </button>
                ))}
              </div>
            )}
            {/* Whatever it made is one click away. The app a coding round built is
                the whole point of having run one. */}
            <ModelDemoChips model={winner.model} label="What it made" className="sw-winner-demos" />
          </div>
        </div>
      </div>

      {/* Two doors and the small ones beside them. Chat is the happy ending,
          so it is the one gold button; the control room is Advanced Mode. */}
      <div className="sw-winner-actions">
        <button type="button" className="btn btn-gold sw-winner-chat" onClick={onChatWithWinner}>Chat with {name}</button>
        <button type="button" className="btn btn-line sw-winner-door" onClick={onSwitchToAdvanced}>Open the control room</button>
        <span className="sw-winner-links">
          <button type="button" className="btn btn-link" onClick={onOpenScorecard}>See every answer</button>
          {/* Sharing belongs at the moment of the result. */}
          <button type="button" className="btn btn-link" onClick={onShareScore}>Share</button>
          <AllDemosButton className="btn btn-link" label="Everything they made" />
          <button type="button" className="btn btn-link" onClick={onRunAgain}>Run the show again</button>
        </span>
      </div>

      {/* What this show earned, if anything: a badge for a feature found. */}
      <AchievementUnlocked />

      {/* The rest of the comparison. Announcing one winner and hiding the other
          four made the show's whole output a single number, and left "out of
          the 5 you tested" as a claim the screen did not back up. */}
      {(lineupResults?.length ?? 0) > 1 && (
        <Scoreboard
          results={lineupResults!}
          winnerModel={winner.model}
          note={`${round && round !== 'chat' ? ROUND_LINES[round].note : 'Every one of these ran the same questions on your PC.'} A close second may still suit you better, so try chatting with either.`}
        />
      )}
      {/* Who sat out, and why. They are not ranked: they did not answer
          everything, so there is nothing fair to rank them on. */}
      {(droppedOut?.length ?? 0) > 0 && (
        <div className="sw-scoreboard sw-dropped-out">
          <h3>Couldn't finish</h3>
          <ul>
            {droppedOut!.map((failure) => (
              <li key={failure.model}>
                <strong>{getFriendlyModelName(failure.model)}</strong>: {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Said once, after the show has delivered, and never in its way. */}
      <p className="sw-donate-note">
        RigMatch is donationware: every feature is free, and nothing is locked if you don’t donate. If tonight’s
        match saved you time,{' '}
        <a href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noopener noreferrer">buy me a coffee</a>.
      </p>
    </div>
  );
}

/** How the lineup finished: one row a contestant, best first. Plain, never lit. */
function Scoreboard({ results, winnerModel, note }: {
  results: NonNullable<SimpleWizardProps['lineupResults']>;
  winnerModel?: string;
  note?: string;
}) {
  return (
    <div className="sw-scoreboard">
      <h3>How the lineup finished</h3>
      <ol>
        {results.map((result, index) => {
          const tied = results.some((other, i) => i !== index && other.scoreLabel === result.scoreLabel);
          const place = results.findIndex((other) => other.scoreLabel === result.scoreLabel) + 1;
          return (
          <li key={result.model} className={result.model === winnerModel ? 'winner' : undefined}>
            <b className="sw-place">{tied ? `=${place}` : index + 1}</b>
            <img src={getModelAvatarSrc(result.model)} alt="" />
            <span className="sw-scoreboard-name">
              {result.name}
              <em>{result.model}</em>
              {/* Everything this contestant made, from its own row. */}
              <ModelDemoChips model={result.model} label="" className="sw-scoreboard-demos" />
            </span>
            <span className="sw-scoreboard-score">
              {result.scoreLabel}
              <em>{tied ? 'Tied · ' : ''}Grade {result.grade}{result.note ? ` · ${result.note}` : ''}</em>
            </span>
          </li>
          );
        })}
      </ol>
      {results.length > 1 && results[0].scoreLabel === results[1].scoreLabel && (
        <p className="sw-muted sw-scoreboard-note">
          A tie at the top goes to the better answers, then steadiness, fit and speed.
        </p>
      )}
      {note && <p className="sw-muted sw-scoreboard-note">{note}</p>}
    </div>
  );
}
