// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import type { UpdateCheckResponse } from '../types';

// A gentle, non-blocking "a new version is out" nudge. It sits in the corner,
// never covers the app, and is fully dismissible — encouragement, not a gate.
// "What's new" reveals the release notes so the user can decide for themselves.
export function UpdateAvailableToast({ update, onGetUpdate, onDismiss }: {
  update: UpdateCheckResponse;
  onGetUpdate: () => void;
  onDismiss: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);

  return (
    <div className="update-toast" role="status" aria-live="polite" aria-label={`RigMatch ${update.latestVersion ?? ''} is available`}>
      <div className="update-toast-head">
        <Sparkles aria-hidden="true" />
        <div>
          <span>Update available</span>
          <strong>RigMatch {update.latestVersion}</strong>
        </div>
        <button type="button" className="update-toast-close" onClick={onDismiss} aria-label="Dismiss update notice">
          <X aria-hidden="true" />
        </button>
      </div>

      <p className="update-toast-body">
        You're on {update.currentVersion}. Upgrade whenever you like — nothing changes until you choose to.
      </p>

      {update.releaseNotes && (
        <div className="update-toast-notes-wrap">
          <button
            type="button"
            className="update-toast-notes-toggle"
            onClick={() => setShowNotes((value) => !value)}
            aria-expanded={showNotes}
          >
            {showNotes ? "Hide what's new" : "What's new"}
          </button>
          {showNotes && <div className="update-toast-notes">{update.releaseNotes}</div>}
        </div>
      )}

      <div className="update-toast-actions">
        <button type="button" className="pick-this-one-btn" onClick={onGetUpdate}>
          <Download aria-hidden="true" />
          Get the update
        </button>
        <button type="button" className="mini-button outline" onClick={onDismiss}>
          Later
        </button>
      </div>
    </div>
  );
}
