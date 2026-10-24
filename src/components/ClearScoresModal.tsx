// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { PendingScoreClear } from '../types';

import { useDialog } from '../lib/useDialog';
import { readBlindTaste } from '../lib/blindMode';
import { Trash2, X } from 'lucide-react';

export function ClearScoresModal({
  pending,
  scoreCount,
  onCancel,
  onConfirm,
}: {
  pending: PendingScoreClear;
  scoreCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const clearScoresRef = useDialog<HTMLElement>(onCancel);
  const isAll = pending.mode === 'all';
  // Said only to someone who has made blind picks; to anyone else it is a
  // term for a feature they have not met.
  const blindPicks = isAll ? readBlindTaste().picks.length : 0;
  const title = isAll ? 'Clear all scores?' : `Clear the ${pending.model} score?`;
  const actionLabel = isAll ? 'Clear all scores' : 'Clear score';

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={clearScoresRef} className="run-warning-modal destructive-modal" role="dialog" aria-modal="true" aria-labelledby="clear-scores-title">
        <div className="modal-title danger">
          <Trash2 aria-hidden="true" />
          <div>
            <span>Scores</span>
            <strong id="clear-scores-title">{title}</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            {isAll ? (
              <>
                This clears <strong>{scoreCount}</strong> saved score{scoreCount === 1 ? '' : 's'}, Speed Dating rankings,
                {blindPicks > 0 && <> your <strong>{blindPicks}</strong> blind pick{blindPicks === 1 ? '' : 's'},</>}
                {' '}and test transcripts.
              </>
            ) : (
              <>
                This clears the saved scorecard and test transcript for <strong>{pending.model}</strong>.
              </>
            )}{' '}
            It does <strong>not</strong> delete any installed Ollama model.
          </p>
          <div className="modal-warning-grid">
            <div>
              <span>Clears</span>
              <strong>{isAll ? 'Scores + transcripts' : 'One scorecard'}</strong>
              <em>{isAll ? 'All model match scores and comparison results reset.' : 'This model returns to an untested state.'}</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Ollama models</strong>
              <em>Downloaded model files are left alone.</em>
            </div>
            <div>
              <span>Keeps</span>
              <strong>Questions + theme</strong>
              <em>Your test suite, UI settings, chat, and queue stay as-is.</em>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="danger-button compact" onClick={onConfirm}>
            <Trash2 aria-hidden="true" />
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
