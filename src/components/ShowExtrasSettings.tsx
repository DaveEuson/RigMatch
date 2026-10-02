// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { setShowExtras, useShowExtras } from '../lib/showExtras';
import { useAchievements } from '../lib/achievements';

/**
 * The same two switches Simple Mode shows beside the host, for anyone who
 * lives in Advanced Mode. Off unless turned on. The Trojan stage joins them
 * once it has been earned, and not before: an unearned unlock is a spoiler.
 */
export function ShowExtrasSettings() {
  const extras = useShowExtras();
  const { earned } = useAchievements();
  return (
    <>
      <label className="advanced-lab-consent">
        <input
          type="checkbox"
          checked={extras.music}
          onChange={(event) => setShowExtras({ music: event.target.checked })}
        />
        <span>
          Theme music during Speed Dating. A corny game-show tune while the contestants answer, a
          ta-da for the winner and a sad trombone when a show stops. It is played live by this computer
          — no audio file, nothing downloaded — and never over a listening round.
        </span>
      </label>
      <label className="advanced-lab-consent">
        <input
          type="checkbox"
          checked={extras.effects}
          onChange={(event) => setShowExtras({ effects: event.target.checked })}
        />
        <span>
          Show effects in Simple Mode: contestants walk on, an APPLAUSE sign, curtains for the
          winner, and hearts when you pick. All of them stay still when Windows is set to reduce
          motion.
        </span>
      </label>
      {earned['trojan-hero'] && (
        <label className="advanced-lab-consent">
          <input
            type="checkbox"
            checked={extras.stage === 'trojan'}
            onChange={(event) => setShowExtras({ stage: event.target.checked ? 'trojan' : 'studio' })}
          />
          <span>
            The Trojan stage, earned by testing Ajax. Simple Mode's show is dressed like a Greek vase,
            in black and terracotta with bronze trim and a laurel for the winner. The host talks to the
            bros, and picks get fist bumps instead of hearts.
          </span>
        </label>
      )}
    </>
  );
}
