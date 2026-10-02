// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  ACHIEVEMENTS,
  achievementSnapshot,
  markAchievementsSeen,
  unannounced,
  useAchievements,
  type Achievement,
  type AchievementId,
} from '../lib/achievements';
import { setShowExtras, useShowExtras } from '../lib/showExtras';
import { AchievementBadge } from './AchievementBadge';
import './AchievementShelf.css';

const earnedOn = (at: string) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const byId = (id: AchievementId) => ACHIEVEMENTS.find((a) => a.id === id) as Achievement;
/** What a badge is called where it can be seen: a hidden one has no name until earned. */
const badgeName = (a: Achievement, earned: boolean) => (a.hidden && !earned ? 'Hidden achievement' : a.title);

/**
 * One badge, up close: the pin at full size, its name, and either when it was
 * earned or how to earn it. Opened from any badge in the case, earned or not —
 * a locked badge is the most useful one to click, because it says what to try.
 * A row of every badge along the bottom moves between them.
 *
 * A native popover: it sits above everything, closes on Escape or a click
 * outside, and needs no focus trap of its own.
 */
function useBadgeSplash() {
  const { earned } = useAchievements();
  const extras = useShowExtras();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [selected, setSelected] = useState<AchievementId>(ACHIEVEMENTS[0].id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // Back to the badge that opened it, wherever the popover was closed from.
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') invokerRef.current?.focus();
    };
    el.addEventListener('toggle', onToggle);
    return () => el.removeEventListener('toggle', onToggle);
  }, []);

  const open = (id: AchievementId, invoker: HTMLElement | null) => {
    setSelected(id);
    invokerRef.current = invoker;
    const el = ref.current;
    if (el && !el.matches(':popover-open')) el.showPopover?.();
    requestAnimationFrame(() => closeRef.current?.focus());
  };

  const a = byId(selected);
  const at = earned[a.id];
  const secret = Boolean(a.hidden && !at);
  const count = ACHIEVEMENTS.filter((x) => earned[x.id]).length;
  const stageButton = a.id === 'trojan-hero' && at;

  const splash = (
    <div ref={ref} popover="auto" className="badge-splash" role="dialog" aria-labelledby={titleId}>
      <button ref={closeRef} type="button" className="badge-splash-close" onClick={() => ref.current?.hidePopover()} aria-label="Close">
        <X aria-hidden="true" />
      </button>
      <div className={at ? 'badge-splash-hero earned' : 'badge-splash-hero'}>
        <AchievementBadge id={a.id} earned={Boolean(at)} hidden={a.hidden} size={112} />
      </div>
      <h2 id={titleId}>{secret ? '???' : a.title}</h2>
      <p className={at ? 'badge-splash-state earned' : 'badge-splash-state'}>
        {at ? `Earned ${earnedOn(at)}` : 'Not earned yet'}
      </p>
      <p className="badge-splash-how">
        {at ? a.done : secret ? a.hint : <><b>To unlock it:</b> {a.how}</>}
      </p>
      {at && a.reward && <p className="badge-splash-reward">{a.reward.replace('Unlocks', 'It unlocked')}</p>}
      {stageButton && (
        <button
          type="button"
          className="badge-splash-use"
          onClick={() => setShowExtras({ stage: extras.stage === 'trojan' ? 'studio' : 'trojan' })}
        >
          {extras.stage === 'trojan' ? 'Back to the studio stage' : 'Switch to the Trojan stage'}
        </button>
      )}
      <div className="badge-splash-row" role="group" aria-label={`All achievements, ${count} of ${ACHIEVEMENTS.length} earned`}>
        {ACHIEVEMENTS.map((x) => (
          <button
            key={x.id}
            type="button"
            className="badge-slot"
            aria-pressed={x.id === a.id}
            aria-label={`${badgeName(x, Boolean(earned[x.id]))}, ${earned[x.id] ? 'earned' : 'not earned yet'}`}
            title={badgeName(x, Boolean(earned[x.id]))}
            onClick={() => setSelected(x.id)}
          >
            <AchievementBadge id={x.id} earned={Boolean(earned[x.id])} hidden={x.hidden} size={22} />
          </button>
        ))}
      </div>
      <p className="badge-splash-count">{count} of {ACHIEVEMENTS.length} earned</p>
    </div>
  );
  return { open, splash };
}

