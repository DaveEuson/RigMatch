// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ReactNode } from 'react';
import type { SystemProfile } from '../types';
import { LOW_DISK_GB, loadLevel } from '../lib/loadLevel';
import { UiIcon, type UiIconName } from './icons/UiIcon';

const round = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10);

/**
 * How hard the computer is working, under the top bar on every screen: CPU,
 * GPU, video memory, memory and free disk, each a figure and a short bar.
 *
 * It is the stats deck's job in a 32px line. A reading the machine did not
 * give is left out rather than shown as zero.
 */
export function LoadStrip({ system, running }: {
  system: SystemProfile;
  /** What is running right now, e.g. "Running Speed Dating · qwen2.5:7b", with its controls. */
  running?: ReactNode;
}) {
  const vramTotal = system.gpu.isUnifiedMemory ? 0 : system.gpu.vramGb;
  const items: Array<{ key: string; icon: UiIconName; label: string; value: string; percent: number | null; level?: 'ok' | 'busy' | 'full' }> = [];
  items.push({ key: 'cpu', icon: 'cpu', label: 'CPU', value: `${Math.round(system.cpu.loadPercent)}%`, percent: system.cpu.loadPercent });
  if (system.gpu.gpuLoadPercent != null) {
    items.push({ key: 'gpu', icon: 'gpu', label: 'GPU', value: `${Math.round(system.gpu.gpuLoadPercent)}%`, percent: system.gpu.gpuLoadPercent });
  }
  if (vramTotal > 0) {
    const used = system.gpu.vramUsedGb;
    items.push({
      key: 'vram', icon: 'vram', label: 'VRAM',
      value: used != null ? `${round(used)} / ${round(vramTotal)} GB` : `${round(vramTotal)} GB`,
      percent: used != null ? (used / vramTotal) * 100 : null,
    });
  }
  if (system.memory.totalGb > 0) {
    items.push({
      key: 'ram', icon: 'ram', label: system.gpu.isUnifiedMemory ? 'Memory' : 'RAM',
      value: `${round(system.memory.usedGb)} / ${round(system.memory.totalGb)} GB`,
      percent: (system.memory.usedGb / system.memory.totalGb) * 100,
    });
  }
  if (system.storage.sizeGb > 0) {
    const free = system.storage.availableGb;
    items.push({
      key: 'disk', icon: 'disk', label: 'Free disk', value: `${round(free)} GB`,
      percent: (free / system.storage.sizeGb) * 100,
      level: free < LOW_DISK_GB ? 'full' : 'ok',
    });
  }
  return (
    <div className="load-strip" role="group" aria-label="How hard this computer is working">
      <ul className="load-strip-readings">
        {items.map((item) => {
          const level = item.level ?? (item.percent != null ? loadLevel(item.percent) : 'ok');
          return (
            <li key={item.key} className={`load-reading ${level}`}>
              <UiIcon name={item.icon} size={16} />
              <span className="load-label">{item.label}</span>
              <span className="load-value">{item.value}</span>
              {item.percent != null && (
                <span className="load-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {running && <div className="load-strip-running" role="status">{running}</div>}
    </div>
  );
}
