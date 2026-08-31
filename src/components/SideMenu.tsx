// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Bug, type LucideIcon } from 'lucide-react';

import { groupNavItems } from '../lib/navGroups';
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

  /**
   * The number stays, in both modes.
   *
   * It is weak information in Advanced — you do not visit these in order, and
   * nothing is bound to the digits — but this row's grid has a scar: five
   * responsive rules pin explicit column tracks, and a documented bug on a
   * 1280x720 Jetson came from two of them hiding children at once, leaving
   * auto-placement to drop every label into a 20px badge track and truncate
   * the menu to "M..", "W..", "C..". Dropping a child here to improve a
   * marker is not a trade worth making.
   */
  const renderItem = (item: NavItem, step: number) => {
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
        <b>{step}</b>
        <Icon aria-hidden="true" />
        <span className="side-menu-copy">
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </span>
        <em>{navMeta[item.id]}</em>
      </button>
    );
  };

  return (
    <aside className="side-menu" aria-label="RigMatch menu">
      <button type="button" className="side-menu-title" onClick={onOpenTutorial} title="Re-open the getting started guide" aria-label="Open getting started guide">
        <span>{uiMode === 'advanced' ? 'Advanced Mode' : 'Simple Mode'}</span>
        <strong>{uiMode === 'advanced' ? 'Power tools visible' : 'Guided setup'}</strong>
        <small>{uiMode === 'advanced' ? 'Diagnostics, logs, custom tests' : 'Guided path, fewer controls'}</small>
      </button>
      <nav className="side-menu-nav" aria-label="Primary navigation">
        {/* Grouped in Advanced, flat in Simple.
            Simple Mode's order is a guided path, so a sequence is the right
            shape there. Advanced is a set of tools you dip into, and eight of
            them in one undifferentiated column is a list you re-read every
            time instead of aiming at. */}
        {uiMode === 'advanced'
          ? groupNavItems(items).map((group) => (
              <div className="side-menu-group" key={group.id}>
                {group.label && <h2>{group.label}</h2>}
                {group.items.map((item) => renderItem(item, items.indexOf(item) + 1))}
              </div>
            ))
          : items.map((item, index) => renderItem(item, index + 1))}
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
