// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Boxes, Check, ChevronDown, ChevronUp, Download, RefreshCw, ScanLine, ShieldCheck, Trophy, X } from 'lucide-react';
import type { OllamaStatus, SystemProfile } from '../types';
import type { UiMode } from '../lib/appConfig';
import type { RigPick } from '../lib/modelCatalog';
import { topPickLabel } from '../lib/format';
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

      {topPick ? (
        <section className="top-deck-winner" aria-label="Current best model">
          <AvatarBust model={topPick.row.displayName} size="small" extraClass="top-deck-winner-avatar" />
          <div className="top-deck-winner-copy">
            <div className="top-deck-winner-head">
              <span>{topPickLabel(topPick.score?.grade)}</span>
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
            <strong>{topPick.row.displayName}</strong>
            <em>{topPick.score ? `${topPick.score.total} Match · ${topPick.score.grade}` : topPick.fitLabel}</em>
          </div>
        </section>
      ) : (
        <section className="top-deck-winner empty" aria-label="No winner yet">
          <Trophy aria-hidden="true" />
          <div>
            <span>Best Match</span>
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
