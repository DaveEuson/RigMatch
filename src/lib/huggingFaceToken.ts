// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The user's own Hugging Face access token, for the one kind of download that
 * needs it: a gated repository, where the model's publisher asks you to accept
 * its terms before the files will download.
 *
 * Stored in this app's local storage, like the OpenRouter key, and sent only to
 * huggingface.co and only for a gated file — the downloader strips it before
 * following a redirect to the CDN. Clear Data removes it with everything else
 * under the rigmatch: prefix, because a credential should not outlive the data
 * someone asked to clear.
 */

export const HUGGING_FACE_TOKEN_STORAGE_KEY = 'rigmatch:hf-token:v1';

export function readHuggingFaceToken(): string {
  try {
    return (localStorage.getItem(HUGGING_FACE_TOKEN_STORAGE_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function writeHuggingFaceToken(token: string): void {
  try {
    const value = token.trim();
    if (value) localStorage.setItem(HUGGING_FACE_TOKEN_STORAGE_KEY, value);
    else localStorage.removeItem(HUGGING_FACE_TOKEN_STORAGE_KEY);
  } catch {
    // Storage unavailable: the token simply is not remembered.
  }
}
