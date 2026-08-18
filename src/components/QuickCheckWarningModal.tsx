import { formatGb } from '../lib/format';
import { useDialog } from '../lib/useDialog';
import type { ModelRow } from '../types';
import { AlertTriangle, X, Zap } from 'lucide-react';
import { useState } from 'react';

export function QuickCheckWarningModal({
  row,
  questionCount,
  onCancel,
  onConfirm,
}: {
  row: ModelRow;
  questionCount: number;
  onCancel: () => void;
  onConfirm: (dontWarnAgain: boolean) => void;
}) {
  const quickCheckRef = useDialog<HTMLElement>(onCancel);
  const [dontWarnAgain, setDontWarnAgain] = useState(false);
  const sizeLabel = row.sizeGb ? `${formatGb(row.sizeGb)}` : 'its full weights';

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={quickCheckRef} className="run-warning-modal" role="dialog" aria-modal="true" aria-labelledby="quick-check-warning-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>Resource Warning</span>
            <strong id="quick-check-warning-title">Quick test {row.displayName}?</strong>
          </div>
        </div>
        <div className="modal-body">
          <p>
            This loads <strong>{row.displayName}</strong> ({sizeLabel}) into VRAM and runs{' '}
            <strong>{questionCount} quick question{questionCount === 1 ? '' : 's'}</strong>. While it runs,
            your GPU, CPU, RAM, fans, and battery will work hard and other apps may slow down.
          </p>
          <p>A quick test takes about a minute. Use Speed Dating for the full comparison.</p>
          <label className="quick-check-optout">
            <input
              type="checkbox"
              checked={dontWarnAgain}
              onChange={(event) => setDontWarnAgain(event.target.checked)}
            />
            <span>Don't warn me before quick tests again</span>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="primary-button compact" onClick={() => onConfirm(dontWarnAgain)}>
            <Zap aria-hidden="true" />
            Start Quick Test
          </button>
        </div>
      </section>
    </div>
  );
}
