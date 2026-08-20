// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { isDesktopRuntime } from '../api';
import type { CopyState } from '../lib/clipboard';
import { copyText } from '../lib/clipboard';
import { getPlatformName } from '../lib/modelCatalog';
import type { OllamaInstallProgress, OllamaStatus, SystemProfile } from '../types';
import { Download, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

export function OllamaPrep({
  system,
  ollama,
  onInstallOllama,
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
  onScanRig,
  onOpenSetupGuide,
}: {
  system: SystemProfile;
  ollama: OllamaStatus;
  onInstallOllama: () => void;
  ollamaInstallProgress: OllamaInstallProgress;
  onStartOllamaInstall: () => void;
  onLaunchOllamaInstaller: (path: string) => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const platformName = getPlatformName(system.platform);
  const ready = ollama.ready;
  // A copy button that silently does nothing is worse than no button.
  const [commandCopy, setCommandCopy] = useState<CopyState>('idle');

  // Ready state — compact success strip
  if (ready || !isDesktopRuntime) {
    const prepTitle = isDesktopRuntime ? `${platformName} ready` : 'Preview sample data';
    const prepMessage = isDesktopRuntime
      ? 'This computer is ready. Tests run through local Ollama on this machine.'
      : 'Preview sample data is local-only. The desktop app checks your real Ollama install.';
    return (
      <div className="ollama-prep ready">
        <div className="prep-badge" aria-hidden="true"><ShieldCheck /></div>
        <div className="prep-copy">
          <span>Local AI Setup</span>
          <strong>{prepTitle}</strong>
          <em>{prepMessage}</em>
        </div>
        <div className="prep-actions">
          <button type="button" className="mini-button outline" onClick={onScanRig}>
            <RefreshCw aria-hidden="true" />
            Check Again
          </button>
        </div>
      </div>
    );
  }

  // Not-ready state — full install hero for first-timers
  const ip = ollamaInstallProgress;
  const isLinux = system.platform === 'linux';
  const isDownloading = ip.phase === 'downloading';
  const isReady = ip.phase === 'ready';
  const isScript = ip.phase === 'script';
  const hasError = ip.phase === 'error';

  return (
    <div className="ollama-install-hero">
      <div className="install-hero-top">
        <div className="install-hero-icon" aria-hidden="true"><Download /></div>
        <div className="install-hero-copy">
          <span>Current test engine</span>
          <strong>Connect a local engine to test models</strong>
          <p>
            RigMatch can benchmark through <strong>Ollama</strong> or <strong>LM Studio</strong> when its local server is running. Ollama is still the download path for catalog models.
            {isLinux
              ? ' If Ollama is not installed, run the one-line install command below.'
              : ' If Ollama is not installed, download and run the installer below.'}
          </p>
        </div>
      </div>

      {isScript && 'command' in ip ? (
        <div className="install-script-block">
          <code className="install-script-cmd">{ip.command}</code>
          <button
            type="button"
            className="mini-button outline"
            onClick={() => void copyText(ip.command).then((ok) => {
              setCommandCopy(ok ? 'copied' : 'failed');
              window.setTimeout(() => setCommandCopy('idle'), 2400);
            })}
          >
            {commandCopy === 'copied' ? 'Copied' : commandCopy === 'failed' ? 'Select it above' : 'Copy'}
          </button>
          <p className="install-script-hint">Open a terminal, paste, and press Enter. Then click Check Again below.</p>
        </div>
      ) : isReady && 'installerPath' in ip ? (
        <button type="button" className="install-ollama-btn ready" onClick={() => onLaunchOllamaInstaller(ip.installerPath)}>
          <Download aria-hidden="true" />
          Launch Installer
        </button>
      ) : isDownloading && 'percent' in ip ? (
        <div className="install-progress-bar">
          <div className="install-progress-fill" style={{ width: `${ip.percent}%` }} />
          <span>Downloading Ollama… {ip.percent}%</span>
        </div>
      ) : hasError && 'error' in ip ? (
        <div className="install-error-row">
          <span className="install-error-msg">{ip.error}</span>
          <button type="button" className="install-ollama-btn" onClick={isLinux ? onStartOllamaInstall : onStartOllamaInstall}>
            <Download aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : (
        <button type="button" className="install-ollama-btn" onClick={isDesktopRuntime ? onStartOllamaInstall : onInstallOllama}>
          <Download aria-hidden="true" />
          {isLinux ? 'Show Install Command' : `Download Ollama for ${platformName} — Free`}
          {!isDesktopRuntime && <ExternalLink aria-hidden="true" />}
        </button>
      )}

      {!isScript && !isDownloading && !isReady && (
        <ol className="install-steps-flow">
          <li className="install-step"><b>1</b>
            <span>{isLinux ? 'Click to reveal the install command' : 'Click above to download the Ollama installer'}</span>
          </li>
          <li className="install-step"><b>2</b>
            <span>{isLinux ? 'Open a terminal, paste the command, and press Enter' : 'Run the installer — Ollama starts automatically in the background'}</span>
          </li>
          <li className="install-step"><b>3</b>
            <span>Come back here and click <strong>Check Again</strong></span>
          </li>
        </ol>
      )}

      <div className="install-hero-footer">
        <button type="button" className="mini-button outline" onClick={onScanRig}>
          <RefreshCw aria-hidden="true" />
          Check Again
        </button>
        <button type="button" className="mini-button outline" onClick={onOpenSetupGuide}>
          <ExternalLink aria-hidden="true" />
          Full Setup Guide
        </button>
        <span className="install-hero-note">No account needed · Free forever · Works offline</span>
      </div>
    </div>
  );
}
