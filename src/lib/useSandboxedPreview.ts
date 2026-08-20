// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useState } from 'react';
import { agentArcadeApi } from '../api';
import { buildSandboxedPreviewHtml } from './labPreview.ts';

/**
 * Publish model-generated HTML and get back a URL to frame it from.
 *
 * The preview cannot be an `<iframe srcdoc>`. srcdoc is a local scheme, and
 * local schemes inherit the embedding page's CSP — RigMatch's own
 * `script-src 'self'`. That silently blocked every inline script in every
 * generated app, so "Play It" showed markup that could never run. The main
 * process serves the document from a scheme that does not inherit, with the
 * same network-blocking CSP applied as a real header.
 *
 * Returns null while publishing, and in the browser preview, which has no main
 * process to serve from.
 */
export function useSandboxedPreview(html: string | null | undefined): string | null {
  // Keyed by the document it was published for, so switching between demos can
  // never briefly frame the previous app's URL, and so nothing has to be
  // cleared synchronously inside the effect.
  const [published, setPublished] = useState<{ html: string; url: string } | null>(null);

  useEffect(() => {
    if (!html) return;
    let cancelled = false;
    void agentArcadeApi
      .publishAppPreview(buildSandboxedPreviewHtml(html))
      .then((url) => { if (!cancelled && url) setPublished({ html, url }); })
      .catch(() => { /* falls through to the "preparing" state */ });
    return () => { cancelled = true; };
  }, [html]);

  return published && published.html === html ? published.url : null;
}
