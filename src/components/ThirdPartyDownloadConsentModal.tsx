// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { formatGb } from '../lib/format';
import { licenseLinksForModels } from '../lib/modelLicenses';
import { useDialog } from '../lib/useDialog';
import type { ModelRow } from '../types';
import { AlertTriangle, Download, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';

export function ThirdPartyDownloadConsentModal({
  rows,
  onCancel,
  onConfirm,
}: {
  rows: ModelRow[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const consentRef = useDialog<HTMLElement>(onCancel);
  const [accepted, setAccepted] = useState(false);
  const visibleRows = rows.slice(0, 5);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={consentRef} className="run-warning-modal third-party-download-modal" role="dialog" aria-modal="true" aria-labelledby="third-party-download-title">
        <div className="modal-title">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span>Third-party model download</span>
            <strong id="third-party-download-title">Review model terms first</strong>
          </div>
        </div>

        <div className="modal-body">
          <p>
            RigMatch will ask your local Ollama install to download <strong>{rows.length}</strong> third-party model
            {rows.length === 1 ? '' : 's'}. RigMatch does not bundle these model weights or control their provider terms.
          </p>

          <ol className="third-party-download-list" aria-label="Models queued for download">
            {visibleRows.map((row) => (
              <li key={row.id}>
                <span>{row.displayName}</span>
                <em>{row.sizeGb != null ? `${formatGb(row.sizeGb)} download` : 'Size unknown'}</em>
              </li>
            ))}
            {hiddenCount > 0 && (
              <li>
                <span>+{hiddenCount} more</span>
                <em>Review each model's provider terms if needed.</em>
              </li>
            )}
          </ol>

          {/* The terms for the models actually queued, not a fixed list. This
              dialog asks for informed consent; linking Gemma's prohibited-use
              policy while downloading DeepSeek is the opposite of informing. */}
          <div className="third-party-download-links" aria-label="Model provider terms">
            {licenseLinksForModels(rows.map((row) => row.displayName)).map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
                <ExternalLink aria-hidden="true" />
              </a>
            ))}
          </div>

          <label className="third-party-download-consent">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.currentTarget.checked)}
            />
            <span>I understand these models are provided by third parties and may be subject to separate licenses and use policies.</span>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="mini-button outline" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button type="button" className="primary-button compact" onClick={onConfirm} disabled={!accepted}>
            <Download aria-hidden="true" />
            Download All
          </button>
        </div>
      </section>
    </div>
  );
}
