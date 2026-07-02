import { useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { buildSandboxedPreviewHtml } from '../lib/labPreview';

/**
 * Sandboxed player for App Builder output. Scripts run in an isolated,
 * opaque-origin iframe with a network-blocking CSP — see lib/labPreview.ts.
 */
export function AppBuilderPreviewModal({
  html,
  model,
  onClose,
}: {
  html: string;
  model: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    iframeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="run-warning-modal advanced-lab-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-builder-preview-title"
      >
        <div className="modal-title">
          <ShieldCheck aria-hidden="true" />
          <div>
            <span>Sandboxed preview — nothing leaves this window</span>
            <strong id="app-builder-preview-title">{model} · App Builder output</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>
        <p className="advanced-lab-preview-note">
          This runs the generated code in an isolated frame with network, storage, and RigMatch access blocked.
          Click inside the game area first so it can hear your keyboard.
        </p>
        <iframe
          ref={iframeRef}
          className="advanced-lab-preview-frame"
          title={`Sandboxed preview of ${model} App Builder output`}
          sandbox="allow-scripts"
          srcDoc={buildSandboxedPreviewHtml(html)}
        />
      </section>
    </div>
  );
}
