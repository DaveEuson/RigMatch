// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Where ComfyUI is, and whether RigMatch may disturb it.
 *
 * Both settings exist because of the same fact: ComfyUI is a program the user
 * already runs for their own work, not something RigMatch installs or owns.
 *
 * The port is configurable rather than defaulted differently. Moving the
 * default off 8188 would not avoid a collision — RigMatch connects to a
 * ComfyUI someone else started, so a different default just fails to find it
 * and reports "not running" while ComfyUI sits there answering.
 */

export const COMFY_URL_STORAGE_KEY = 'rigmatch:comfy-url:v1';
export const COMFY_DEDICATED_STORAGE_KEY = 'rigmatch:comfy-dedicated:v1';
/** The verified models root, needed to write a download where ComfyUI reads it. */
export const COMFY_FOLDER_STORAGE_KEY = 'rigmatch:comfy-folder:v1';

export const COMFY_DEFAULT_BASE_URL = 'http://127.0.0.1:8188';

export type ComfySettings = {
  baseUrl: string;
  /**
   * Where ComfyUI keeps its models, once verified against what the running
   * server lists. Empty until someone picks it: ComfyUI reports its version
   * and its devices but never its own path, so this cannot be discovered.
   */
  folder: string;
  /**
   * True when this ComfyUI exists for RigMatch. Only then may a run unload
   * models to get a clean VRAM reading; on a shared instance that would evict
   * whatever the user had loaded, every run.
   */
  dedicated: boolean;
};

/**
 * Accept what someone would actually type.
 *
 * "localhost:8188" and "127.0.0.1:8188" are what a person writes; neither
 * parses as a URL without a scheme. A bare port is accepted too, since the
 * only thing most people change is the port.
 *
 * Returns null for anything not local. ComfyUI has no authentication, and a
 * benchmark that will happily point at a machine across the network is a way
 * to make someone's server render pictures for a stranger.
 */
export function normalizeComfyUrl(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // A bare port number.
  if (/^\d{2,5}$/.test(raw)) {
    const port = Number(raw);
    return port > 0 && port <= 65535 ? `http://127.0.0.1:${port}` : null;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '[::1]') {
    return null;
  }
  // Rebuilt rather than echoed, so a trailing slash or stray path cannot turn
  // `${base}/prompt` into something else.
  return `${parsed.protocol}//${parsed.host}`;
}

export function readComfySettings(): ComfySettings {
  if (typeof window === 'undefined') return { baseUrl: COMFY_DEFAULT_BASE_URL, dedicated: false, folder: '' };
  let baseUrl = COMFY_DEFAULT_BASE_URL;
  let dedicated = false;
  let folder = '';
  try {
    baseUrl = normalizeComfyUrl(window.localStorage.getItem(COMFY_URL_STORAGE_KEY) ?? '')
      ?? COMFY_DEFAULT_BASE_URL;
    dedicated = window.localStorage.getItem(COMFY_DEDICATED_STORAGE_KEY) === 'true';
    folder = window.localStorage.getItem(COMFY_FOLDER_STORAGE_KEY) ?? '';
  } catch {
    // Storage disabled. The defaults are the safe ones: the usual port, and
    // not permitted to unload anyone's models.
  }
  return { baseUrl, dedicated, folder };
}

export function writeComfySettings(settings: Partial<ComfySettings>): void {
  if (typeof window === 'undefined') return;
  try {
    if (settings.baseUrl !== undefined) {
      const normalized = normalizeComfyUrl(settings.baseUrl);
      if (normalized) window.localStorage.setItem(COMFY_URL_STORAGE_KEY, normalized);
    }
    if (settings.dedicated !== undefined) {
      window.localStorage.setItem(COMFY_DEDICATED_STORAGE_KEY, settings.dedicated ? 'true' : 'false');
    }
    // Only ever written after verifyComfyFolder accepted it, so a stored
    // folder is one the running server was proven to read.
    if (settings.folder !== undefined) {
      window.localStorage.setItem(COMFY_FOLDER_STORAGE_KEY, settings.folder);
    }
  } catch {
    // Nothing to do; the run will use whatever was already in effect.
  }
}
