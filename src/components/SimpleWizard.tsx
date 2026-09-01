// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Download,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Info,
  Lock,
  MessageSquare,
  PenLine,
  Plus,
  RefreshCw,
  ScanLine,
  Share2,
  Sparkles,
  Trophy,
  Video,
  X,
} from 'lucide-react';
import type { ModelRow, OllamaInstallProgress, PullProgressUpdate, SystemProfile } from '../types';
import { STEPS, STEP_LABELS, footerHint, nextBlockedHint, type StepId } from '../lib/wizardCopy';
import { copyText, type CopyState } from '../lib/clipboard';
import { Explain, ExplainText, InfoViewProvider } from './InfoView';
import { useExplaining } from '../lib/infoContext';
import { formatBytes, formatBytesPerSecond } from '../lib/format';
import { formatDuration } from '../lib/runEstimates';
import { getModelAvatarSrc, HOST_AVATAR_SRC } from '../lib/modelAvatars';
import { getFriendlyModelName } from '../lib/modelCatalog';
import { getDownloadRowStatus, summarizeDownloadStep } from '../lib/downloadStatus';
import rigGreenroom from '../assets/robot-rig-greenroom.webp';
import speedDateShow from '../assets/robot-speed-date-show.webp';
import romanceHero from '../assets/robot-romance-hero.webp';
import modelTestArt from '../assets/robot-model-test.webp';
import brandIcon from '../assets/rigmatch-brand-icon.svg';
import './SimpleWizard.css';

export type DreamFilterId = 'talk' | 'write' | 'code' | 'image' | 'video' | 'all';

/** A model prepared for the wizard's Pick grid (App computes fit/copy). */
export type WizardModel = {
  row: ModelRow;
  name: string;
  epithet: string;
  goodForLine: string;
  fitTier: 'great' | 'well' | 'slower';
  /** Concrete fit, e.g. "4.7 GB of your 12 GB VRAM" — the grid is pre-filtered to
   *  models that fit, so the tier alone reads identically on every card. */
  fitDetail: string;
  dreamTags: Array<Exclude<DreamFilterId, 'all'>>;
  /** How many size/quant variants this card is standing in for (> 1 only when
   *  siblings were collapsed). Beginners were shown every variant as its own
   *  near-identical card — "many versions of Gemma 4... I don't know how these
   *  parameters/differences work" was the first outside review's top confusion. */
  variantCount?: number;
};

type SimpleRunProgress = {
  phase: 'running' | 'complete' | 'failed';
  currentModel: string;
  percent: number;
  /**
   * Why a run stopped. The App has always passed this; this type used to omit
   * it, so Simple Mode discarded every failure reason it was handed and left
   * beginners on a frozen game show with no explanation.
   */
  message?: string;
  /** Number of lineup models fully tested so far — used for per-model podium state. */
  completed?: number;
  lastResult?: { model: string; total: number; grade: string };
  questionIndex?: number;
  questionTotal?: number;
  questionLabel?: string;
  questionPrompt?: string;
  completedQuestions?: number;
  questionScores?: Record<string, number>;
} | null;

export type { StepId };

const HOST_COPY: Record<StepId, string> = {
  setup: "Welcome to RigMatch! First, let's take a quick peek at your computer. One click — I'll handle the rest.",
  pick: "So… who's your dream model? Tell me what you're looking for, and I'll bring out the right contestants.",
  download: "Great picks! I'm bringing your contestants to the studio. This takes a few minutes — feel free to do something else, I'll let you know when we're ready.",
  compare: "It's Speed Dating time! Everyone gets the same questions — no favorites, I promise. Sit back and enjoy the show.",
  winner: "We have a match! Now — go get to know each other. And when you're ready for the control room, Advanced Mode is all yours.",
};

const DREAM_CHIPS: Array<{ id: DreamFilterId; label: string; icon: typeof MessageSquare }> = [
  { id: 'talk', label: 'Someone to talk with', icon: MessageSquare },
  { id: 'write', label: 'A writing partner', icon: PenLine },
  { id: 'code', label: 'A coding buddy', icon: Code2 },
  { id: 'image', label: 'An image maker', icon: ImageIcon },
  { id: 'video', label: 'A video maker', icon: Video },
  { id: 'all', label: 'Surprise me — show everyone', icon: Sparkles },
];

