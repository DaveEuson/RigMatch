// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useState } from 'react';
import { Amphora, CircleHelp, Heart, Image, Lock, Music, Repeat, Scale, Shield, Terminal, Users, Wrench, type LucideIcon } from 'lucide-react';
import {
  ACHIEVEMENTS,
  achievementSnapshot,
  markAchievementsSeen,
  unannounced,
  useAchievements,
  type AchievementId,
} from '../lib/achievements';
import { setShowExtras, useShowExtras } from '../lib/showExtras';
import './AchievementShelf.css';

const ICONS: Record<AchievementId, LucideIcon> = {
  'first-date': Heart,
  'speed-dater': Users,
  'second-date': Repeat,
  'fair-judge': Scale,
  'hands-on': Wrench,
  'thick-skin': Shield,
  'picture-this': Image,
  'say-it': Music,
  penguin: Terminal,
  'trojan-hero': Amphora,
};

const earnedOn = (at: string) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Every achievement, earned or not. A locked one says what to try, which is
 * the point of having them: the shelf is a list of things RigMatch can do that
 * most people never find. A hidden one stays "???" with a hint until earned.
 */
export function AchievementShelf() {
  const { earned } = useAchievements();
  const count = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  return (
    <div className="achievement-shelf">
      <p className="achievement-shelf-count">
        <b>{count} of {ACHIEVEMENTS.length}</b> earned. Each one is something worth trying.
      </p>
      <ul>
        {ACHIEVEMENTS.map((a) => {
          const at = earned[a.id];
          const secret = Boolean(a.hidden && !at);
          const Icon = secret ? CircleHelp : at ? ICONS[a.id] : Lock;
          return (
            <li key={a.id} className={at ? 'earned' : 'locked'}>
              <span className="achievement-badge" aria-hidden="true"><Icon /></span>
              <div className="achievement-copy">
                <b>{secret ? '???' : a.title}</b>
                <span>{secret ? a.hint : a.how}</span>
                {at && a.reward && <span className="achievement-reward">{a.reward}</span>}
                <em>{at ? `Earned ${earnedOn(at)}` : 'Not earned yet'}</em>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * "Achievement unlocked", on the Winner screen, for whatever this show earned.
 *
 * It holds on to what it announced for as long as the screen is up: marking a
 * badge seen is what stops it being announced again, and the note must not
 * vanish the moment it has been read.
 */
export function AchievementUnlocked() {
  const state = useAchievements();
  const extras = useShowExtras();
  const [since] = useState(() => {
    const snapshot = achievementSnapshot();
    const pending = unannounced(snapshot).map((a) => Date.parse(snapshot.earned[a.id] ?? ''));
    return Math.min(Date.now(), ...pending.filter(Number.isFinite));
  });
  const shown = ACHIEVEMENTS.filter((a) => {
    const at = state.earned[a.id];
    return Boolean(at) && (!state.seen.includes(a.id) || Date.parse(at ?? '') >= since);
  });
  const fresh = shown.filter((a) => !state.seen.includes(a.id)).map((a) => a.id).join(',');
  useEffect(() => {
    if (fresh) markAchievementsSeen(fresh.split(',') as AchievementId[]);
  }, [fresh]);
  if (shown.length === 0) return null;
  const trojan = shown.some((a) => a.id === 'trojan-hero');
  const Icon = ICONS[shown[0].id];
  return (
    <section className="achievement-unlocked" aria-labelledby="achievement-unlocked-title">
      <span className="achievement-badge" aria-hidden="true"><Icon /></span>
      <div className="achievement-copy">
        <h3 id="achievement-unlocked-title">
          {shown.length === 1 ? `You earned ${shown[0].title}` : `You earned ${shown.length} achievements`}
        </h3>
        {shown.length === 1 ? (
          <p>{shown[0].how}{shown[0].reward ? ` ${shown[0].reward}` : ''}</p>
        ) : (
          <ul>
            {shown.map((a) => (
              <li key={a.id}><b>{a.title}</b> {a.how}{a.reward ? ` ${a.reward}` : ''}</li>
            ))}
          </ul>
        )}
        <div className="achievement-actions">
          {trojan && extras.stage !== 'trojan' && (
            <button type="button" className="achievement-use" onClick={() => setShowExtras({ stage: 'trojan' })}>
              Switch to the Trojan stage
            </button>
          )}
          <details className="achievement-all">
            <summary>See all achievements</summary>
            <AchievementShelf />
          </details>
        </div>
      </div>
    </section>
  );
}
