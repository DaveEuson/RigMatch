// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useId } from 'react';
import type { AchievementId } from '../lib/achievements';
import { BADGE_ART } from './badgeArt';

/**
 * A badge, drawn as an enamel pin: each its own shape and metal, so a row of
 * them reads as a collection at a glance and a missing one is an empty socket
 * of the right shape. The art is the redesign's set (badgeArt.ts).
 *
 * The pin colors are artwork, like the contestant portraits, not theme
 * tokens: a badge earned in Stage Plum is the same badge in Avocado Green.
 */
export function AchievementBadge({ id, earned, hidden, size = 30 }: {
  id: AchievementId;
  earned: boolean;
  /** A hidden badge not yet earned shows only a "?" socket. */
  hidden?: boolean;
  size?: number;
}) {
  // Every badge's highlight gradient has the same id in the source art; on a
  // page with ten of them the first definition would serve them all.
  const uid = `badge${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const art = BADGE_ART[id];
  const body = earned ? art.earned : hidden && art.hidden ? art.hidden : art.socket;
  return (
    <svg
      className={earned ? 'achievement-pin' : 'achievement-pin socket'}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body.replaceAll('__ID__', uid) }}
    />
  );
}