type SimpleWizardProps = {
  system: SystemProfile;
  ollamaReady: boolean;
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
    /** Runs the same search Settings runs. */
    onFind?: () => void | Promise<void>;
  } | null;
  /** The dream matching the first-run goal choice, so PICK opens on it. */
  initialDream?: DreamFilterId;
  /**
   * Something the app needs this user to read — a refusal, a blocked queue, a
   * failed run. Advanced Mode shows these in the Ticker, which is Advanced-only,
   * so without this Simple Mode is mute by construction.
   */
  notice?: string | null;
  onDismissNotice?: () => void;
  /**
   * Something the user can do about the notice, offered beside it.
   *
   * Without this a notice can only describe a problem, which was fine until one
   * of them said to open Settings — a panel Simple Mode does not have. A fix
   * named somewhere unreachable is not a fix.
   */
  noticeAction?: { label: string; run: () => void | Promise<void> } | null;
  /** Fills the lineup with the best-fitting models for people who can't choose. */
  onChooseForMe: () => void;
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
  onStartShow: () => void;
  onStopShow: () => void;
  winner: { model: string; score: number; scoreLabel: string; grade: string } | null;
  /**
   * What this PC can generate, which the Pick grid deliberately excludes.
   * Without it the empty grid was described as "no contestants can make video
   * on this PC" — a claim about the machine that the grid cannot support.
   */
  generation?: {
    image: { total: number; installed: number; names: string[] };
    video: { total: number; installed: number; names: string[] };
  };
  /** Every model in the lineup that has a score, best first. */
  lineupResults?: Array<{ model: string; name: string; scoreLabel: string; total: number; grade: string }>;
  onChatWithWinner: () => void;
  onOpenScorecard: () => void;
  /** Opens the shareable scorecard image for the winning model. */
  onShareScore: () => void;
  onRunAgain: () => void;
  onSwitchToAdvanced: () => void;
  /** Where the wizard was last time it was mounted. Switching to Advanced and
   *  back used to unmount this component and drop the user at step 1. */
  initialStep?: StepId;
  onStepChange?: (step: StepId) => void;
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
  const pickDone = shortlistedRows.length >= 1;
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

  const compareDone = !awaitingRun && Boolean(winner) && !benchmarkActive;
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
  const step: StepId = compareDone && chosenStep === 'compare'
    ? 'winner'
    : stepState.unlocked[chosenStep] ? chosenStep : furthestStep;
  const setStep = (next: StepId) => {
    setChosenStep(next);
    props.onStepChange?.(next);
  };

  // Only offer "Stop the show" while a show is actually running. Keyed to the
  // step alone, a finished or failed run left Compare with no Back button at
  // all — the one screen a beginner could get stranded on.
  const showRunning = step === 'compare' && benchmarkActive;
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
  // already been done. Skip it in both directions rather than showing theatre.
  const skipDownload = downloadAllInstalled;

  const startShow = () => {
    props.onStartShow();
    // Set synchronously so the derived step can't promote Compare -> Winner in
    // the gap before the run reports itself as active.
    setAwaitingRun(true);
  };

  const goNext = () => {
    if (step === 'pick') {
      if (skipDownload) { startShow(); setStep('compare'); return; }
      props.onStartDownloads();
    }
    if (step === 'download') startShow();
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
    setup: 'Next · Choose your models',
    // "Download 5 models · already on your PC" contradicted itself inside one
    // label. When nothing needs downloading, this button starts the comparison.
    pick: skipDownload
      ? `Next · Start the comparison · ~${showMinutes} min`
      : `Next · Download ${shortlistedRows.length} model${shortlistedRows.length === 1 ? '' : 's'}${downloadSuffix}`,
    download: `Next · Start the comparison · ~${showMinutes} min`,
    compare: 'Next · See the winner',
  };

  return (
    <InfoViewProvider>
    <div className="sw-shell">
      <header className="sw-header">
        <div className="sw-brand">
          <img src={brandIcon} alt="" />
          <div>
            <strong>RigMatch</strong>
            <span>AI matchmaking for your PC</span>
            {/* Mode switch lives under the brand in both Simple and Advanced so it
                never moves when you toggle. Shares .global-mode-switch styling. */}
            <div className="global-mode-switch" role="group" aria-label="Current interface mode">
              <span>Mode</span>
              <button
                type="button"
                className="active"
                aria-pressed="true"
                aria-label="Simple Mode"
                title="Simple Mode keeps RigMatch focused on the main flow"
              >
                Simple
              </button>
              <button
                type="button"
                onClick={props.onSwitchToAdvanced}
                aria-pressed="false"
                aria-label="Advanced Mode"
                title="Advanced Mode shows deeper tools and diagnostics"
              >
                Advanced
              </button>
            </div>
          </div>
        </div>
        <nav className="sw-steps" aria-label="Wizard steps">
          {/* A skipped Download step is dropped from the stepper entirely rather
              than left sitting there permanently incomplete. */}
          {STEPS.filter((id) => !(id === 'download' && skipDownload)).map((id, index) => {
            const isActive = id === step;
            const isDone = stepState.done[id] && !isActive;
            const isLocked = !stepState.unlocked[id] && !isActive;
            const cls = isActive ? 'active' : isDone ? 'done' : 'locked';
            const clickable = isDone;
            return (
              <div className="sw-step-wrap" key={id}>
                {index > 0 && <i className="sw-step-dash" aria-hidden="true" />}
                <button
                  type="button"
                  className={`sw-step ${cls}`}
                  onClick={() => clickable && setStep(id)}
                  disabled={!clickable && !isActive}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span className="sw-step-mark" aria-hidden="true">
                    {isDone ? <Check /> : isLocked ? <Lock /> : id === 'winner' && isActive ? <Trophy /> : index + 1}
                  </span>
                  <span className="sw-step-label">{STEP_LABELS[id]}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </header>

      <div className="sw-content">
        <HostStrip step={step} />

        {props.notice && (
          <div className="sw-notice" role="status" ref={noticeRef}>
            <AlertTriangle aria-hidden="true" />
            <p>{props.notice}</p>
            {props.noticeAction && (
              <button
                type="button"
                className="sw-notice-fix"
                onClick={() => void props.noticeAction?.run()}
              >
                {props.noticeAction.label}
              </button>
            )}
            {props.onDismissNotice && (
              <button type="button" onClick={props.onDismissNotice}>Got it</button>
            )}
          </div>
        )}

        {step === 'setup' && <SetupScreen {...props} />}
        {step === 'pick' && <PickScreen {...props} />}
        {step === 'download' && <DownloadScreen {...props} />}
        {step === 'compare' && <CompareScreen {...props} />}
        {step === 'winner' && <WinnerScreen {...props} onRunAgain={() => setStep('pick')} />}
      </div>

      <footer className="sw-footer">
        <div className="sw-footer-left">
          {step !== 'setup' && (
            <button
              type="button"
              className="sw-ghost-pill"
              onClick={showRunning ? props.onStopShow : downloadsActive ? props.onCancelDownloads : goBack}
              title={showRunning
                ? 'Stops after the current question. Models already scored keep their results.'
                : downloadsActive
                  ? 'Stops after the current file. Anything already downloaded stays on your PC.'
                  : undefined}
            >
              <ArrowLeft aria-hidden="true" />
              {showRunning ? 'Stop the show' : downloadsActive ? 'Stop downloads' : 'Back'}
            </button>
          )}
        </div>
        {step === 'pick'
          ? <LineupTray shortlistedRows={shortlistedRows} onRemove={props.onTogglePick} />
          : <span className="sw-footer-hint">{footerHint(step, ollamaReady, shortlistedRows.length)}</span>}
        <div className="sw-footer-right">
          {step !== 'winner' && (
            <button
              type="button"
              className="sw-gold-pill"
              onClick={goNext}
              disabled={!stepComplete[step]}
              title={stepComplete[step] ? undefined : nextBlockedHint(step, downloadBlockedReason, props.runProgress?.phase === 'failed')}
            >
              {nextLabel[step]}
              <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>
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
function HostStrip({ step }: { step: StepId }) {
  const explaining = useExplaining();
  return (
    <div className={`sw-host-strip${explaining ? ' explaining' : ''}`}>
      <img className="sw-host-avatar" src={HOST_AVATAR_SRC} alt="" />
      {/* The narration stays in the layout at a constant height; the
          explanation is layered ON TOP of it rather than replacing it. An
          explanation runs to three paragraphs against the narration's two
          lines, so swapping them in place grew the bubble by ~33px and shoved
          the entire page down every time the pointer crossed a term — the
          whole screen danced. Nothing below the host may move. */}
      <div className="sw-host-bubble">
        <span>The host</span>
        <p>{HOST_COPY[step]}</p>
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

// ---------------------------------------------------------------------------
// Setup

function SetupScreen({
  system,
  ollamaReady,
  isScanning,
  onCheckComputer,
  onGetOllama,
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
  comfySetup,
}: SimpleWizardProps) {
  const checked = ollamaReady; // a successful check makes Ollama ready
  const gpu = system.gpu.model || 'your graphics card';
  const freeGb = Math.round(system.storage.availableGb || 0);
  // Only surface the "couldn't find Ollama" card after the user actually ran a
  // check that came back not-ready — never on first load before they've clicked.
  const [attempted, setAttempted] = useState(false);
  // For a Linux user on first run this copy button is the only way forward, and
  // it used to fail in total silence.
  const [copiedCommand, setCopiedCommand] = useState<CopyState>('idle');
  const runCheck = () => { setAttempted(true); onCheckComputer(); };
  // Only "missing" when a goal actually needs it. No goal needing ComfyUI means
  // there is nothing missing, however absent ComfyUI happens to be.
  const comfyMissing = Boolean(comfySetup?.needed) && !comfySetup?.ready;

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
      <div className="sw-setup-hero" style={{ backgroundImage: `url(${rigGreenroom})` }} aria-hidden="true" />
      {/* The action first, the reading under it.

          Measured at 1366x768, the most common laptop: this step put 933px of
          content in a 497px window and left "Check my computer" 182px below the
          fold. The host line promises "one click — I'll handle the rest" and the
          click was the one thing a newcomer could not see.

          Nothing is cut. Saying what a model IS still matters — it was added
          because a hardware scan for an unexplained thing is a strange first
          screen — it just no longer stands between the reader and the button. */}
      <h2>So let's check your computer</h2>
      {/* Gone once the check has passed. It used to render unconditionally
          while the result below it was gated on `checked`, so a finished setup
          showed a big gold "Check my computer" sitting directly above "You're
          all set! · Check again" — two controls for one job, the louder of them
          already satisfied. The results block carries its own "Check again",
          which is the only version of this that still has something to do. */}
      {(!checked || isScanning) && (
        <button type="button" className="sw-gold-pill sw-cta" onClick={runCheck} disabled={isScanning}>
          {isScanning ? <RefreshCw className="sw-spin" aria-hidden="true" /> : <ScanLine aria-hidden="true" />}
          {isScanning ? 'Checking your computer…' : 'Check my computer'}
        </button>
      )}
      <p className="sw-muted">
        RigMatch looks at your <Explain id="graphics-card">graphics card</Explain> and memory, works out which
        models will actually run well here, then has them compete so you can crown a winner.
        Everything stays on your PC — no account, no cloud.
      </p>
      <p className="sw-setup-lede">
        An <Explain id="model">AI model</Explain> is a program that runs on your own computer — it can hold a
        conversation, help you write, explain code, or make pictures. They're free, there are hundreds,
        and which one is best depends entirely on the machine you have.
      </p>
      {/* Beginners' real fear is "will this break my computer." Name it once, here. */}
      <p className="sw-muted sw-setup-safety">
        Models download into a folder RigMatch manages — nothing is installed system-wide, and you can delete them any time.
      </p>

      {checked && !isScanning && (
        <div className={comfyMissing ? 'sw-setup-result partial' : 'sw-setup-result ok'}>
          <div className="sw-setup-result-head">
            <span className={comfyMissing ? 'sw-check-circle partial' : 'sw-check-circle'} aria-hidden="true">
              {comfyMissing ? <AlertTriangle /> : <Check />}
            </span>
            {/*
              The headline has to survive the one case it was wrong in. "You're
              all set" was said to people whose goal needed a second program
              nobody had looked for — a confident false statement of exactly the
              kind this app exists to stop making.
            */}
            <strong>{comfyMissing ? 'Almost — one more program' : "You're all set!"}</strong>
            <button type="button" className="sw-link" onClick={onCheckComputer}>Check again</button>
          </div>
          <ResultRow
            label="Local AI found"
            detail={<><Explain id="ollama">Ollama</Explain> is installed and running</>}
          />
          <ResultRow label="Strong graphics card" detail={`${gpu} — great for local AI`} />
          <ResultRow label="Plenty of space" detail={`${freeGb} GB free for models`} />
          {comfySetup?.needed && (
            comfySetup.ready ? (
              <ResultRow
                label="Picture-making ready"
                detail={`ComfyUI is running${comfySetup.checkpoint ? ` with ${comfySetup.checkpoint}` : ''}`}
              />
            ) : (
              <div className="sw-setup-missing">
                <strong>ComfyUI not found</strong>
                <p>
                  You picked something that makes pictures or video. Ollama cannot do that — it is
                  ComfyUI's job, a separate free program RigMatch does not install. Everything else
                  here works without it.
                </p>
                {comfySetup.onFind && (
                  <button
                    type="button"
                    className="sw-gold-pill sw-setup-find"
                    onClick={() => void comfySetup?.onFind?.()}
                  >
                    <ScanLine aria-hidden="true" />
                    Find ComfyUI for me
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}

      {attempted && !checked && !isScanning && (
        <div className="sw-setup-result error">
          <div className="sw-setup-result-head">
            <span className="sw-check-circle error" aria-hidden="true"><X /></span>
            <strong>We couldn't find Ollama</strong>
          </div>
          <p className="sw-muted sw-setup-error-copy">
            RigMatch needs <Explain id="ollama">Ollama</Explain> — a free program that does the actual
            work of running models on your PC.
            {isLinux ? (
              <> Copy the one-line command below into a <Explain id="terminal">terminal</Explain>, then check again.</>
            ) : (
              " RigMatch can download and start the installer for you — you won't need to leave this window."
            )}
          </p>

          {isLinuxScript ? (
            <div className="sw-install-script">
              <code>{install.command}</code>
              <button
                type="button"
                className="sw-ghost-pill"
                onClick={() => void copyText(install.command).then((ok) => {
                  setCopiedCommand(ok ? 'copied' : 'failed');
                  window.setTimeout(() => setCopiedCommand('idle'), 2400);
                })}
              >
                {copiedCommand === 'copied' ? 'Copied' : copiedCommand === 'failed' ? 'Select it above instead' : 'Copy'}
              </button>
            </div>
          ) : installerReady ? (
            <div className="sw-setup-error-actions">
              <button type="button" className="sw-gold-pill" onClick={() => onLaunchOllamaInstaller(install.installerPath)}>
                <Download aria-hidden="true" />
                Run the installer
              </button>
              <span className="sw-muted sw-install-hint">Follow Ollama's prompts, then come back and check again.</span>
            </div>
          ) : installDownloading ? (
            <div className="sw-install-progress">
              <div className="sw-install-progress-bar"><i style={{ width: `${install.percent}%` }} /></div>
              <span className="sw-muted">Downloading Ollama… {install.percent}%</span>
            </div>
          ) : (
            <div className="sw-setup-error-actions">
              <button type="button" className="sw-gold-pill" onClick={isDesktop ? onStartOllamaInstall : onGetOllama}>
                <Download aria-hidden="true" />
                {installFailed ? 'Try the download again' : isLinux ? 'Show the install command' : 'Install Ollama for me'}
              </button>
              <button type="button" className="sw-ghost-pill" onClick={onGetOllama}>
                <ExternalLink aria-hidden="true" />
                Open ollama.com
              </button>
            </div>
          )}

          {installFailed && <p className="sw-muted sw-install-hint">{install.error}</p>}

          <button type="button" className="sw-ghost-pill sw-install-recheck" onClick={runCheck}>
            <RefreshCw aria-hidden="true" />
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, detail }: { label: string; detail: ReactNode }) {
  return (
    <div className="sw-result-row">
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
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
  generation, wizardModels, modelsLoading, shortlistIds, shortlistedRows, onTogglePick, onChooseForMe, initialDream }: SimpleWizardProps) {
  // Opens on the dream matching the splash's primary goal, when there is one
  // — the person already answered this question once.
  const [dream, setDream] = useState<DreamFilterId>(initialDream ?? 'all');
  const [showAll, setShowAll] = useState(false);
  const lineupFull = shortlistedRows.length >= 5;

  const filtered = useMemo(() => {
    if (dream === 'all') return wizardModels;
    return wizardModels.filter((m) => m.dreamTags.includes(dream as Exclude<DreamFilterId, 'all'>));
  }, [wizardModels, dream]);

  const visible = showAll ? filtered : filtered.slice(0, 9);
  const dreamNoun: Record<Exclude<DreamFilterId, 'all'>, string> = {
    talk: 'love a good conversation',
    write: 'are great writing partners',
    code: 'are handy coding buddies',
    image: 'can make images',
    video: 'can make video',
  };
  // Image and video makers are deliberately absent from this grid — they
  // cannot be benchmarked — so an empty grid here says nothing about whether
  // this PC can make images or video. It said "No contestants can make video
  // on this PC", which was simply false: the models exist, ship in the
  // catalogue, and run. Report what is actually true of the machine.
  const makers = dream === 'video' ? generation?.video : dream === 'image' ? generation?.image : undefined;
  const makerNoun = dream === 'video' ? 'video maker' : 'image maker';
  const countLine = dream === 'all'
    ? `${filtered.length} contestant${filtered.length === 1 ? '' : 's'} fit your PC`
    : filtered.length === 0
      ? (makers && makers.total > 0
        ? `${makers.total} ${makerNoun}${makers.total === 1 ? '' : 's'} run on this PC — they just don't compete here`
        : `No contestants ${dreamNoun[dream]} on this PC`)
      : `${filtered.length} contestant${filtered.length === 1 ? '' : 's'} ${dreamNoun[dream]} · all of them fit your PC`;

  return (
    <div className="sw-pick">
      <div className="sw-dream">
        <span className="sw-eyebrow">Who's your dream model?</span>
        <div className="sw-dream-chips" role="group" aria-label="Filter contestants by what you want">
          {DREAM_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                type="button"
                className={`sw-chip ${dream === chip.id ? 'active' : ''}`}
                aria-pressed={dream === chip.id}
                onClick={() => { setDream(chip.id); setShowAll(false); }}
              >
                <Icon aria-hidden="true" />
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sw-pick-count">
        <span>{modelsLoading ? 'Bringing out the contestants…' : countLine}</span>
        {dream !== 'all' && <button type="button" className="sw-link" onClick={() => setDream('all')}>Show everyone instead</button>}
      </div>

      {/* The escape hatch for "I don't know how to choose" — which is most of
          this audience. Fills the lineup with the best-fitting models. */}
      {!modelsLoading && filtered.length > 0 && shortlistedRows.length === 0 && (
        <button type="button" className="sw-gold-pill sw-choose-for-me" onClick={onChooseForMe}>
          <Sparkles aria-hidden="true" />
          Not sure? Choose 5 for me
        </button>
      )}

      {modelsLoading ? (
        <div className="sw-card-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sw-card sw-card-skeleton" aria-hidden="true" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="sw-pick-empty">
          {dream === 'image' || dream === 'video' ? (
            // Honest rather than empty: these models exist, they just are not
            // Speed Dating contestants — they render instead of chatting.
            <>
              {makers && makers.total > 0 ? (
                <p>
                  {listNames(makers.names)} run on this PC.{' '}
                  {makers.installed > 0
                    ? `${makers.installed === makers.total ? 'Both are' : `${makers.installed} of them is`} already installed. `
                    : 'They need downloading first. '}
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
          <button type="button" className="sw-chip active" onClick={() => setDream('all')}><Sparkles aria-hidden="true" />Surprise me — show everyone</button>
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
            <button type="button" className="sw-link sw-show-more" onClick={() => setShowAll(true)}>Show more models that fit your PC</button>
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
  const fitLabel = model.fitTier === 'great' ? 'Runs great on your PC' : model.fitTier === 'well' ? 'Runs well on your PC' : 'Good fit — a little slower';
  return (
    <article className={`sw-card${picked ? ' picked' : ''}`}>
      {picked && <span className="sw-card-pick-badge"><Heart aria-hidden="true" />Pick {pickIndex}</span>}
      <img className="sw-card-avatar" src={getModelAvatarSrc(model.row.displayName)} alt="" />
      <div className="sw-card-name">
        <strong>{model.name}</strong>
        {/* The real pull tag: friendly names strip the variant, so Qwen2.5-coder
            and Qwen2.5 were identical cards down to the avatar and persona. */}
        <code className="sw-card-id">{model.row.displayName}</code>
        <em>{model.epithet}</em>
        {/* Size and whether it's already here — so "Download 5 models" is never a
            blind commitment, and installed picks are visibly free. */}
        <span className="sw-card-size">
          {model.row.installed
            ? '✓ Already on your PC'
            : model.row.sizeGb
              ? <Explain id="download-size">{`${model.row.sizeGb} GB download`}</Explain>
              : 'Size unknown'}
        </span>
        {/* Collapsed siblings get one honest line instead of N clone cards. */}
        {(model.variantCount ?? 0) > 1 && (
          <span className="sw-card-variants">
            Best of {model.variantCount} sizes for your PC · all sizes in Advanced
          </span>
        )}
      </div>
      <div className="sw-card-goodfor">
        <span className="sw-eyebrow">Good for</span>
        <p>{model.goodForLine}</p>
      </div>
      <span className={`sw-fit-badge ${model.fitTier === 'slower' ? 'gold' : 'green'}`} title={model.fitDetail}>
        <Heart aria-hidden="true" />{fitLabel}
        {model.fitDetail && <i className="sw-fit-detail"><ExplainText text={model.fitDetail} /></i>}
      </span>
      {/* A full lineup used to leave "Lineup full" sitting in the primary
          button — so most cards in the grid presented a dead gold control as
          their call to action. It is a status, so it reads as one, and it says
          what to do about it. */}
      {disabled ? (
        <p className="sw-card-full">Lineup full — drop one from your lineup to swap it in.</p>
      ) : (
        <button
          type="button"
          className={picked ? 'sw-card-btn picked' : 'sw-card-btn'}
          onClick={onToggle}
        >
          {picked ? 'Picked ✓ · Click to remove' : '♥ Pick'}
        </button>
      )}
    </article>
  );
}

function LineupTray({ shortlistedRows, onRemove }: { shortlistedRows: ModelRow[]; onRemove: (row: ModelRow) => void }) {
  return (
    <div className="sw-lineup-tray">
      <span className="sw-eyebrow">Your lineup · {shortlistedRows.length} of 5{shortlistedRows.length ? ' · click to remove' : ''}</span>
      <div className="sw-lineup-slots">
        {Array.from({ length: 5 }).map((_, index) => {
          const row = shortlistedRows[index];
          return row ? (
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
          ) : (
            <span key={`empty-${index}`} className="sw-lineup-slot empty" aria-hidden="true"><Plus /></span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download

function DownloadScreen({ shortlistedRows, pullProgressByModel }: SimpleWizardProps) {
  const readyCount = shortlistedRows.filter((row) => row.installed).length;
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
            ? (pull?.error || pull?.status || 'Download failed')
            : status === 'paused'
              ? 'Paused'
              : status === 'queued'
                ? 'Waiting in line'
                : [
              pull?.completedBytes != null && pull?.totalBytes
                ? `${formatBytes(pull.completedBytes)} of ${formatBytes(pull.totalBytes)}`
                : (pull?.status || 'Downloading…'),
              pull?.speedBps ? formatBytesPerSecond(pull.speedBps) : '',
              getEtaLabel(pull),
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
              {status === 'done' ? '✓ On your PC'
                : status === 'failed' ? "Didn't download"
                : status === 'paused' ? 'Paused'
                : status === 'downloading' ? `${Math.round(percent)}%`
                : 'Up next'}
            </span>
          </div>
        );
      })}
      <div className="sw-info-note">
        <Info aria-hidden="true" />
        <span>Downloads pick up where they left off if you close RigMatch. Your other apps won't slow down.</span>
      </div>
    </div>
  );
}

/** Plain-language time-left estimate for a download row ("about 2 minutes left"). */
function getEtaLabel(pull?: PullProgressUpdate): string {
  if (!pull?.speedBps || !pull.totalBytes || pull.completedBytes == null) return '';
  const secondsLeft = (pull.totalBytes - pull.completedBytes) / pull.speedBps;
  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return '';
  if (secondsLeft < 60) return 'under a minute left';
  const minutes = Math.round(secondsLeft / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`;
}

// ---------------------------------------------------------------------------
// Compare

function CompareScreen({ shortlistedRows, runProgress }: SimpleWizardProps) {
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

  const remainingLabel = elapsedMs > 0 && totalQuestions > 0 && questionsDone >= 3
    ? formatDuration((elapsedMs / questionsDone) * (totalQuestions - questionsDone)).replace('~', '')
    : '';

  // Turn the suite's internal question label into something a beginner reads as
  // a skill being tested, not a format spec.
  const rawLabel = (runProgress?.questionLabel ?? '').toLowerCase();
  const plainRoundLabel = !rawLabel
    ? 'Warming up…'
    : /json|tool/.test(rawLabel) ? 'Following a precise format'
    : /accuracy|trap|truth/.test(rawLabel) ? 'Admitting what it doesn’t know'
    : /instruction/.test(rawLabel) ? 'Following instructions exactly'
    : /coding|code/.test(rawLabel) ? 'Writing a bit of code'
    : /summar/.test(rawLabel) ? 'Summarising clearly'
    : /reason/.test(rawLabel) ? 'Thinking a problem through'
    : /safety|boundary/.test(rawLabel) ? 'Handling a tricky request'
    : /format|structure/.test(rawLabel) ? 'Keeping answers well-organised'
    : 'Everyday questions';

  return (
    <div className="sw-compare" style={{ backgroundImage: `url(${speedDateShow})` }}>
      <div className="sw-compare-inner">
        {/* The raw benchmark prompt is dense jargon ("Return only valid JSON…
            use keys intent, action, target") and was the hero text on a beginner
            screen. Lead with a plain-English round label; keep the exact prompt
            one click away for anyone who wants to check the methodology. */}
        <div className="sw-compare-question">
          {/* Naming the model makes the per-model round count read as intended
              rather than as the run resetting. */}
          <span className="sw-eyebrow">
            {totalRounds > 0 && modelCount > 1
              ? `Model ${modelNumber} of ${modelCount} · Round ${round} of ${totalRounds}`
              : totalRounds > 0
                ? `Round ${round} of ${totalRounds}`
                : 'Getting started'}
          </span>
          <p>{plainRoundLabel}</p>
          <button type="button" className="sw-link" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? 'Hide the exact question' : 'See the exact question'}
          </button>
          {showPrompt && <p className="sw-compare-raw">&ldquo;{question}&rdquo;</p>}
        </div>
        <div className="sw-podiums">
          {shortlistedRows.map((row, index) => {
            const isActive = row.displayName === activeModel;
            // A model is "done" once the run has moved past its index. Per-model
            // scores aren't tracked in progress, so only the just-finished model
            // (lastResult) shows a number; earlier ones read "Answered".
            const isDone = !isActive && index < completed;
            const state = isActive ? 'answering' : isDone ? 'done' : 'waiting';
            const rowScore = runProgress?.lastResult?.model === row.displayName ? runProgress?.lastResult?.total : undefined;
            return (
              <div key={row.displayName} className={`sw-podium ${state}`}>
                <img src={getModelAvatarSrc(row.displayName)} alt="" />
                {/* The name they picked, not the raw tag. Pick shows
                    "Qwen2.5"; showing "qwen2.5:7b" here reads as a different
                    contestant to someone who does not know the notation. */}
                <strong>{getFriendlyModelName(row.displayName)}</strong>
                <span className={`sw-podium-pill ${state}`}>
                  {state === 'answering' ? <><i /><i /><i /> Answering</> : state === 'done' ? '✓ Done' : 'Waiting'}
                </span>
                <em>{state === 'answering' ? 'Thinking it over…' : state === 'done' ? (rowScore != null ? `Scored ${rowScore}` : 'Answered') : 'Up next'}</em>
              </div>
            );
          })}
        </div>
        <div className="sw-show-progress">
          <div className="sw-show-progress-head">
            <span>Show progress</span>
            {/* Counts every question the whole run will ask, so the label and the
                bar move together and neither ever goes backwards. */}
            <span>
              {totalQuestions > 0
                ? `${questionsDone} of ${totalQuestions} questions`
                : `${overallPercent}%`}
              {remainingLabel && <em className="sw-eta">· about {remainingLabel} left</em>}
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
            <span className="sw-eyebrow">
              {activeModel ? `${getFriendlyModelName(activeModel)}'s answers so far` : 'Answers so far'}
            </span>
            {answeredAverage != null && (
              <em>{answered.length} scored · averaging {answeredAverage}</em>
            )}
          </div>
          {answered.length === 0 ? (
            <p className="sw-muted">
              Every answer is scored out of 100 as it arrives. They'll show up here.
            </p>
          ) : (
            <ol aria-label="Answer scores for the model currently answering">
              {answered.map((score, index) => (
                <li key={index} className={score >= 85 ? 'good' : score >= 70 ? 'fair' : 'poor'}>
                  {score}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Winner

function WinnerScreen({ winner, shortlistedRows, lineupResults, onChatWithWinner, onOpenScorecard, onShareScore, onRunAgain, onSwitchToAdvanced }: SimpleWizardProps) {
  if (!winner) {
    return <div className="sw-winner"><p className="sw-muted">Run the show to crown your Top Match.</p></div>;
  }
  const shortName = winner.model.split(':')[0];
  const capName = shortName.charAt(0).toUpperCase() + shortName.slice(1);
  return (
    <div className="sw-winner">
      <div className="sw-confetti" aria-hidden="true">
        {['gold', 'pink', 'green', 'blue', 'gold', 'pink'].map((c, i) => (
          <i key={i} className={`sw-confetti-piece ${c}`} style={{ left: `${12 + i * 15}%`, animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <div className="sw-winner-reveal">
        <div className="sw-winner-avatar-wrap">
          <img src={getModelAvatarSrc(winner.model)} alt="" />
          <span className="sw-winner-trophy" aria-hidden="true"><Trophy /></span>
        </div>
        <div className="sw-winner-copy">
          <span className="sw-eyebrow gold">Your top match</span>
          <strong>{getFriendlyModelName(winner.model)}</strong>
          <em className="sw-winner-tag">{winner.model}</em>
          <span className="sw-winner-grade">
            <b>{winner.scoreLabel}</b>
            <em>Match · Grade {winner.grade}</em>
          </span>
          {/* Say what the number means — a beginner has never seen either scale. */}
          <p className="sw-winner-why">
            Best combination of speed, answer quality, and fit for your PC out of the {shortlistedRows.length} you
            tested — this is its <Explain id="match-score">Match Score</Explain>.
          </p>
          {/* Sharing belongs at the moment of the result, not three clicks away
              in Advanced Mode where a Simple Mode user will never find it. */}
          <button type="button" className="sw-winner-share" onClick={onShareScore}>
            <Share2 aria-hidden="true" />
            Share your score
          </button>
        </div>
      </div>

      {/* The rest of the comparison. Announcing one winner and hiding the other
          four made the show's whole output a single number, and left "out of
          the 5 you tested" as a claim the screen did not back up. */}
      {(lineupResults?.length ?? 0) > 1 && (
        <div className="sw-scoreboard">
          <span className="sw-eyebrow">How the lineup finished</span>
          <ol>
            {lineupResults!.map((result, index) => (
              <li key={result.model} className={result.model === winner.model ? 'winner' : undefined}>
                <b className="sw-place">{index + 1}</b>
                <img src={getModelAvatarSrc(result.model)} alt="" />
                <span className="sw-scoreboard-name">
                  {result.name}
                  <em>{result.model}</em>
                </span>
                <span className="sw-scoreboard-score">
                  {result.scoreLabel}
                  <em>Grade {result.grade}</em>
                </span>
              </li>
            ))}
          </ol>
          <p className="sw-muted sw-scoreboard-note">
            Every one of these ran the same questions on your PC. A close second may still
            suit you better — try chatting with either.
          </p>
        </div>
      )}

      <div className="sw-doors">
        <div className="sw-door chat">
          <div className="sw-door-img" style={{ backgroundImage: `url(${romanceHero})` }} aria-hidden="true" />
          <span className="sw-eyebrow gold">The happy ending</span>
          <strong>Start chatting with {capName}</strong>
          <p>Open RigMatch Chat and talk to your new match right away — it's already on your PC.</p>
          <button type="button" className="sw-door-btn gold" onClick={onChatWithWinner}><MessageSquare aria-hidden="true" />Chat with {capName}</button>
        </div>
        <div className="sw-door advanced">
          <div className="sw-door-img" style={{ backgroundImage: `url(${modelTestArt})` }} aria-hidden="true" />
          <span className="sw-eyebrow blue">You've graduated</span>
          <strong>Step into Advanced Mode</strong>
          <p>The full control room — every model, every score, custom tests. Your Top Match comes with you.</p>
          <button type="button" className="sw-door-btn blue" onClick={onSwitchToAdvanced}><ExternalLink aria-hidden="true" />Switch to Advanced</button>
        </div>
      </div>

      <div className="sw-winner-links">
        <button type="button" className="sw-link" onClick={onOpenScorecard}>See the full scorecard</button>
        <button type="button" className="sw-link" onClick={onRunAgain}>Run the show again</button>
      </div>
    </div>
  );
}
