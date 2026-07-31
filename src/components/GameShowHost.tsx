import {
  Bot,
  Boxes,
  Download,
  Gauge,
  HelpCircle,
  History,
  ScanLine,
  Settings,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { NavId } from './SideMenu';

type UiMode = 'beginner' | 'advanced';

type HostTopPick = {
  row: {
    displayName: string;
  };
} | null;

type GameShowHostProps = {
  uiMode: UiMode;
  activeNavLabel: string;
  ollamaReady: boolean;
  installedCount: number;
  modelCount: number;
  shortlistedCount: number;
  uninstalledShortlistedCount: number;
  queuedCount: number;
  scoredCount: number;
  topPick?: HostTopPick;
  isBusy: boolean;
  onSelectNav: (id: NavId) => void;
  onCheckRig: () => void;
  onOpenTutorial: () => void;
};

export function GameShowHost({
  uiMode,
  activeNavLabel,
  ollamaReady,
  installedCount,
  modelCount,
  shortlistedCount,
  uninstalledShortlistedCount,
  queuedCount,
  scoredCount,
  topPick,
  isBusy,
  onSelectNav,
  onCheckRig,
  onOpenTutorial,
}: GameShowHostProps) {
  const hasWinner = Boolean(topPick);
  const hasEnoughPicks = shortlistedCount >= 2 || scoredCount > 0 || hasWinner;
  const downloadsReady = hasEnoughPicks && uninstalledShortlistedCount === 0;
  const hasCompared = scoredCount > 0 || hasWinner;
  const rounds = [
    { id: 'setup', label: 'Setup', detail: ollamaReady ? 'Local AI ready' : 'Check local AI', icon: ScanLine, done: ollamaReady, unlocked: true },
    { id: 'pick', label: 'Pick', detail: shortlistedCount > 0 ? `${shortlistedCount}/5 picked` : 'Choose models', icon: Boxes, done: hasEnoughPicks, unlocked: ollamaReady },
    {
      id: 'download',
      label: 'Download',
      detail: !hasEnoughPicks
        ? 'After picks'
        : uninstalledShortlistedCount > 0
          ? `${uninstalledShortlistedCount} needed`
          : queuedCount > 0
            ? `${queuedCount} queued`
            : 'Lineup ready',
      icon: Download,
      done: downloadsReady,
      unlocked: hasEnoughPicks,
    },
    { id: 'test', label: 'Compare', detail: scoredCount > 0 ? `${scoredCount} scored` : 'Run same prompts', icon: Gauge, done: hasCompared, unlocked: downloadsReady },
    { id: 'winner', label: 'Winner', detail: topPick?.row.displayName ?? 'Crown a match', icon: Trophy, done: hasWinner, unlocked: hasCompared },
  ];
  const activeRound = rounds.find((round) => round.unlocked && !round.done)?.id ?? 'winner';

  let title = 'Find your best local AI';
  let message = 'One guided path: check this PC, pick models that fit, run the same questions, then use the winner.';
  let primaryLabel = 'Browse models';
  let primaryCta = 'Find My Best Model';
  let primaryIcon: LucideIcon = Boxes;
  let primaryAction = () => onSelectNav('models');

  if (!ollamaReady) {
    title = 'Start with a local check';
    message = 'RigMatch checks Ollama or LM Studio on this computer. No account, no telemetry, no cloud upload.';
    primaryLabel = isBusy ? 'Checking local' : 'Check local';
    primaryCta = isBusy ? 'Checking This PC' : 'Find My Best Model';
    primaryIcon = ScanLine;
    primaryAction = () => {
      onSelectNav('lan');
      onCheckRig();
    };
  } else if (hasWinner) {
    title = `${topPick?.row.displayName} is your Top Match`;
    message = 'Use the winner in chat, or clear the Top Match when you want to compare for a different job.';
    primaryLabel = 'Meet top pick';
    primaryCta = 'Use Top Match';
    primaryIcon = Trophy;
    primaryAction = () => onSelectNav('agent');
  } else if (scoredCount > 0) {
    title = 'Scorecards are ready';
    message = 'Compare the tested models, then choose the one you want RigMatch to remember as your Top Match.';
    primaryLabel = 'View scorecards';
    primaryCta = 'Find My Best Model';
    primaryIcon = History;
    primaryAction = () => onSelectNav('history');
  } else if (hasEnoughPicks && !downloadsReady) {
    title = queuedCount > 0 ? 'Downloads are queued' : 'Download the picked models';
    message = `${uninstalledShortlistedCount} picked model${uninstalledShortlistedCount === 1 ? '' : 's'} still need to be installed before RigMatch can compare the lineup.`;
    primaryLabel = queuedCount > 0 ? 'Open downloads' : 'Download lineup';
    primaryCta = 'Find My Best Model';
    primaryIcon = Download;
    primaryAction = () => onSelectNav('models');
  } else if (downloadsReady) {
    title = 'Ready to compare';
    message = 'RigMatch will ask each picked model the same questions and rank the result for this computer.';
    primaryLabel = 'Open comparison';
    primaryCta = 'Find My Best Model';
    primaryIcon = Trophy;
    primaryAction = () => onSelectNav('speedDate');
  } else if (installedCount > 0 || modelCount > 0) {
    title = 'Pick contestants for the lineup';
    message = 'Choose a few models that fit your hardware. The yellow Pick Me button adds them to the comparison lineup.';
    primaryLabel = 'Pick models';
    primaryCta = 'Find My Best Model';
    primaryIcon = Boxes;
    primaryAction = () => onSelectNav('models');
  }

  if (uiMode === 'advanced') {
    return (
      <section className="advanced-host-bar" aria-label="Advanced Mode control booth">
        <Trophy aria-hidden="true" />
        <span>
          Advanced Control Room: {activeNavLabel} open. Power tools are visible; Simple Mode remains the guided path. {ollamaReady ? `${installedCount} installed` : 'Local AI needs attention'} · {shortlistedCount}/5 picked · {scoredCount} scored.
        </span>
        <button type="button" className="mini-button outline" onClick={() => onSelectNav('models')}>
          <Boxes aria-hidden="true" />
          Models
        </button>
        <button type="button" className="mini-button outline" onClick={() => onSelectNav('settings')}>
          <Settings aria-hidden="true" />
          Settings
        </button>
      </section>
    );
  }

  const PrimaryIcon = primaryIcon;

  return (
    <section className="game-show-guide" aria-label="Simple Mode host guide">
      <div className="host-card">
        <div className="host-badge" aria-hidden="true">
          <Bot />
        </div>
        <div>
          <span>Simple Mode host</span>
          <strong>{title}</strong>
          <em>{message}</em>
        </div>
      </div>

      <ol className="wizard-rounds" aria-label="RigMatch guided rounds">
        {rounds.map((round) => {
          const Icon = round.icon;
          const className = round.done ? 'done' : round.id === activeRound ? 'active' : 'locked';
          return (
            <li key={round.id} className={className}>
              <button
                type="button"
                onClick={() => {
                  if (round.id === 'setup') onSelectNav('lan');
                  if (round.id === 'pick') onSelectNav('models');
                  if (round.id === 'download') onSelectNav('models');
                  if (round.id === 'test') onSelectNav('speedDate');
                  if (round.id === 'winner') onSelectNav('agent');
                }}
                disabled={!round.unlocked}
              >
                <Icon aria-hidden="true" />
                <span>{round.label}</span>
                <strong>{round.detail}</strong>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="host-actions">
        <span>Step now: {primaryLabel}. 100% local testing; no account or telemetry.</span>
        <button type="button" className="primary-button compact simple-primary-action" onClick={primaryAction} disabled={isBusy && !ollamaReady}>
          <PrimaryIcon aria-hidden="true" />
          <span>{primaryCta}</span>
          <em>{primaryLabel}</em>
        </button>
        <button type="button" className="mini-button outline" onClick={onOpenTutorial}>
          <HelpCircle aria-hidden="true" />
          Tour
        </button>
        <button type="button" className="mini-button outline" onClick={() => onSelectNav('settings')}>
          <Settings aria-hidden="true" />
          Modes
        </button>
      </div>
    </section>
  );
}
