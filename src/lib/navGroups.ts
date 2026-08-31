// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { NavId, NavItem } from '../components/SideMenu';

/**
 * Advanced Mode's eight screens, grouped by what you go there to do.
 *
 * They were a flat list numbered 1 to 8, and the numbers were the problem: you
 * do not visit these in order, nothing is bound to the digits, and Simple Mode
 * hands the same screen a different number because it orders them differently.
 * A marker that changes meaning by mode and answers to nothing is decoration
 * wearing the clothes of structure.
 *
 * Simple Mode keeps its flat numbered list, and should: there the order is a
 * guided path, so the sequence is real and the numbers are honest.
 */
export type NavGroupId = 'find' | 'test' | 'setup';

export const NAV_GROUPS: Array<{ id: NavGroupId; label: string; members: NavId[] }> = [
  { id: 'find', label: 'Find', members: ['models', 'whatsNew'] },
  { id: 'test', label: 'Test', members: ['speedDate', 'history', 'agent'] },
  { id: 'setup', label: 'Your setup', members: ['lan', 'activity', 'settings'] },
];

export type NavGroup = { id: string; label: string; items: NavItem[] };

/**
 * Group the visible items, dropping groups nothing survives into.
 *
 * Items are filtered upstream by mode and by whether anything has been scored,
 * so a group can legitimately end up empty and should then not print a heading
 * over nothing.
 *
 * Anything not named in a group is kept, in its original order, under no
 * heading at the end. A new screen added to the nav and forgotten here should
 * still be reachable — losing a screen from the menu is a far worse failure
 * than showing one without a label.
 */
export function groupNavItems(items: NavItem[]): NavGroup[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const claimed = new Set<NavId>();

  const groups: NavGroup[] = [];
  for (const group of NAV_GROUPS) {
    const members = group.members
      .map((id) => {
        const item = byId.get(id);
        if (item) claimed.add(id);
        return item;
      })
      .filter((item): item is NavItem => Boolean(item));
    if (members.length > 0) groups.push({ id: group.id, label: group.label, items: members });
  }

  const ungrouped = items.filter((item) => !claimed.has(item.id));
  if (ungrouped.length > 0) groups.push({ id: 'other', label: '', items: ungrouped });

  return groups;
}
