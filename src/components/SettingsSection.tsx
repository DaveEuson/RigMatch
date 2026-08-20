// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

export function SettingsSection({
  eyebrow,
  title,
  summary,
  defaultOpen = false,
  advancedOnly = false,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  advancedOnly?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`settings-section${isOpen ? ' open' : ''}${advancedOnly ? ' advanced-only' : ''}`}>
      <button
        type="button"
        className="settings-section-toggle"
        onClick={() => setIsOpen((value) => !value)}
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