/**
 * The badge case in the top bar: every badge, earned ones as pins and the
 * rest as empty sockets of the right shape, the way a trainer's badge case
 * shows what is still out there. Each one opens its own splash.
 */
export function BadgeCase({ compact = false }: { compact?: boolean }) {
  const { earned } = useAchievements();
  const { open, splash } = useBadgeSplash();
  const count = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  const next = ACHIEVEMENTS.find((a) => !earned[a.id] && !a.hidden) ?? ACHIEVEMENTS[0];
  return (
    <div className={compact ? 'badge-case compact' : 'badge-case'} role="group" aria-label={`Achievements, ${count} of ${ACHIEVEMENTS.length} earned`}>
      {!compact && ACHIEVEMENTS.map((a) => {
        const got = Boolean(earned[a.id]);
        return (
          <button
            key={a.id}
            type="button"
            className="badge-slot"
            aria-label={`${badgeName(a, got)}, ${got ? 'earned' : 'not earned yet'}`}
            title={badgeName(a, got)}
            onClick={(event) => open(a.id, event.currentTarget)}
          >
            <AchievementBadge id={a.id} earned={got} hidden={a.hidden} size={20} />
          </button>
        );
      })}
      {/* On a narrow window the row gives way to a count that opens the same splash. */}
      <button
        type="button"
        className="badge-case-count"
        aria-label={`Achievements, ${count} of ${ACHIEVEMENTS.length} earned`}
        onClick={(event) => open(next.id, event.currentTarget)}
      >
        <AchievementBadge id={next.id} earned={Boolean(earned[next.id])} size={18} />
        {count}/{ACHIEVEMENTS.length}
      </button>
      {splash}
    </div>
  );
}

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
          return (
            <li key={a.id} className={at ? 'earned' : 'locked'}>
              <AchievementBadge id={a.id} earned={Boolean(at)} hidden={a.hidden} size={30} />
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
 * "You earned …", on the Winner screen, for whatever this show earned.
 *
 * It holds on to what it announced for as long as the screen is up: marking a
 * badge seen is what stops it being announced again, and the note must not
 * vanish the moment it has been read.
 */
export function AchievementUnlocked() {
  const state = useAchievements();
  const extras = useShowExtras();
  const { open, splash } = useBadgeSplash();
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
  const line = (a: Achievement): ReactNode => <>{a.done}{a.reward ? ` ${a.reward}` : ''}</>;
  return (
    <section className="achievement-unlocked" aria-labelledby="achievement-unlocked-title">
      <div className="achievement-unlocked-pins">
        {shown.map((a) => (
          <button
            key={a.id}
            type="button"
            className="badge-slot"
            aria-label={`${a.title}, earned`}
            title={a.title}
            onClick={(event) => open(a.id, event.currentTarget)}
          >
            <AchievementBadge id={a.id} earned size={shown.length === 1 ? 44 : 34} />
          </button>
        ))}
      </div>
      <div className="achievement-copy">
        <h3 id="achievement-unlocked-title">
          {shown.length === 1 ? `You earned ${shown[0].title}` : `You earned ${shown.length} achievements`}
        </h3>
        {shown.length === 1 ? (
          <p>{line(shown[0])}</p>
        ) : (
          <ul>
            {shown.map((a) => <li key={a.id}><b>{a.title}</b> {line(a)}</li>)}
          </ul>
        )}
        {trojan && extras.stage !== 'trojan' && (
          <div className="achievement-actions">
            <button type="button" className="achievement-use" onClick={() => setShowExtras({ stage: 'trojan' })}>
              Switch to the Trojan stage
            </button>
          </div>
        )}
      </div>
      {splash}
    </section>
  );
}
