// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { useAchievements, type AchievementId } from '../lib/achievements';
import { hostLine } from '../lib/hostScript';
import { setShowExtras, useShowExtras } from '../lib/showExtras';
import { playCue } from '../lib/sound';
import { useDialog } from '../lib/useDialog';
import { AchievementBadge } from './AchievementBadge';
import './TrojanReveal.css';

const BULBS = Array.from({ length: 12 }, (_, i) => i);

/**
 * The hidden badge, earned: a full-screen moment with the marquee, the
 * amphora at 180px, the host's line and the fanfare. Take a bow closes it;
 * the Trojan stage it unlocks is one more click away.
 */
export function TrojanReveal({ onClose }: { onClose: () => void }) {
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const extras = useShowExtras();
  const bowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    bowRef.current?.focus();
    playCue('fanfare');
  }, []);

  return (
    <div className="trojan-reveal" role="presentation">
      <div
        ref={panelRef}
        className="trojan-reveal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trojan-reveal-title"
        aria-describedby="trojan-reveal-line"
      >
        <div className="trojan-reveal-bulbs" aria-hidden="true">
          {BULBS.map((i) => <span key={i} />)}
        </div>
        <p className="trojan-reveal-kicker">Hidden badge unlocked</p>
        <div className="trojan-reveal-badge">
          <AchievementBadge id="trojan-hero" earned size={180} />
        </div>
        <h2 id="trojan-reveal-title">Trojan hero</h2>
        <p id="trojan-reveal-line" className="trojan-reveal-line">{hostLine('trojan')}</p>
        <p className="trojan-reveal-reward">It unlocked the Trojan stage: the show dressed like a Greek vase, with a laurel for the winner.</p>
        <div className="trojan-reveal-actions">
          <button ref={bowRef} type="button" className="btn btn-gold" onClick={onClose}>Take a bow</button>
          {extras.stage !== 'trojan' && (
            <button
              type="button"
              className="btn btn-line"
              onClick={() => { setShowExtras({ stage: 'trojan' }); onClose(); }}
            >
              Switch to the Trojan stage
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The sound and spectacle when a badge is earned while the app is open: the
 * sting for most, the full reveal for the Trojan hero.
 *
 * Earned is compared with the last render rather than read from "seen": the
 * Winner screen's note marks a badge seen as soon as it shows it. A badge
 * found while the app opens is recorded as seen in the same commit, so
 * someone upgrading with fifty runs behind them gets no fanfare for last month.
 */
export function AchievementCues() {
  const state = useAchievements();
  const previous = useRef(state.earned);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const fresh = (Object.keys(state.earned) as AchievementId[])
      .filter((id) => !previous.current[id] && !state.seen.includes(id));
    previous.current = state.earned;
    if (fresh.includes('trojan-hero')) setReveal(true);
    else if (fresh.length > 0) playCue('sting');
  }, [state]);

  return reveal ? <TrojanReveal onClose={() => setReveal(false)} /> : null;
}
