// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What to tell someone when RigMatch Chat does not open.
 *
 * Two call sites used to hard-code "companion not found", which was the only
 * failure that existed. It is no longer: a window that lost the loopback bridge
 * to another RigMatch refuses to launch the companion, because the companion
 * would connect to the other instance instead. Saying "not found" there sends
 * people looking for a missing file that is sitting right where it should be.
 */
export type CompanionLaunchResult = { ok: boolean; reason?: string; libraries?: string[]; packages?: string[] };

export function companionLaunchMessage(result: CompanionLaunchResult | null | undefined): string | null {
  if (result?.ok) return null;

  // Linux only: RigMatch Chat is a WebKitGTK app, and the system lacks a
  // library it links against. `packages` is empty off apt-based systems.
  if (result?.reason === 'missing-libraries') {
    const packages = result.packages ?? [];
    return [
      'RigMatch Chat needs system libraries this computer does not have:',
      ...(result.libraries ?? []).map((library) => `  ${library}`),
      '',
      ...(packages.length
        ? ['Install them, then open Chat again:', `  sudo apt install ${packages.join(' ')}`]
        : ['Install the packages that provide them (RigMatch Chat uses WebKitGTK 4.1), then open Chat again.']),
    ].join('\n');
  }

  if (result?.reason === 'bridge-taken') {
    return [
      'Another RigMatch is already running.',
      '',
      'RigMatch Chat connects to whichever RigMatch started first, so opening it',
      'from this window would list the other one’s models and save pictures',
      'from the other one.',
      '',
      'Close the other RigMatch window, then try again.',
    ].join('\n');
  }

  return [
    'RigMatch Chat companion not found.',
    '',
    'Download it from the Releases page or build it from source:',
    '  cd rigmatch-chat && npx tauri build',
  ].join('\n');
}
