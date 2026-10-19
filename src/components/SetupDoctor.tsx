// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ReactNode } from 'react';
import { isDesktopRuntime } from '../api';
import { comfyDoctorRow, localAiDoctor, type ComfyLook } from '../lib/serviceStatus';
import type { NetworkHost, OllamaStatus, SystemProfile } from '../types';
import { ExternalLink } from 'lucide-react';
import { ComfyStartButton } from './ComfyStartButton';
import { GetComfyLink } from './GetComfyLink';

export function SetupDoctor({
  ollama,
  lmStudio,
  hosts,
  system,
  comfy,
  onCheckComputer,
  onOpenSetupGuide,
  onOpenComfySettings,
}: {
  ollama: OllamaStatus;
  lmStudio: OllamaStatus;
  hosts: NetworkHost[];
  system: SystemProfile;
  /** ComfyUI as the top bar's dot sees it, plus what it holds. */
  comfy: ComfyLook & { pictureModels: number; queue: number };
  onCheckComputer: () => void;
  onOpenSetupGuide: () => void;
  /** Settings' ComfyUI section: the address and the models folder. */
  onOpenComfySettings: () => void;
}) {
  const localHostCount = hosts.filter((host) => host.isLocal || host.ip === '127.0.0.1').length;
  // ComfyUI had no row here: the dot said grey and My PC said nothing about
  // why, or where to get it. The Get link and the Start button were only on
  // Simple Mode's setup and inside picture tests.
  const comfyRow = comfyDoctorRow({ ...comfy, platform: system.platform, arch: system.arch });
  const local = localAiDoctor({
    ollama: { ready: ollama.ready, models: ollama.models.length },
    lmStudio: { ready: lmStudio.ready, models: lmStudio.models.length },
  });
  const doctorRows: {
    label: string;
    value: string;
    detail: string;
    tone: string;
    action: { label: string; onClick: () => void } | null;
    extra?: ReactNode;
  }[] = [
    {
      label: 'Desktop App',
      value: isDesktopRuntime ? 'Ready' : 'Preview',
      detail: isDesktopRuntime ? 'The Electron bridge can check local Ollama and hardware.' : 'Sample data is loaded in browser preview.',
      tone: isDesktopRuntime ? 'ready' : 'info',
      action: null,
    },
    {
      label: 'Ollama Service',
      ...local.ollama,
      action: local.ollama.setup ? { label: 'Setup', onClick: onOpenSetupGuide } : null,
    },
    {
      label: 'Model Pool',
      ...local.pool,
      action: local.pool.check ? { label: 'Check', onClick: onCheckComputer } : null,
    },
    {
      label: 'ComfyUI',
      value: comfyRow.value,
      detail: comfyRow.detail,
      tone: comfyRow.tone,
      action: null,
      extra: (
        <span className="doctor-actions">
          {comfyRow.kind === 'not-found' && <GetComfyLink />}
          {comfyRow.kind === 'not-running' && comfy.folder && <ComfyStartButton folder={comfy.folder} />}
          <button type="button" className="btn btn-link" onClick={onOpenComfySettings} title="Open Settings for the ComfyUI address and models folder">
            ComfyUI settings
          </button>
        </span>
      ),
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
      value: localHostCount > 0 ? 'This computer' : 'Local setup',
      // It said "Remote systems are parked for RigMatch 2.0 so v1 stays simple
      // and reliable", a note from the roadmap rather than to the reader.
      detail: 'Tests run here. Other computers on your network are listed below, but RigMatch tests only this one.',
      tone: 'info',
      action: null,
    },
  ];

  return (
    <section className="setup-doctor" aria-label="Setup Doctor">
      <div className="setup-doctor-head">
        <div>
          <span>Setup Doctor</span>
          <strong>{local.headline}</strong>
        </div>
        <button type="button" className="mini-button outline" onClick={onOpenSetupGuide}>
          <ExternalLink aria-hidden="true" />
          Guide
        </button>
      </div>
      <div className="setup-doctor-grid">
        {doctorRows.map((row) => (
          <div key={row.label} className={`doctor-card ${row.tone}`} data-doctor-row={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            {row.extra ? (
              <div className="doctor-detail">
                <em>{row.detail}</em>
                {row.extra}
              </div>
            ) : <em>{row.detail}</em>}
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
