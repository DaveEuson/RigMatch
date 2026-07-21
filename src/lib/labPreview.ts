/**
 * Helpers for the Advanced Lab's sandboxed App Builder preview.
 *
 * Safety model: model-generated code is never executed automatically. The
 * user sees the raw output first and must explicitly click Play It; the code
 * then runs inside an <iframe sandbox="allow-scripts"> with a CSP injected
 * that blocks network requests, external resources, and navigation. The
 * frame is a unique opaque origin, so it cannot touch RigMatch state,
 * localStorage, or the desktop bridge.
 */

const PREVIEW_CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; font-src data:;">';

/**
 * Pull a runnable single-file HTML document out of a model response.
 * Prefers fenced code blocks, then a bare <!doctype>/<html> document.
 * Returns null when the answer has no scriptable HTML worth previewing.
 */
export function extractHtmlDocument(response: string): string | null {
  const text = response.trim();
  if (!text) return null;

  const candidates: string[] = [];
  const fencePattern = /```(?:html)?\s*\n?([\s\S]*?)```/gi;
  for (let match = fencePattern.exec(text); match; match = fencePattern.exec(text)) {
    candidates.push(match[1].trim());
  }

  const docStart = text.search(/<!doctype\s+html|<html[\s>]/i);
  if (docStart !== -1) {
    const docEnd = text.toLowerCase().lastIndexOf('</html>');
    candidates.push(docEnd > docStart ? text.slice(docStart, docEnd + '</html>'.length) : text.slice(docStart));
  }

  candidates.push(text);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const looksLikeMarkup = /<!doctype\s+html|<html[\s>]|<body[\s>]|<canvas[\s>]/i.test(candidate);
    const hasScript = /<script[\s>]/i.test(candidate);
    if (looksLikeMarkup && hasScript) return candidate;
  }

  return null;
}

/** Wrap extracted HTML so the preview CSP is the first thing the frame parses. */
export function buildSandboxedPreviewHtml(html: string): string {
  // Always wrap the model's markup in our own shell so the CSP is the first meta
  // the parser sees, inside a real <head>. Locating the model's own <head> was
  // unsafe: a "<head" appearing in a comment or string literal shifted the CSP
  // into an inert position, silently dropping the network-block guarantee. The
  // model's document (even a full <!doctype> one) becomes body content — its
  // scripts still run, but its markup can't place a CSP ahead of ours, and
  // multiple CSP metas only ever combine more restrictively.
  return `<!doctype html><html><head><meta charset="utf-8">${PREVIEW_CSP_META}</head><body>${html}</body></html>`;
}
