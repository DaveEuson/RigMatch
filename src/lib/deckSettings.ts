// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Whether the Advanced top deck is expanded.
 *
 * Measured on a 1440x820 laptop: the panel — the part of the screen doing the
 * actual work — got 348px, 42% of the viewport, while its own content was
 * 1063px tall. The top deck is 122px of that permanent chrome, second only to
 * the window itself.
 *
 * Collapsing it is the user's call, so it is remembered. The default depends
 * on how much height there is to spend: on a short screen the stats strip costs
 * more than it gives, and on a tall one it costs nothing.
 */

export const DECK_STORAGE_KEY = 'rigmatch:top-deck:v1';

/**
 * Below this, the top deck starts by being collapsed. 900 sits above the common
 * 1440x820 and 1366x768 laptops and below a 1080p desktop, which is the line
 * the measurements actually fall either side of.
 */
export const SHORT_VIEWPORT_PX = 900;

/**
 * Advanced Mode starts folded, whatever the height.
 *
 * The screen it sits above is a table, and on a 1024x640 window — the smallest
 * the app allows — the deck and the blocks under it filled the viewport so
 * completely that the table showed no rows at all. Simple Mode keeps the full
 * header on a tall screen: it has no table to squeeze, and the stats are the
 * reassurance that round is made of.
 */
export function defaultDeckExpanded(viewportHeight: number, uiMode: 'advanced' | 'beginner' = 'beginner'): boolean {
  if (uiMode === 'advanced') return false;
  return viewportHeight >= SHORT_VIEWPORT_PX;
}

/** The stored choice, or the default when there isn't one. */
export function readDeckExpanded(viewportHeight: number, uiMode: 'advanced' | 'beginner' = 'beginner'): boolean {
  try {
    const stored = localStorage.getItem(DECK_STORAGE_KEY);
    if (stored === 'expanded') return true;
    if (stored === 'collapsed') return false;
  } catch {
    // Private mode or a blocked store: fall back to the height rule rather
    // than failing to render the header at all.
  }
  return defaultDeckExpanded(viewportHeight, uiMode);
}

export function writeDeckExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(DECK_STORAGE_KEY, expanded ? 'expanded' : 'collapsed');
  } catch {
    // Not being able to remember the choice is survivable; crashing is not.
  }
}
