// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { NavId } from '../types';
import type { UiIconName } from '../components/icons/uiIconArt';
import { isComparedChannel, type WorkbenchId } from './workbench.ts';

/**
 * Advanced Mode's tabs across the top, and which screen each one opens.
 *
 * The redesign groups the old eight-item side menu into six tabs. Until each
 * tab's screen is rebuilt, a tab opens the screen that already does its job:
 * Results opens Scorecards, with Top Pick and the run list beside it; Labs is
 * Comparison on a channel that makes or hears things (pictures, video, sound,
 * listening); My PC is Your Rig. Nothing that was reachable becomes
 * unreachable on the way.
 */

export type TopTabId = 'models' | 'whatsNew' | 'comparison' | 'labs' | 'results' | 'mypc';

export const TOP_TABS: Array<{ id: TopTabId; label: string; icon: UiIconName }> = [
  { id: 'models', label: 'Models', icon: 'models' },
  { id: 'whatsNew', label: "What's New", icon: 'sparkle' },
  { id: 'comparison', label: 'Comparison', icon: 'hearts' },
  { id: 'labs', label: 'Labs', icon: 'lab' },
  { id: 'results', label: 'Results', icon: 'trophy' },
  { id: 'mypc', label: 'My PC', icon: 'tv' },
];

/** The channels with a lab of their own: they render or listen, so Speed Dating cannot test them. */
export const LAB_CHANNELS: WorkbenchId[] = ['images', 'video', 'audio', 'listening'];
/** The channels Speed Dating can test. */
export const SHOW_CHANNELS: WorkbenchId[] = ['all', 'chat', 'code', 'reading'];

/** Which tab is lit for the screen and channel on show. Settings has none: it has its own button. */
export function tabForView(nav: NavId, workbench: WorkbenchId): TopTabId | null {
  switch (nav) {
    case 'models': return 'models';
    case 'whatsNew': return 'whatsNew';
    case 'speedDate': return isComparedChannel(workbench) ? 'labs' : 'comparison';
    case 'activity': return isComparedChannel(workbench) ? 'labs' : 'results';
    case 'history':
    case 'agent': return 'results';
    case 'lan': return 'mypc';
    default: return null;
  }
}

/**
 * Where a tab goes, and the channel it needs. Comparison and Labs share the
 * Comparison screen and differ by channel, so each moves the channel only when
 * the current one belongs to the other.
 */
export function viewForTab(tab: TopTabId, workbench: WorkbenchId): { nav: NavId; workbench?: WorkbenchId } {
  switch (tab) {
    case 'models': return { nav: 'models' };
    case 'whatsNew': return { nav: 'whatsNew' };
    case 'comparison': return isComparedChannel(workbench) ? { nav: 'speedDate', workbench: 'all' } : { nav: 'speedDate' };
    case 'labs': return isComparedChannel(workbench) ? { nav: 'speedDate' } : { nav: 'speedDate', workbench: 'images' };
    // Results ranks what Speed Dating measured; a lab's results are in Labs.
    case 'results': return isComparedChannel(workbench) ? { nav: 'history', workbench: 'all' } : { nav: 'history' };
    case 'mypc': return { nav: 'lan' };
  }
}
