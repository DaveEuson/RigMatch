// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * A data: URL as a Blob, decoded in place.
 *
 * The obvious way — `fetch(dataUrl).then((r) => r.blob())` — is a network
 * request as far as the Content-Security-Policy is concerned, and connect-src
 * does not list data:. So in the desktop app it was refused, the video clips
 * the Lab offered to play never loaded, and the failure was swallowed because
 * the only failure anyone expected was a clip deleted from ComfyUI's folder.
 * Decoding the base64 here needs no permission at all.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('Not a data URL.');
  const header = dataUrl.slice(5, comma);
  const type = header.split(';')[0] || 'application/octet-stream';
  const body = dataUrl.slice(comma + 1);

  if (!/;base64$/i.test(header)) {
    return new Blob([decodeURIComponent(body)], { type });
  }
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
