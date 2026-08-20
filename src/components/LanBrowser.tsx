// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { isDesktopRuntime } from '../api';
import robotRigGreenroom from '../assets/robot-rig-greenroom.webp';
import { formatGb } from '../lib/format';
import type { NetworkHost, OllamaInstallProgress, OllamaStatus, SystemProfile } from '../types';
import { MachineAvatar } from './Avatars';
import { PanelHeader } from './CommonChrome';
import { OllamaPrep } from './OllamaPrep';
import { RigDetailsPanel } from './RigDetailsPanel';
import { RomanceArtBanner } from './ScoreVisuals';
import { SetupDoctor } from './SetupDoctor';
import { ThirdPartyModelNotice } from './ThirdPartyModelNotice';
import { UpgradeRig } from './UpgradeRig';
import { Network } from 'lucide-react';

export function LanBrowser({
  active,
  system,
  ollama,
  lmStudio,
  hosts,
  modelCount,
  selectedHostId,
  isScanning,
  onScan,
  onSelect,
  onInstallOllama,
  ollamaInstallProgress,
  onStartOllamaInstall,
  onLaunchOllamaInstaller,
  onScanRig,
  onOpenSetupGuide,
}: {
  active: boolean;
  system: SystemProfile;
  ollama: OllamaStatus;
  lmStudio: OllamaStatus;
  hosts: NetworkHost[];
  modelCount: number;
  selectedHostId: string;
  isScanning: boolean;
  onScan: () => void;
  onSelect: (id: string) => void;
  onInstallOllama: () => void;
  ollamaInstallProgress: OllamaInstallProgress;
  onStartOllamaInstall: () => void;
  onLaunchOllamaInstaller: (path: string) => void;
  onScanRig: () => void;
  onOpenSetupGuide: () => void;
}) {
  const hostMeta = ollama.ready || lmStudio.ready ? 'Local AI ready' : 'Local AI offline';
  const localFallbackHost: NetworkHost = {
    id: 'localhost-preview',
    hostname: `${system.hostname} (This Machine)`,
    ip: system.networks[0]?.address ?? '127.0.0.1',
    provider: 'Ollama',
    version: ollama.version ?? undefined,
    models: ollama.models.length,
    status: ollama.ready ? 'Ready' : 'Offline',
    pingMs: ollama.pingMs,
    baseUrl: ollama.baseUrl,
    isLocal: true,
    isDemo: !isDesktopRuntime,
  };
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0] ?? localFallbackHost;
  const singleHost = hosts.length <= 1;
  const panelClassName = [
    'panel',
    'lan-panel',
    active ? 'panel-focused' : '',
    singleHost ? 'single-host' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className={panelClassName}>
      <PanelHeader
        icon={Network}
        title="Your Rig"
        actionLabel={isScanning ? 'Checking' : 'Check Local'}
        onAction={onScan}
        busy={isScanning}
        meta={hostMeta}
      />
      <RomanceArtBanner
        image={robotRigGreenroom}
        className="rig-art-banner"
        kicker="Rig profile"
        title="This computer is getting ready for a match"
        body={`${system.gpu.vramGb ? `${formatGb(system.gpu.vramGb)} VRAM` : `${formatGb(system.memory.totalGb)} RAM`} helps RigMatch keep model suggestions realistic.`}
      />
      <OllamaPrep
        system={system}
        ollama={ollama}
        onInstallOllama={onInstallOllama}
        ollamaInstallProgress={ollamaInstallProgress}
        onStartOllamaInstall={onStartOllamaInstall}
        onLaunchOllamaInstaller={onLaunchOllamaInstaller}
        onScanRig={onScanRig}
        onOpenSetupGuide={onOpenSetupGuide}
      />
      <SetupDoctor
        ollama={ollama}
        hosts={hosts}
        modelCount={modelCount}
        system={system}
        onCheckComputer={onScanRig}
        onOpenSetupGuide={onOpenSetupGuide}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>IP Address</th>
              <th>Provider</th>
              <th>Models</th>
              <th>Status</th>
              <th>Ping</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((host) => (
              <tr
                key={host.id}
                className={`${host.id === selectedHostId ? 'selected' : ''}${host.isDemo ? ' sample-row' : ''}${host.discovery === 'computer' ? ' computer-row' : ''}`}
                onClick={() => onSelect(host.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(host.id);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <div className="host-name-cell">
                    <MachineAvatar host={host} size="tiny" />
                    <span>{host.hostname}</span>
                    {host.isDemo && <em>Sample</em>}
                  </div>
                </td>
                <td>{host.ip}</td>
                <td>{host.isDemo ? 'Preview' : host.provider}</td>
                <td>{host.discovery === 'computer' ? '--' : host.models}</td>
                <td className={host.isDemo || host.discovery === 'computer' ? 'status-gold' : 'status-good'}>
                  {host.isDemo ? 'Sample' : host.status}
                </td>
                <td>{host.isDemo ? 'demo' : `${host.pingMs ?? '?'} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RigDetailsPanel
        host={selectedHost}
        system={system}
        ollama={ollama}
      />
      <div className="utility-stat">
        <span>Provider support</span>
        <strong>Ollama downloads; LM Studio tests</strong>
        <em>RigMatch detects LM Studio's local server for testing and chat. Catalog downloads still go through Ollama.</em>
      </div>
      <ThirdPartyModelNotice compact />
      <UpgradeRig system={system} />
    </section>
  );
}
