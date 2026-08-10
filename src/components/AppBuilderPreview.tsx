import { useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useSandboxedPreview } from '../lib/useSandboxedPreview';
import { useDialog } from '../lib/useDialog';

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
  const previewUrl = useSandboxedPreview(html);
  // Focus lands on the dialog's own controls, not the iframe. Auto-focusing the
  // frame put the keyboard inside untrusted, sandboxed content whose key events
  // never reach this component — so Escape was dead exactly where the effect had
  // just placed the user, with no way back out except the mouse. The frame is
  // still reachable, just not the landing spot: useDialog keeps it in the Tab
  // cycle and pulls focus back into the dialog when it leaves the frame.
  const dialogRef = useDialog<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
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
          Click the app, or Tab to it, so it can hear your keyboard. Tab again to come back.
        </p>
        {previewUrl ? (
          <iframe
            ref={iframeRef}
            className="advanced-lab-preview-frame"
            title={`Sandboxed preview of ${model} App Builder output`}
            sandbox="allow-scripts"
            src={previewUrl}
          />
        ) : (
          <p className="advanced-lab-preview-note">Preparing the sandbox…</p>
        )}
      </section>
    </div>
  );
}
