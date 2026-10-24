// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { copyText } from '../lib/clipboard';
import type { FitGrade } from '../lib/modelGrade';

const SPEED_NOTE: Record<NonNullable<FitGrade['speedSource']>, string> = {
  measured: 'Speed measured on this computer.',
  'this-pc': 'Speed estimated from the models tested on this computer.',
  estimate: 'Speed is an estimate until a model has been tested here.',
};

/**
 * The Fit grade as a letter, explained on hover and on a click.
 *
 * Hover gives the one-line reason as a tooltip; a click (or a tap, or Enter)
 * opens the same reasons as a native popover beside the letter, which closes
 * on Escape or a click elsewhere and needs no state here to do it. On a
 * family's row it is the best version's grade, and says which version.
 */
export function FitGradeChip({ grade, model, family = false }: { grade: FitGrade; model: string; family?: boolean }) {
  const id = useId();
  const label = grade.letter === '?' ? 'No fit grade yet' : `Fit grade ${grade.letter}`;
  const heading = family ? `${label}, for ${model}` : label;
  return (
    <>
      <button
        type="button"
        className={`fit-grade grade-${grade.letter === '?' ? 'unknown' : grade.letter.toLowerCase()}`}
        popoverTarget={id}
        // A family's row opens on a click; the grade's click is its own.
        onClick={(event) => event.stopPropagation()}
        title={`${heading}: ${grade.summary}`}
        aria-label={`${label} for ${model}${family ? ', the best fit in its family' : ''}. ${grade.summary}`}
      >
        {/* "Fit" on the chip itself: a bare letter beside the Match pill's
            "92.7 A" read as a second Match grade. */}
        <span className="fit-grade-word">Fit</span>
        {grade.letter}
      </button>
      <div id={id} popover="auto" className="fit-grade-pop" role="note" onClick={(event) => event.stopPropagation()}>
        <strong>{heading}</strong>
        <ul>
          {grade.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <em>
          A for the best pick for this computer, F if it will not fit.
          {grade.speedSource ? ` ${SPEED_NOTE[grade.speedSource]}` : ''}
        </em>
      </div>
    </>
  );
}

/**
 * Copies the download command, and says so for a moment. Quiet by design: an
 * icon on a row and a text button on the model page, never a gold one.
 */
export function CopyCommandButton({ command, variant = 'icon' }: { command: string; variant?: 'icon' | 'text' }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => {
    if (copied === null) return undefined;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const title = copied === null ? `Copy “${command}”` : copied ? 'Copied' : 'Could not reach the clipboard';
  return (
    <button
      type="button"
      className={variant === 'icon' ? 'icon-action copy-command-button' : 'btn btn-link copy-command-button'}
      onClick={() => void copyText(command).then(setCopied)}
      title={title}
      aria-label={copied === null ? `Copy the command ${command}` : title}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {variant === 'text' && <span>{copied === null ? 'Copy' : copied ? 'Copied' : 'Not copied'}</span>}
    </button>
  );
}
