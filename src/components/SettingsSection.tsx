// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ReactNode } from 'react';

/**
 * One Settings section, shown when the rail picks it.
 *
 * It was an accordion: a full-width toggle over a body. The rail now chooses
 * the one section on screen, so the header is a plain heading and a section
 * that is not picked renders nothing.
 */
export function SettingsSection({
  title,
  summary,
  advancedOnly = false,
  open,
  sectionId,
  children,
}: {
  title: string;
  summary: string;
  advancedOnly?: boolean;
  open: boolean;
  sectionId: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <section
      // The rail scrolls the column to this id.
      id={`settings-${sectionId}`}
      className={`settings-section open${advancedOnly ? ' advanced-only' : ''}`}
      aria-labelledby={`settings-${sectionId}-title`}
    >
      <header className="settings-section-head">
        <h2 id={`settings-${sectionId}-title`}>{title}</h2>
        <p>{summary}</p>
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}
