// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlertTriangle, AudioLines, Bot, Boxes, Check, ChevronDown, ChevronUp, Code2, Download, Eye, Film, Image as ImageIcon,
  LayoutGrid, MessageSquare, Mic, RefreshCw, ScanLine, ShieldCheck, Trophy, X, type LucideIcon,
} from 'lucide-react';
import type { OllamaStatus, SystemProfile } from '../types';
import type { UiMode } from '../lib/appConfig';
import { balanceLabel } from '../lib/balance';
import type { ChannelWinner } from '../lib/channelWinners';
import type { RigPick } from '../lib/modelCatalog';
import { formatGb, topPickLabel } from '../lib/format';
import { strongestSkill } from '../lib/shareCopy';
import { WORKBENCHES, workbenchById, type Workbench, type WorkbenchId } from '../lib/workbench';
import { BalanceFader } from './BalanceFader';
import { BrandMark, MetricTile } from './CommonChrome';
import { ComfyStartButton } from './ComfyStartButton';
import { AvatarBust, MachineAvatar } from './Avatars';

export function TopDeck({
  system,
  ollama,
  lmStudio,
  uiMode,
  onUiModeChange,
  isScanning,
  onScan,
  topPick,
  onUseTopPick,
  onTestAgain,
  onClearTopPick,
  onRestoreClearedTopPicks,
  clearedTopPickCount,
  comfyFolder,
  comfyReachable,
  deckExpanded,
  onDeckExpandedChange,
  workbench,
  channelWinner,
  balance,
  onBalanceChange,
  balanceLocked = null,
  onOpenChannel,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  lmStudio: OllamaStatus;
  uiMode: UiMode;
  onUiModeChange: (mode: UiMode) => void;
  isScanning: boolean;
  onScan: () => void;
  topPick?: RigPick | null;
  onUseTopPick: (model: string) => void;
  onTestAgain: (model: string) => void;
  onClearTopPick: () => void;
  onRestoreClearedTopPicks: () => void;
  clearedTopPickCount: number;
  /** The verified ComfyUI models root, empty when nobody has set one. */
  comfyFolder: string;
  /** Whether ComfyUI answered the last status look. */
  comfyReachable: boolean;
  /** Advanced only: whether the stats strip is showing. */
  deckExpanded: boolean;
  onDeckExpandedChange: (expanded: boolean) => void;
  /** Advanced only: what is being tested, which scopes the screens and the winner. */
  workbench: WorkbenchId;
  /** The winner for a channel other than chat and All, which keep the Top Match. */
  channelWinner: ChannelWinner | null;
  /** The active channel's Balance fader. */
  balance: number;
  onBalanceChange: (value: number) => void;
  /** Why the fader is held at Speed, when nothing can judge accuracy here. */
  balanceLocked?: string | null;
  /** Opens the screen where this channel's test starts. */
  onOpenChannel: () => void;
}) {
  const gpuLabel = system.gpu.isUnifiedMemory
    ? `${system.gpu.model} · Unified Memory`
    : `${system.gpu.model}${system.gpu.vramGb ? ` ${system.gpu.vramGb}GB` : ''}`;
  const localModelCount = ollama.models.length + lmStudio.models.length;
  const localProviderReady = ollama.ready || lmStudio.ready;
  const statusTitle = ollama.ready && lmStudio.ready
    ? 'Local AI Ready'
    : lmStudio.ready
      ? 'LM Studio Ready'
      : ollama.ready
        ? 'Local AI Ready'
        : 'Local AI Not Found';
  const statusDetail = localModelCount > 0
    ? `${localModelCount} local model${localModelCount === 1 ? '' : 's'} visible across ${ollama.ready && lmStudio.ready ? 'Ollama + LM Studio' : lmStudio.ready ? 'LM Studio' : 'Ollama'}. Prompts stay on this computer.`
    : 'Start Ollama or LM Studio, then check this computer again. Nothing is uploaded.';
  /**
   * Evidence that Check Local actually ran.
   *
   * It rescans, spins for a moment, and returns a card identical to the one
   * before — so on a fast machine, with nothing changed, pressing it produces
   * no observable effect at all. Reported as "this doesn't really tell us
   * more", which was exactly right: it told you nothing, twice.
   *
   * The time is captured when the scan finishes rather than read during render.
   * A relative "2 minutes ago" would need a clock in render, which is impure
   * and would also go stale sitting on screen; a fixed clock time does not lie
   * as it ages.
   *
   * Seconds included, which is finer than anyone needs to read. Without them
   * two presses inside the same minute produce an identical line, and the whole
   * point of this is that pressing the button visibly does something.
   */
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [foundAtCheck, setFoundAtCheck] = useState<number | null>(null);
  const wasScanning = useRef(false);
  useEffect(() => {
    // The falling edge only. Watching `isScanning` alone would restamp on every
    // unrelated re-render while a scan is in flight.
    if (wasScanning.current && !isScanning) {
      setLastChecked(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setFoundAtCheck(localModelCount);
    }
    wasScanning.current = isScanning;
  }, [isScanning, localModelCount]);

  const localMachine = {
    hostname: system.hostname,
    ip: system.networks[0]?.address ?? '127.0.0.1',
    isLocal: true,
  };

  const modeClass = uiMode === 'advanced' ? 'top-deck mode-advanced' : 'top-deck mode-simple';
  // Simple Mode has no channels: its winner is always the Top Match.
  const channel = workbenchById(uiMode === 'advanced' ? workbench : 'all');
  const chatLike = channel.id === 'all' || channel.id === 'chat';
  const rankedAt = balanceLabel(balanceLocked ? 0 : balance);
  const fader = (
    <BalanceFader
      variant="mini"
      value={balance}
      onChange={onBalanceChange}
      accuracyMeans={channel.accuracyMeans}
      lockedReason={balanceLocked}
      label={`${channel.matchLabel}: accuracy or speed?`}
    />
  );
  return (
    <header className={deckExpanded ? modeClass : `${modeClass} collapsed`}>
      {/* Advanced only: on a 1440x820 laptop this strip is 122px of permanent
          chrome while the panel doing the work gets 348px for 1063px of
          content. Simple Mode has no panel to squeeze, so it keeps the full
          header. */}
      {uiMode === 'advanced' && (
        <button
          type="button"
          className="top-deck-collapse"
          onClick={() => onDeckExpandedChange(!deckExpanded)}
          aria-expanded={deckExpanded}
          title={deckExpanded ? 'Hide the stats strip and give the height to the panel' : 'Show the stats strip'}
        >
          {deckExpanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          <span className="sr-only">{deckExpanded ? 'Collapse system stats' : 'Expand system stats'}</span>
        </button>
      )}
      <div className="brand-block" aria-label="RigMatch">
        <BrandMark />
        <div>
          <h1>RigMatch</h1>
          <p>Find the best AI your PC can run. Nothing leaves this computer.</p>
          <div className="global-mode-switch" role="group" aria-label="Current interface mode">
            <span>Mode</span>
            <button
              type="button"
              className={uiMode === 'beginner' ? 'active' : ''}
              onClick={() => onUiModeChange('beginner')}
              aria-pressed={uiMode === 'beginner'}
              aria-label="Simple Mode"
              title="Simple Mode keeps RigMatch focused on the main flow"
            >
              Simple
            </button>
            <button
              type="button"
              className={uiMode === 'advanced' ? 'active' : ''}
              onClick={() => onUiModeChange('advanced')}
              aria-pressed={uiMode === 'advanced'}
              aria-label="Advanced Mode"
              title="Advanced Mode shows deeper tools and diagnostics"
            >
              Advanced
            </button>
          </div>
        </div>
      </div>

      <section className="rig-card" aria-label="Selected computer">
        <MachineAvatar host={localMachine} size="medium" />
        <div>
          <strong>{system.hostname}</strong>
          <span className={localProviderReady ? 'status-good' : 'status-bad'}>
            {ollama.ready && lmStudio.ready ? 'Ollama + LM Studio' : lmStudio.ready ? 'LM Studio Ready' : ollama.ready ? 'Ollama Ready' : 'Local AI Offline'}
          </span>
          <span>{gpuLabel}</span>
        </div>
      </section>

      {uiMode === 'beginner' ? (
        <section className="mode-focus-card simple" aria-label="Simple Mode focus">
          <div>
            <span>Simple Mode</span>
            <strong>Guided local AI setup</strong>
            <em>Check this PC, pick models, download what is missing, compare, then use the winner.</em>
          </div>
          <ol aria-label="Simple Mode steps">
            <li><ScanLine aria-hidden="true" /><span>Check</span></li>
            <li><Boxes aria-hidden="true" /><span>Pick</span></li>
            <li><Download aria-hidden="true" /><span>Download</span></li>
            <li><Trophy aria-hidden="true" /><span>Compare</span></li>
            <li><Bot aria-hidden="true" /><span>Use</span></li>
          </ol>
        </section>
      ) : (
        <section className="monitor-grid" aria-label="Advanced system monitor">
          <MetricTile label="CPU" value={`${system.cpu.loadPercent}%`} level={system.cpu.loadPercent} />
          <MetricTile label="RAM" value={`${system.memory.usedGb} / ${system.memory.totalGb} GB`} level={(system.memory.usedGb / Math.max(1, system.memory.totalGb)) * 100} />
          <MetricTile
            label={system.gpu.isUnifiedMemory ? 'Memory' : 'VRAM'}
            value={
              system.gpu.isUnifiedMemory
                ? `${system.memory.totalGb} GB unified`
                : system.gpu.vramUsedGb != null && system.gpu.vramGb
                  ? `${system.gpu.vramUsedGb} / ${system.gpu.vramGb} GB`
                  : system.gpu.vramGb
                    ? `${system.gpu.vramGb} GB`
                    : '? GB'
            }
            level={
              system.gpu.vramUsedGb != null && system.gpu.vramGb
                ? (system.gpu.vramUsedGb / system.gpu.vramGb) * 100
                : 0
            }
          />
          {system.gpu.gpuLoadPercent != null && (
            <MetricTile label="GPU" value={`${system.gpu.gpuLoadPercent}%`} level={system.gpu.gpuLoadPercent} />
          )}
        </section>
      )}

      <section className="local-status-card" aria-label="Local AI status">
        <div className={localProviderReady ? 'local-status-icon ready' : 'local-status-icon needs-setup'} aria-hidden="true">
          {isScanning ? <RefreshCw className="spin" /> : localProviderReady ? <ShieldCheck /> : <AlertTriangle />}
        </div>
        <div>
          <span>100% local check</span>
          <strong className={localProviderReady ? 'status-good' : 'status-bad'}>{statusTitle}</strong>
          <em>{statusDetail}</em>
          <button type="button" className="primary-button compact" onClick={onScan}>
            <ScanLine aria-hidden="true" />
            Check Local
          </button>
          {/*
            Says what the check found, not just that one happened. "Checked" on
            its own is only marginally better than nothing — the number is what
            makes a second press meaningful, because it either confirms or moves.
          */}
          {lastChecked && !isScanning && (
            <span className="local-status-checked">
              <Check aria-hidden="true" />
              Checked {lastChecked} — {foundAtCheck === 0
                ? 'no local models found'
                : `${foundAtCheck} model${foundAtCheck === 1 ? '' : 's'} found`}
            </span>
          )}
          {/*
            ComfyUI, offered where its absence is noticed.
            
            This is the strip that reports whether things are up, so it is where
            someone realises ComfyUI is not — the Settings button was correct and
            three screens from the moment of noticing. Shown only when a folder
            has been verified (so it stays out of the way for the many people who
            never use ComfyUI), only when it is not already answering, and only
            when a launcher genuinely exists to run.
          */}
          {comfyFolder && !comfyReachable && (
            <ComfyStartButton folder={comfyFolder} variant="deck" />
          )}
        </div>
      </section>

      {!chatLike ? (
        <ChannelWinnerCard
          channel={channel}
          winner={channelWinner}
          rankedAt={rankedAt}
          fader={fader}
          onUse={onUseTopPick}
          onOpen={onOpenChannel}
        />
      ) : topPick ? (
        <section className={`top-deck-winner${topPick.score ? ' with-fader' : ''}`} aria-label="Current best model">
          <AvatarBust model={topPick.row.displayName} size="small" extraClass="top-deck-winner-avatar" />
          <div className="top-deck-winner-copy">
            {/* The label gets its own row.
                It used to share one flex row with the buttons under
                justify-content:space-between, and only the label could shrink.
                Measured: the actions wanted 221px inside a 218px row, so the
                label was allotted exactly 0 and rendered as "TOP...". */}
            <div className="top-deck-winner-head">
              <span>{channel.id === 'chat' ? channel.shortLabel : topPickLabel(topPick.score?.grade)}</span>
              {/* What it is top *for*. getRigPick has always computed this
                  sentence as `reason` and nothing ever showed it: the pick is
                  the highest saved Match score among models that fit this
                  computer, which is a narrower claim than "best model" and the
                  one the badge was silently making. */}
              <em className="top-deck-winner-basis" title={topPick.reason}>
                best score that fits {system.gpu.vramGb > 0 ? formatGb(system.gpu.vramGb) : 'this computer'}
              </em>
            </div>
            <strong>{topPick.row.displayName}</strong>
            <em>
              {/* With what it was ranked at: the same model can win at one fader
                  position and not another, so a bare score overclaims. */}
              {topPick.score ? `${topPick.score.total} Match · ${topPick.score.grade} · ${rankedAt}` : topPick.fitLabel}
              {/* And what it is actually good at, when a run measured enough to
                  say. strongestSkill returns null unless a task group has three
                  graded answers behind it, so this stays quiet rather than
                  crowning a skill on one question. */}
              {topPick.score && strongestSkill(topPick.score) && (
                <span className="top-deck-winner-skill"> · strongest at {strongestSkill(topPick.score)!.purpose}</span>
              )}
            </em>
              <div className="top-deck-winner-actions">
                <button
                  type="button"
                  className="top-deck-use-model-btn"
                  onClick={() => onUseTopPick(topPick.row.displayName)}
                  title="Set this as your active model"
                >
                  Use this model
                </button>
                <button
                  type="button"
                  className="top-deck-test-again-btn"
                  onClick={() => onTestAgain(topPick.row.displayName)}
                  title={`Run the compatibility test on ${topPick.row.displayName} again`}
                  aria-label={`Test ${topPick.row.displayName} again`}
                >
                  <RefreshCw aria-hidden="true" />
                  Test again
                </button>
                <button
                  type="button"
                  className="top-deck-clear-btn"
                  onClick={onClearTopPick}
                  title={`Clear ${topPick.row.displayName} as Top Match for now`}
                  aria-label={`Clear ${topPick.row.displayName} as Top Match`}
                >
                  <X aria-hidden="true" />
                </button>
                {clearedTopPickCount > 0 && (
                  <button
                    type="button"
                    className="top-deck-restore-btn"
                    onClick={onRestoreClearedTopPicks}
                    title="Restore cleared Top Match candidates"
                  >
                    Restore
                  </button>
                )}
              </div>
          </div>
          {topPick.score && fader}
        </section>
      ) : (
        <section className="top-deck-winner empty" aria-label="No winner yet">
          <Trophy aria-hidden="true" />
          <div>
            <span>{channel.id === 'chat' ? channel.shortLabel : 'Best Match'}</span>
            <strong>No tests yet</strong>
            <em>{clearedTopPickCount > 0 ? `${clearedTopPickCount} cleared. Restore when needed.` : 'Test a model to crown the winner.'}</em>
            {clearedTopPickCount > 0 && (
              <button
                type="button"
                className="top-deck-restore-btn"
                onClick={onRestoreClearedTopPicks}
              >
                Restore
              </button>
            )}
          </div>
        </section>
      )}
    </header>
  );
}

const CHANNEL_ICONS: Record<WorkbenchId, LucideIcon> = {
  all: LayoutGrid,
  chat: MessageSquare,
  code: Code2,
  images: ImageIcon,
  video: Film,
  listening: Mic,
  reading: Eye,
  audio: AudioLines,
};

/**
 * "What are you testing?": the channel switch.
 *
 * A radio group, so it is one Tab stop and the arrow keys move between
 * channels, the way eight answers to one question should behave. The active
 * channel is the accent, never gold: gold is the verdict, and choosing what to
 * look at is not one.
 *
 * It sits above the panel rather than inside this header, because it filters
 * what the panel shows and because the header collapses. Folded away, it took
 * the channels with it.
 */
export function ChannelSwitch({ value, onChange }: { value: WorkbenchId; onChange: (id: WorkbenchId) => void }) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = WORKBENCHES.length - 1;
    const targets: Partial<Record<string, number>> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChange(WORKBENCHES[target].id);
    buttons.current[target]?.focus();
  };

  return (
    <div className="channel-switch" role="radiogroup" aria-labelledby="channel-switch-label">
      <span id="channel-switch-label">What are you testing?</span>
      {WORKBENCHES.map((workbench, index) => {
        const Icon = CHANNEL_ICONS[workbench.id];
        const active = workbench.id === value;
        return (
          <button
            key={workbench.id}
            ref={(node) => { buttons.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={active ? 'active' : undefined}
            onClick={() => onChange(workbench.id)}
            onKeyDown={(event) => move(event, index)}
            title={workbench.id === 'all'
              ? 'Every kind of test at once'
              : `Models, the Lab and the winner cover ${workbench.activity} only`}
          >
            <Icon aria-hidden="true" />
            {workbench.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The winner card for a channel with a measurement of its own.
 *
 * Chat and All keep the Top Match card; every other channel is crowned by its
 * own test, at its own fader, from results measured on this computer.
 */
function ChannelWinnerCard({
  channel,
  winner,
  rankedAt,
  fader,
  onUse,
  onOpen,
}: {
  channel: Workbench;
  winner: ChannelWinner | null;
  /** "balanced", "70% accuracy". */
  rankedAt: string;
  fader: ReactNode;
  onUse: (model: string) => void;
  onOpen: () => void;
}) {
  if (!winner) {
    return (
      <section className="top-deck-winner empty" aria-label={`${channel.matchLabel}: nothing crowned yet`}>
        <Trophy aria-hidden="true" />
        <div>
          <span>{channel.shortLabel}</span>
          <strong>Nothing crowned yet</strong>
          <em>{channel.emptyHint}</em>
          <button type="button" className="top-deck-see-btn" onClick={onOpen}>{channel.startLabel}</button>
        </div>
      </section>
    );
  }
  const Icon = CHANNEL_ICONS[channel.id];
  return (
    <section className="top-deck-winner with-fader channel" aria-label={channel.matchLabel}>
      <Icon aria-hidden="true" />
      <div className="top-deck-winner-copy">
        {/* The short label on its own: with "measured on this PC" beside it the
            card had room for neither, and the detail line below already says
            what was measured. */}
        <div className="top-deck-winner-head">
          <span title={`${channel.matchLabel}, measured on this PC`}>{channel.shortLabel}</span>
        </div>
        <strong title={winner.model}>{winner.model}</strong>
        <em>{winner.detail} · {winner.speedOnly ? 'speed only' : rankedAt}</em>
        <div className="top-deck-winner-actions">
          {winner.usable && (
            <button
              type="button"
              className="top-deck-use-model-btn"
              onClick={() => onUse(winner.model)}
              title="Set this as your active model"
            >
              Use this model
            </button>
          )}
          <button type="button" className="top-deck-see-btn" onClick={onOpen}>See results</button>
        </div>
      </div>
      {fader}
    </section>
  );
}
