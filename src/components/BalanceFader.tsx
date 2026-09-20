// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { BALANCE_NOTCHES, balanceSplit, clampBalance, notchAt } from '../lib/balance';

/** Whole steps either side of a notch that land on it while dragging. */
const DETENT = 2;

/**
 * The Balance fader: how much accuracy counts against speed.
 *
 * Built as console hardware, accuracy at the top and speed at the bottom with
 * detents at the three old presets, because it is set and left like a channel
 * level rather than filled in like a form. It is asked before every test and
 * sits beside every result, and the one control has to read the same in the
 * Run dialog, a Lab card and the top deck.
 *
 * Its own slider rather than a styled range input: a vertical range with a
 * shaped cap still renders differently between engines, and a fader that looks
 * like a stock form control reads as a setting, not a question.
 *
 * `lockedReason` is for a channel where nothing can judge accuracy. The fader
 * shows Speed and says why, and the saved position is left alone, so it comes
 * back the day a judge is installed.
 */
export function BalanceFader({
  value,
  onChange,
  accuracyMeans,
  lockedReason = null,
  variant = 'full',
  disabled = false,
  label = 'What matters more?',
}: {
  /** 0 is speed only, 100 is accuracy only. */
  value: number;
  onChange: (value: number) => void;
  /** What accuracy means here, in words someone can check. */
  accuracyMeans: string;
  lockedReason?: string | null;
  /** `full` asks the question before a test; `mini` sits on a result card. */
  variant?: 'full' | 'mini';
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const railRef = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  const locked = Boolean(lockedReason);
  const inert = disabled || locked;
  const shown = locked ? 0 : clampBalance(value);
  const notch = locked ? null : notchAt(shown);
  const split = balanceSplit(shown);

  const commit = (next: number) => {
    const settled = Math.round(clampBalance(next));
    if (settled !== Math.round(shown)) onChange(settled);
  };

  const fromPointer = (clientY: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const position = Math.round(clampBalance((1 - (clientY - rect.top) / rect.height) * 100));
    const detent = BALANCE_NOTCHES.find((mark) => Math.abs(mark.value - position) <= DETENT);
    commit(detent ? Math.round(detent.value) : position);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (inert || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    setDragging(true);
    fromPointer(event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (inert) return;
    const from = Math.round(shown);
    const step = event.shiftKey ? 10 : 1;
    const moves: Partial<Record<string, number>> = {
      ArrowUp: from + step,
      ArrowRight: from + step,
      ArrowDown: from - step,
      ArrowLeft: from - step,
      PageUp: from + 10,
      PageDown: from - 10,
      Home: 0,
      End: 100,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  const stopDragging = () => setDragging(false);
  const valueText = locked
    ? `Speed only. ${lockedReason}`
    : `${split}${notch ? `, ${notch.label}` : ''}`;

  return (
    <section
      className={`balance-fader ${variant}${locked ? ' locked' : ''}${disabled ? ' disabled' : ''}`}
      aria-labelledby={`${id}-label`}
    >
      {/* Both ends are named on the mini fader too. Without them it is an
          unlabeled meter on a card: a slider with a cap, nothing saying what
          moving it would trade for what. The tooltip said so only to a mouse
          that stopped on it. */}
      <div className="balance-fader-console">
        <span className="balance-fader-end" aria-hidden="true">Accuracy</span>
        <div
          className={`balance-fader-slot${dragging ? ' dragging' : ''}`}
          role="slider"
          tabIndex={inert ? -1 : 0}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={valueText}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-means`}
          aria-disabled={inert || undefined}
          title={variant === 'mini' ? `${label} ${locked ? 'Speed only' : split}` : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={(event) => { if (dragging) fromPointer(event.clientY); }}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={stopDragging}
          onKeyDown={onKeyDown}
          style={{ '--balance': `${shown}%` } as CSSProperties}
        >
          <span className="balance-fader-rail" ref={railRef} aria-hidden="true">
            {BALANCE_NOTCHES.map((mark) => (
              <i
                key={mark.id}
                className={`balance-fader-tick${notch?.id === mark.id ? ' on' : ''}`}
                style={{ bottom: `${mark.value}%` }}
              />
            ))}
            <span className="balance-fader-groove" />
            <span className="balance-fader-cap" />
          </span>
        </div>
        <span className="balance-fader-end" aria-hidden="true">Speed</span>
      </div>

      {variant === 'full' ? (
        <div className="balance-fader-copy">
          <span className="balance-fader-question" id={`${id}-label`}>{label}</span>
          <strong className="balance-fader-readout" aria-live="polite">
            {locked ? 'Speed only' : notch ? <>{notch.label} <em>{split}</em></> : split}
          </strong>
          <div className="balance-fader-notches" role="group" aria-label="Quick settings">
            {[...BALANCE_NOTCHES].reverse().map((mark) => (
              <button
                key={mark.id}
                type="button"
                className={notch?.id === mark.id ? 'active' : ''}
                aria-pressed={notch?.id === mark.id}
                disabled={inert}
                onClick={() => commit(Math.round(mark.value))}
              >
                {mark.label}
              </button>
            ))}
          </div>
          <p className="balance-fader-means" id={`${id}-means`}>
            {locked
              ? lockedReason
              : <>Accuracy here is {accuracyMeans}. Moving this re-ranks results you already have; nothing runs again.</>}
          </p>
        </div>
      ) : (
        <>
          <span className="sr-only" id={`${id}-label`}>{label}</span>
          <span className="sr-only" id={`${id}-means`}>
            {locked ? lockedReason : `Accuracy here is ${accuracyMeans}.`}
          </span>
        </>
      )}
    </section>
  );
}
