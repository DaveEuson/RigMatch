// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

/**
 * Open state is controlled when the panel passes it.
 *
 * The section used to own it, which was fine while the header was the only way
 * in. The rail is a second way in, and two controls driving one accordion from
 * two different pieces of state is how you get a rail that says "open" over a
 * section that is shut. `open === undefined` keeps the old self-managed
 * behaviour for any caller that does not care.
 */
export function SettingsSection({
  eyebrow,
  title,
  summary,
  defaultOpen = false,
  advancedOnly = false,
  open,
  onToggle,
  sectionId,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  advancedOnly?: boolean;
  open?: boolean;
  onToggle?: () => void;
  sectionId?: string;
  children: ReactNode;
}) {
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const isOpen = open ?? selfOpen;

  return (
    <section
      // A plain id rather than a ref the panel hands down: the rail only needs
      // to find this element to scroll to it, and one attribute does that with
      // no ref map to keep in step with the section list.
      id={sectionId ? `settings-${sectionId}` : undefined}
      className={`settings-section${isOpen ? ' open' : ''}${advancedOnly ? ' advanced-only' : ''}`}
    >
      <button
        type="button"
        className="settings-section-toggle"
        onClick={() => (onToggle ? onToggle() : setSelfOpen((value) => !value))}
        aria-expanded={isOpen}
      >
        <div>
          <span>{eyebrow}</span>
          <strong>{title}</strong>
          <em>{summary}</em>
        </div>
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen && <div className="settings-section-body">{children}</div>}
    </section>
  );
}
