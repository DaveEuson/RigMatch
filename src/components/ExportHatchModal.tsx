import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, X } from 'lucide-react';
import type { BuildHatchResult } from '../lib/hatchProfile';

// "Export for Hatch": shows the JSON profile RigMatch built, with a primary
// Copy-to-clipboard action (paste into Hatch → Messenger → Connection tab →
// "Import a RigMatch profile") and a Download .json fallback.
export function ExportHatchModal({ result, onClose }: {
  result: BuildHatchResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const json = result.ok ? result.json : '';

  const copyJson = useCallback(() => {
    if (!json) return;
    void navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => undefined);
  }, [json]);

  const downloadJson = useCallback(() => {
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rigmatch-hatch-profile.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [json]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal export-hatch-modal" role="dialog" aria-modal="true" aria-label="Export for Hatch">
        <div className="modal-title">
          <div>
            <span>Export for Hatch</span>
            <strong>{result.ok ? result.profile.recommendedLocalModel : 'Nothing to export yet'}</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>

        {result.ok ? (
          <>
            <p className="export-hatch-intro">
              This is a RigMatch profile Hatch can import. In Hatch, open <strong>Messenger → Connection → “Import a RigMatch profile”</strong> and paste it — Hatch will set your local model to <strong>{result.profile.recommendedLocalModel}</strong> without you typing a model name.
            </p>

            <pre className="export-hatch-json" aria-label="Hatch profile JSON">{result.json}</pre>

            <div className="export-hatch-actions">
              <button type="button" className="pick-this-one-btn" onClick={copyJson}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copied — paste into Hatch' : 'Copy to clipboard'}
              </button>
              <button type="button" className="mini-button outline" onClick={downloadJson}>
                <Download aria-hidden="true" />
                Download .json
              </button>
            </div>
            <p className="export-hatch-hint">
              Copy is the quick path — paste straight into Hatch's import box. The .json download is handy if you're moving it to another machine.
            </p>
          </>
        ) : (
          <div className="export-hatch-empty">
            <AlertTriangle aria-hidden="true" />
            <p>{result.reason}</p>
          </div>
        )}
      </section>
    </div>
  );
}
