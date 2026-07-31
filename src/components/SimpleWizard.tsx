import { useMemo, useState } from 'react';
import {
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
  Sparkles,
  Trophy,
  Video,
  X,
} from 'lucide-react';
import type { ModelRow, OllamaInstallProgress, PullProgressUpdate, SystemProfile } from '../types';
import { formatBytes, formatBytesPerSecond } from '../lib/format';
import { getModelAvatarSrc, HOST_AVATAR_SRC } from '../lib/modelAvatars';
import { getFriendlyModelName } from '../lib/modelCatalog';
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
  dreamTags: Array<Exclude<DreamFilterId, 'all'>>;
};

type SimpleRunProgress = {
  phase: 'running' | 'complete' | 'failed';
  currentModel: string;
  percent: number;
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

type StepId = 'setup' | 'pick' | 'download' | 'compare' | 'winner';
const STEPS: StepId[] = ['setup', 'pick', 'download', 'compare', 'winner'];
const STEP_LABELS: Record<StepId, string> = {
  setup: 'Setup',
  pick: 'Pick',
  download: 'Download',
  compare: 'Compare',
  winner: 'Winner',
};

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
  /** Fills the lineup with the best-fitting models for people who can't choose. */
  onChooseForMe: () => void;
  pullProgressByModel: Record<string, PullProgressUpdate>;
  onStartDownloads: () => void;
  isListTesting: boolean;
  /** True while any benchmark is running (renderer or main-process state). */
  benchmarkActive: boolean;
  runProgress: SimpleRunProgress;
  onStartShow: () => void;
  onStopShow: () => void;
  winner: { model: string; score: number; grade: string } | null;
  onChatWithWinner: () => void;
  onOpenScorecard: () => void;
  onRunAgain: () => void;
  onSwitchToAdvanced: () => void;
};

