// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Where the OpenRouter key is kept: encrypted by the system through the main
 * process (electron/secretStore.cjs) wherever it can be, and in the page's
 * local storage only where it cannot (no bridge, or a Linux desktop with no
 * keyring). It was always local storage, as plain text.
 *
 * A key already in local storage is moved on first load: written to the
 * encrypted store, then removed from local storage once the store took it.
 */
import { OPENROUTER_KEY_STORAGE_KEY } from './appConfig.ts';
import type { SecretBridge } from '../types.ts';

const NAME = 'openrouter-key';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type OpenRouterKeyPlace = 'secure' | 'local';

const readLocal = (storage: Storage | null) => {
  try { return storage?.getItem(OPENROUTER_KEY_STORAGE_KEY) ?? ''; } catch { return ''; }
};
const writeLocal = (storage: Storage | null, value: string) => {
  try {
    if (value) storage?.setItem(OPENROUTER_KEY_STORAGE_KEY, value);
    else storage?.removeItem(OPENROUTER_KEY_STORAGE_KEY);
  } catch { /* storage unavailable: the key is not remembered */ }
};
const removeLocal = (storage: Storage | null) => {
  try { storage?.removeItem(OPENROUTER_KEY_STORAGE_KEY); } catch { /* ignore */ }
};

/** The key, and where it is kept from now on. */
export async function loadOpenRouterKey(bridge: SecretBridge | undefined, storage: Storage | null): Promise<{ value: string; place: OpenRouterKeyPlace }> {
  const legacy = readLocal(storage);
  if (!bridge) return { value: legacy, place: 'local' };
  const stored = await bridge.get(NAME).catch(() => null);
  if (!stored?.available) return { value: legacy, place: 'local' };
  if (stored.value) {
    if (legacy) removeLocal(storage);
    return { value: stored.value, place: 'secure' };
  }
  if (!legacy) return { value: '', place: 'secure' };
  const moved = await bridge.set(NAME, legacy).catch(() => null);
  if (!moved?.available) return { value: legacy, place: 'local' };
  removeLocal(storage);
  return { value: legacy, place: 'secure' };
}

/** Saves the key (an empty one removes it) where loadOpenRouterKey said it is kept. */
export async function saveOpenRouterKey(bridge: SecretBridge | undefined, storage: Storage | null, place: OpenRouterKeyPlace, value: string): Promise<OpenRouterKeyPlace> {
  if (place === 'secure' && bridge) {
    const saved = await bridge.set(NAME, value).catch(() => null);
    if (saved?.available) {
      removeLocal(storage);
      return 'secure';
    }
  }
  writeLocal(storage, value);
  return 'local';
}
