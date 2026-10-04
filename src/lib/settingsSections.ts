// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The Settings screen's own contents list.
 *
 * Settings used to be eight accordions stacked in a column that ran past two
 * thousand pixels. Closed, they said a section existed but not what it was set
 * to; open, they pushed everything below them off the screen.
 *
 * Now the rail is the navigation and the column shows one section at a time.
 * Each rail entry carries what the section is currently set to, so the answer
 * is there before the click.
 */
export type SettingsSectionId =
  | 'interface'
  | 'achievements'
  | 'storage'
  | 'providers'
  | 'generation'
  | 'updates'
  | 'support'
  | 'advanced';

export type SettingsSectionSpec = {
  id: SettingsSectionId;
  title: string;
  summary: string;
  advancedOnly?: boolean;
};

export const SETTINGS_SECTIONS: SettingsSectionSpec[] = [
  { id: 'interface', title: 'Preferences', summary: 'Mode, theme, goals, and the Simple Mode path.' },
  { id: 'achievements', title: 'Achievements', summary: 'Badges for the parts of RigMatch worth trying.' },
  { id: 'storage', title: 'The Closet', summary: 'Who is taking up shelf space, and whether they earned it.' },
  { id: 'providers', title: 'Providers', summary: 'Runtime, Ollama, LM Studio, and local-only scope.' },
  { id: 'generation', title: 'ComfyUI', summary: 'Where image and video generation run, and whether RigMatch may unload models.' },
  { id: 'updates', title: 'Updates', summary: 'RigMatch app updates, Ollama updates, and recent changes.' },
  { id: 'support', title: 'Support', summary: 'Donationware link, bug reports, and diagnostics.' },
  { id: 'advanced', title: 'Scoring and reset', summary: 'How scoring works and destructive cleanup.', advancedOnly: true },
];

export type SettingsRailItem = SettingsSectionSpec & { status: string | null };

/**
 * Status is supplied already resolved rather than derived here.
 *
 * The values come from six different props with six different shapes, and a
 * function that reached into all of them would be untestable without building
 * six fixtures. The panel knows those shapes; this only knows how to lay them
 * out and which sections are on offer.
 *
 * A section with nothing worth saying gets no status line at all — an
 * invented one ("Configured", "Ready") would be filler dressed as information.
 */
export function buildSettingsRail(
  status: Partial<Record<SettingsSectionId, string | null | undefined>>,
  options: { advanced: boolean },
): SettingsRailItem[] {
  return SETTINGS_SECTIONS
    .filter((section) => options.advanced || !section.advancedOnly)
    .map((section) => {
      const value = status[section.id];
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return { ...section, status: trimmed ? trimmed : null };
    });
}