export function SimpleWizard(props: SimpleWizardProps) {
  const { system, ollamaReady, shortlistedRows, winner, benchmarkActive } = props;

  const setupDone = ollamaReady;
  const pickDone = shortlistedRows.length >= 1;
  const allInstalled = pickDone && shortlistedRows.every((row) => row.installed);
  const downloadDone = allInstalled;
  // A pre-existing Top Match must not mark Compare done while the show is
  // still running, or the wizard skips the Compare stage straight to Winner.
  const compareDone = Boolean(winner) && !benchmarkActive;
  const winnerDone = compareDone;

  const stepState = useMemo(() => {
    const done: Record<StepId, boolean> = { setup: setupDone, pick: pickDone, download: downloadDone, compare: compareDone, winner: winnerDone };
    const unlocked: Record<StepId, boolean> = {
      setup: true,
      pick: setupDone,
      download: pickDone,
      compare: downloadDone,
      winner: compareDone,
    };
    return { done, unlocked };
  }, [setupDone, pickDone, downloadDone, compareDone, winnerDone]);

  const furthestStep: StepId = !setupDone ? 'setup' : !pickDone ? 'pick' : !downloadDone ? 'download' : !compareDone ? 'compare' : 'winner';
  // Simple Mode always opens at Setup — it's a guided wizard, so launch at step
  // one rather than jumping ahead to the furthest unlocked step. The step nav
  // still lets returning users click straight to a completed step.
  const [chosenStep, setChosenStep] = useState<StepId>('setup');

  // Derive the visible step: honor the user's choice, but clamp to the furthest
  // unlocked step if a prerequisite was lost, and auto-advance Compare -> Winner
  // once the show crowns a match. Deriving avoids setState-in-effect churn.
  const step: StepId = compareDone && chosenStep === 'compare'
    ? 'winner'
    : stepState.unlocked[chosenStep] ? chosenStep : furthestStep;
  const setStep = setChosenStep;

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

  const goNext = () => {
    if (step === 'pick') props.onStartDownloads();
    if (step === 'download') props.onStartShow();
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  // Size + time on the commitment buttons: "Download 5 models" with no GB and no
  // ETA is the scariest unqualified ask in the flow, and the data is right here.
  const pendingGb = shortlistedRows
    .filter((row) => !row.installed)
    .reduce((sum, row) => sum + (row.sizeGb ?? 0), 0);
  const downloadSuffix = pendingGb > 0 ? ` · ${pendingGb.toFixed(1)} GB` : ' · already on your PC';
  const showMinutes = Math.max(1, Math.round(shortlistedRows.length * 3));

  const nextLabel: Partial<Record<StepId, string>> = {
    setup: 'Next · Meet the contestants',
    pick: `Next · Download ${shortlistedRows.length} model${shortlistedRows.length === 1 ? '' : 's'}${downloadSuffix}`,
    download: `Next · Start the show · ~${showMinutes} min`,
    compare: 'Next · Meet the winner',
  };

  return (
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
          {STEPS.map((id, index) => {
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
        <div className="sw-host-strip">
          <img className="sw-host-avatar" src={HOST_AVATAR_SRC} alt="" />
          <div className="sw-host-bubble">
            <span>The host</span>
            <p>{HOST_COPY[step]}</p>
          </div>
        </div>

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
              onClick={step === 'compare' ? props.onStopShow : goBack}
              title={step === 'compare'
                ? 'Stops after the current question. Models already scored keep their results.'
                : undefined}
            >
              <ArrowLeft aria-hidden="true" />
              {step === 'compare' ? 'Stop the show' : 'Back'}
            </button>
          )}
        </div>
        {step === 'pick'
          ? <LineupTray shortlistedRows={shortlistedRows} onRemove={props.onTogglePick} />
          : <span className="sw-footer-hint">{footerHint(step, system, shortlistedRows.length)}</span>}
        <div className="sw-footer-right">
          {step !== 'winner' && (
            <button
              type="button"
              className="sw-gold-pill"
              onClick={goNext}
              disabled={!stepComplete[step]}
              title={stepComplete[step] ? undefined : nextBlockedHint(step)}
            >
              {nextLabel[step]}
              <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function footerHint(step: StepId, _system: SystemProfile, pickCount: number): string {
  switch (step) {
    case 'setup': return 'Your computer is ready for the show';
    case 'download': return 'Heads up: the show works your GPU, CPU, and fans hard until a winner is crowned — close heavy apps first';
    case 'compare': return 'Scores appear live — the winner is crowned after the last round';
    case 'winner': return 'RigMatch remembers your Top Match — find it any time in the header';
    default: return pickCount ? '' : 'Pick at least 1 to continue';
  }
}

function nextBlockedHint(step: StepId): string {
  switch (step) {
    case 'setup': return 'Check your computer first';
    case 'pick': return 'Pick at least 1 to continue';
    case 'download': return 'Waiting for downloads to finish';
    case 'compare': return 'The show is still running';
    default: return '';
  }
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
}: SimpleWizardProps) {
  const checked = ollamaReady; // a successful check makes Ollama ready
  const gpu = system.gpu.model || 'your graphics card';
  const freeGb = Math.round(system.storage.availableGb || 0);
  // Only surface the "couldn't find Ollama" card after the user actually ran a
  // check that came back not-ready — never on first load before they've clicked.
  const [attempted, setAttempted] = useState(false);
  const runCheck = () => { setAttempted(true); onCheckComputer(); };

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
      <h2>Let's check your computer</h2>
      <p className="sw-muted">
        RigMatch looks at your graphics card and memory to find AI models that fit. Everything stays on your PC — no account, no cloud.
      </p>
      {/* Beginners' real fear is "will this break my computer." Name it once, here. */}
      <p className="sw-muted sw-setup-safety">
        Models download into a folder RigMatch manages — nothing is installed system-wide, and you can delete them any time.
      </p>
      <button type="button" className="sw-gold-pill sw-cta" onClick={runCheck} disabled={isScanning}>
        {isScanning ? <RefreshCw className="sw-spin" aria-hidden="true" /> : <ScanLine aria-hidden="true" />}
        {isScanning ? 'Checking your computer…' : 'Check my computer'}
      </button>

      {checked && !isScanning && (
        <div className="sw-setup-result ok">
          <div className="sw-setup-result-head">
            <span className="sw-check-circle" aria-hidden="true"><Check /></span>
            <strong>You're all set!</strong>
            <button type="button" className="sw-link" onClick={onCheckComputer}>Check again</button>
          </div>
          <ResultRow label="Local AI found" detail="Ollama is installed and running" />
          <ResultRow label="Strong graphics card" detail={`${gpu} — great for local AI`} />
          <ResultRow label="Plenty of space" detail={`${freeGb} GB free for models`} />
        </div>
      )}

      {attempted && !checked && !isScanning && (
        <div className="sw-setup-result error">
          <div className="sw-setup-result-head">
            <span className="sw-check-circle error" aria-hidden="true"><X /></span>
            <strong>We couldn't find Ollama</strong>
          </div>
          <p className="sw-muted sw-setup-error-copy">
            RigMatch needs Ollama — the free local AI engine that runs models on your PC.
            {isLinux
              ? ' Copy the one-line command below into a terminal, then check again.'
              : " RigMatch can download and start the installer for you — you won't need to leave this window."}
          </p>

          {isLinuxScript ? (
            <div className="sw-install-script">
              <code>{install.command}</code>
              <button
                type="button"
                className="sw-ghost-pill"
                onClick={() => void navigator.clipboard?.writeText(install.command).catch(() => undefined)}
              >
                Copy
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

function ResultRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="sw-result-row">
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pick

function PickScreen({ wizardModels, modelsLoading, shortlistIds, shortlistedRows, onTogglePick, onChooseForMe }: SimpleWizardProps) {
  const [dream, setDream] = useState<DreamFilterId>('all');
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
  const countLine = dream === 'all'
    ? `${filtered.length} contestant${filtered.length === 1 ? '' : 's'} fit your PC`
    : `${filtered.length} contestant${filtered.length === 1 ? '' : 's'} ${dreamNoun[dream]} · all of them fit your PC`;

  return (
    <div className="sw-pick">
      <div className="sw-dream">
        <span className="sw-eyebrow">Who's your dream model?</span>
        <div className="sw-dream-chips">
          {DREAM_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                type="button"
                className={`sw-chip ${dream === chip.id ? 'active' : ''}`}
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
          <p>Hmm, nobody fits that bill on this PC — try another type or show everyone.</p>
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
            <button type="button" className="sw-link sw-show-more" onClick={() => setShowAll(true)}>Show more contestants that fit your PC</button>
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
        <em>{model.epithet}</em>
        {/* Size and whether it's already here — so "Download 5 models" is never a
            blind commitment, and installed picks are visibly free. */}
        <span className="sw-card-size">
          {model.row.installed
            ? '✓ Already on your PC'
            : model.row.sizeGb
              ? `${model.row.sizeGb} GB download`
              : 'Size unknown'}
        </span>
      </div>
      <div className="sw-card-goodfor">
        <span className="sw-eyebrow">Good for</span>
        <p>{model.goodForLine}</p>
      </div>
      <span className={`sw-fit-badge ${model.fitTier === 'slower' ? 'gold' : 'green'}`}>
        <Heart aria-hidden="true" />{fitLabel}
      </span>
      <button
        type="button"
        className={picked ? 'sw-card-btn picked' : 'sw-card-btn'}
        onClick={onToggle}
        disabled={disabled}
      >
        {picked ? 'Picked ✓ · Tap to remove' : disabled ? 'Lineup full' : '♥ Pick'}
      </button>
    </article>
  );
}

function LineupTray({ shortlistedRows, onRemove }: { shortlistedRows: ModelRow[]; onRemove: (row: ModelRow) => void }) {
  return (
    <div className="sw-lineup-tray">
      <span className="sw-eyebrow">Your lineup · {shortlistedRows.length} of 5{shortlistedRows.length ? ' · tap to remove' : ''}</span>
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
        const downloading = !installed && pull && !['complete', 'failed', 'cancelled', 'queued'].includes(pull.phase);
        const percent = pull?.percent ?? 0;
        const status: 'done' | 'downloading' | 'queued' = installed ? 'done' : downloading ? 'downloading' : 'queued';
        const meta = status === 'done'
          ? 'Ready to go'
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
              <div className="sw-dl-track" aria-hidden="true"><i style={{ width: `${status === 'done' ? 100 : status === 'downloading' ? Math.max(4, percent) : 0}%` }} /></div>
            </div>
            <span className="sw-dl-status">
              {status === 'done' ? '✓ On your PC' : status === 'downloading' ? `${Math.round(percent)}%` : 'Up next'}
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
  const activeModel = runProgress?.currentModel ?? '';
  const round = (runProgress?.questionIndex ?? 0) + 1;
  const totalRounds = runProgress?.questionTotal ?? shortlistedRows.length;
  const question = runProgress?.questionPrompt ?? 'The host is lining up the next question…';
  const percent = runProgress?.percent ?? 0;
  const completed = runProgress?.completed ?? 0;
  const [showPrompt, setShowPrompt] = useState(false);

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
          <span className="sw-eyebrow">Round {round} of {totalRounds}</span>
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
                <strong>{row.displayName}</strong>
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
            <span>Round {round} of {totalRounds}</span>
          </div>
          <div className="sw-show-progress-track" aria-hidden="true"><i style={{ width: `${Math.max(2, percent)}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Winner

function WinnerScreen({ winner, shortlistedRows, onChatWithWinner, onOpenScorecard, onRunAgain, onSwitchToAdvanced }: SimpleWizardProps) {
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
            <b>{winner.score}</b>
            <em>Match · Grade {winner.grade}</em>
          </span>
          {/* Say what the number means — a beginner has never seen either scale. */}
          <p className="sw-winner-why">
            Best combination of speed, answer quality, and fit for your PC out of the {shortlistedRows.length} you tested — scored out of 100.
          </p>
        </div>
      </div>

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
