// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The Settings screen's own contents list.
 *
 * Settings is seven collapsed accordions stacked in a two-thousand-pixel
 * column. Closed, they tell you a section exists but not what it is set to;
 * open, they push everything below them off the screen. Either way the only
 * way to find out what your provider is, or which theme is on, was to open
 * things and read.
 *
 * So the rail carries the same two things the model rail carries: what is in
 * here, and what it is currently set to — the answer before the click. The
 * section list lives here rather than inline in the panel so the rail and the
 * accordions are rendered from one array and cannot drift apart.
 */
export type SettingsSectionId =
  | 'interface'
  | 'storage'
  | 'providers'
  | 'generation'
  | 'updates'
  | 'support'
  | 'advanced';

export type SettingsSectionSpec = {
  id: SettingsSectionId;
  eyebrow: string;
  title: string;
  summary: string;
  advancedOnly?: boolean;
};

export const SETTINGS_SECTIONS: SettingsSectionSpec[] = [
  { id: 'interface', eyebrow: 'Interface', title: 'Preferences', summary: 'Mode, theme, goals, and the Simple Mode path.' },
  { id: 'storage', eyebrow: 'Storage', title: 'The Closet', summary: 'Who is taking up shelf space, and whether they earned it.' },
  { id: 'providers', eyebrow: 'Local AI', title: 'Computer & Providers', summary: 'Runtime, Ollama, LM Studio, and local-only scope.' },
  { id: 'generation', eyebrow: 'Generation', title: 'ComfyUI', summary: 'Where image and video generation run, and whether RigMatch may unload models.' },
  { id: 'updates', eyebrow: 'Updates', title: 'Versions & Release Notes', summary: 'RigMatch app updates, Ollama updates, and recent changes.' },
  { id: 'support', eyebrow: 'Support', title: 'Feedback & Support', summary: 'Donationware link, bug reports, and diagnostics.' },
  { id: 'advanced', eyebrow: 'Advanced', title: 'Scoring & Reset', summary: 'How scoring works and destructive cleanup.', advancedOnly: true },
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
