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
   * No step number, because there is no sequence and never was.
   *
   * The rail numbered its eight destinations 1 to 8. Nothing is bound to those
   * digits, you do not visit the screens in order, and — the part that settles
   * it — this menu only renders inside App's `uiMode === 'advanced'` branch.
   * Simple Mode has its own wizard rail with its own steps, which are a real
   * sequence. So the numbering here was never the guided path it looked like;
   * it was a marker that answered to nothing.
   *
   * Left alone once already, because this row pinned its grid columns in eight
   * places and a 1280x720 Jetson had been truncated to "M..", "W..", "C.." by
   * two of those rules hiding children at once. The row is flex now, so a
   * missing child costs nothing, and sweep:layout and sweep:menus check 40
   * size/screen combinations between them — the net that did not exist then.
   */
  const renderItem = (item: NavItem) => {
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
        {/* Grouped by what you go there to do. Eight destinations in one
            undifferentiated column is a list you re-read every time instead of
            aiming at. There is no ungrouped branch because this rail only ever
            renders in Advanced Mode — see renderItem. */}
        {groupNavItems(items).map((group) => (
          <div className="side-menu-group" key={group.id}>
            {group.label && <h2>{group.label}</h2>}
            {group.items.map(renderItem)}
          </div>
        ))}
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
