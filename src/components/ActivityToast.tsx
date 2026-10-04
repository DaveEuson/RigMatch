// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useState } from 'react';

/** Long enough to read a sentence, short enough not to cover anything for long. */
export const TOAST_MS = 5000;

/**
 * What the app just did, said once, then out of the way.
 *
 * The ticker carried this as one line at the bottom of Advanced Mode, and
 * Simple Mode never saw it. Now both get a toast. The live region is always
 * in the page, so a new message is read out rather than appearing silently.
 */
export function ActivityToast({ message }: { message: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [seen, setSeen] = useState(message);
  if (message !== seen) {
    setSeen(message);
    setShown(message || null);
  }
  useEffect(() => {
    if (!shown) return undefined;
    const timer = setTimeout(() => setShown(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <div className="activity-toast-region" role="status" aria-live="polite">
      {shown && (
        <div className="activity-toast">
          <span>{shown}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setShown(null)}>×</button>
        </div>
      )}
    </div>
  );
}
