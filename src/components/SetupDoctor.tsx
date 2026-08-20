// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { isDesktopRuntime } from '../api';
import type { NetworkHost, OllamaStatus, SystemProfile } from '../types';
import { ExternalLink } from 'lucide-react';

export function SetupDoctor({
  ollama,
  hosts,
  modelCount,
  system,
  onCheckComputer,
  onOpenSetupGuide,
}: {
  ollama: OllamaStatus;
  hosts: NetworkHost[];
  modelCount: number;
  system: SystemProfile;
  onCheckComputer: () => void;
  onOpenSetupGuide: () => void;
}) {
  const localHostCount = hosts.filter((host) => host.isLocal || host.ip === '127.0.0.1').length;
  const doctorRows = [
    {
      label: 'Desktop App',
      value: isDesktopRuntime ? 'Ready' : 'Preview',
      detail: isDesktopRuntime ? 'The Electron bridge can check local Ollama and hardware.' : 'Sample data is loaded in browser preview.',
      tone: isDesktopRuntime ? 'ready' : 'info',
      action: null,
    },
    {
      label: 'Ollama Service',
      value: ollama.ready ? 'Running' : 'Needs setup',
      detail: ollama.ready ? `${ollama.models.length} installed model${ollama.models.length === 1 ? '' : 's'} visible.` : 'Install or start Ollama, then check again.',
      tone: ollama.ready ? 'ready' : 'warn',
      action: ollama.ready ? null : { label: 'Setup', onClick: onOpenSetupGuide },
    },
    {
      label: 'Model Pool',
      value: ollama.models.length > 0 ? 'Contestants ready' : 'No local models',
      detail: ollama.models.length > 0 ? `${modelCount} model${modelCount === 1 ? '' : 's'} in the model pool.` : 'Download one model before the first compatibility test.',
      tone: ollama.models.length > 0 ? 'ready' : 'warn',
      action: ollama.models.length > 0 ? null : { label: 'Check', onClick: onCheckComputer },
    },
    {
      label: 'Computer Fit',
      value: system.gpu.vramGb ? `${system.gpu.vramGb} GB VRAM` : `${system.memory.totalGb} GB RAM`,
      detail: system.gpu.vramGb ? 'RigMatch can estimate VRAM-safe matches.' : 'RigMatch will favor smaller local models.',
      tone: 'ready',
      action: null,
    },
    {
      label: 'Scope',
      value: localHostCount > 0 ? 'Local only' : 'Local setup',
      detail: 'Remote systems are parked for RigMatch 2.0 so v1 stays simple and reliable.',
      tone: 'info',
      action: null,
    },
  ];

  return (
    <section className="setup-doctor" aria-label="Setup Doctor">
      <div className="setup-doctor-head">
        <div>
          <span>Setup Doctor</span>
          <strong>{ollama.ready ? 'Ready for local model tests' : 'One setup step before the show starts'}</strong>
        </div>
        <button type="button" className="mini-button outline" onClick={onOpenSetupGuide}>
          <ExternalLink aria-hidden="true" />
          Guide
        </button>
      </div>
      <div className="setup-doctor-grid">
        {doctorRows.map((row) => (
          <div key={row.label} className={`doctor-card ${row.tone}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <em>{row.detail}</em>
            {row.action && (
              <button type="button" className="mini-button outline" onClick={row.action.onClick}>
                {row.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
