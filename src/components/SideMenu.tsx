// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Bug, type LucideIcon } from 'lucide-react';

import type { NavId } from '../types';

// Re-exported because callers have always imported it from here.
export type { NavId };

export type NavItem = {
  id: NavId;
  label: string;
  description: string;
  icon: LucideIcon;
};

type SideMenuProps = {
  items: NavItem[];
  activeId: NavId;
  ollamaReady: boolean;
  modelCount: number;
  shortlistCount: number;
  newModelDropCount: number;
  scoredCount: number;
  isRunning: boolean;
  topPickMeta: string;
  uiMode: 'beginner' | 'advanced';
  onSelect: (id: NavId) => void;
  onOpenTutorial: () => void;
  onOpenSupport: () => void;
  bugReportUrl: string;
};

export function SideMenu({
  items,
  activeId,
  ollamaReady,
  modelCount,
  shortlistCount,
  newModelDropCount,
  scoredCount,
  isRunning,
  topPickMeta,
  uiMode,
  onSelect,
  onOpenTutorial,
  onOpenSupport,
  bugReportUrl,
}: SideMenuProps) {
  const navMeta: Record<NavId, string> = {
    lan: ollamaReady ? 'Ready' : 'Setup',
    models: `${modelCount}`,
    whatsNew: newModelDropCount > 0 ? `${newModelDropCount} new` : 'None',
    speedDate: `${shortlistCount}/5`,
    agent: topPickMeta,
    history: scoredCount > 0 ? `${scoredCount}` : 'New',
    activity: isRunning ? 'Live' : 'Idle',
    settings: 'App',
  };

  return (
    <aside className="side-menu" aria-label="RigMatch menu">
      <button type="button" className="side-menu-title" onClick={onOpenTutorial} title="Re-open the getting started guide" aria-label="Open getting started guide">
        <span>{uiMode === 'advanced' ? 'Advanced Mode' : 'Simple Mode'}</span>
        <strong>{uiMode === 'advanced' ? 'Power tools visible' : 'Guided setup'}</strong>
        <small>{uiMode === 'advanced' ? 'Diagnostics, logs, custom tests' : 'Guided path, fewer controls'}</small>
      </button>
      <nav className="side-menu-nav" aria-label="Primary navigation">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={item.id === activeId ? 'side-menu-item active' : 'side-menu-item'}
              onClick={() => onSelect(item.id)}
              aria-pressed={item.id === activeId}
              aria-label={item.label}
              title={`${item.label}: ${item.description}`}
            >
              <b>{index + 1}</b>
              <Icon aria-hidden="true" />
              <span className="side-menu-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <em>{navMeta[item.id]}</em>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        className="side-menu-donate"
        title="Support RigMatch development"
        onClick={onOpenSupport}
      >
        ☕ Support + upgrade links
      </button>
      <a
        className="side-menu-bug-report"
        href={bugReportUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Bug aria-hidden="true" />
        Report a bug
      </a>
    </aside>
  );
}
