// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Credentials the person typed in, kept encrypted by the operating system
 * (Electron's safeStorage: the Keychain on a Mac, DPAPI on Windows, the
 * desktop's secret service on Linux) in one file in the app's own folder.
 *
 * The OpenRouter key used to sit in the page's local storage as plain text,
 * where anything that can read the profile folder can read it. A bug check on
 * a Mac found it there.
 *
 * Only the names below can be stored. Where the system has no encryption to
 * offer (a Linux desktop with no keyring), every call answers
 * `available: false` and the page keeps the key where it was.
 *
 * No value is ever logged: the IPC handlers in main.cjs do not go through
 * handleLogged, which writes a failed call's arguments to the log.
 */
const fs = require('node:fs');
const path = require('node:path');

const SECRET_NAMES = new Set(['openrouter-key']);
const MAX_SECRET_LENGTH = 4096;

/**
 * file: where the encrypted values live. safeStorage: Electron's, or a stand-in
 * with the same isEncryptionAvailable / encryptString / decryptString.
 */
function createSecretStore({ file, safeStorage }) {
  const readAll = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const writeAll = (values) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(values), { mode: 0o600 });
    fs.renameSync(temp, file);
  };
  const available = () => {
    try { return Boolean(safeStorage?.isEncryptionAvailable()); } catch { return false; }
  };
  const checkName = (name) => {
    if (!SECRET_NAMES.has(name)) throw new Error(`No secret is kept under "${String(name).slice(0, 40)}".`);
  };

  return {
    /** { available, value }: value is '' when nothing is stored, or it no longer decrypts. */
    read(name) {
      checkName(name);
      if (!available()) return { available: false, value: '' };
      const stored = readAll()[name];
      if (typeof stored !== 'string' || !stored) return { available: true, value: '' };
      try {
        return { available: true, value: safeStorage.decryptString(Buffer.from(stored, 'base64')) };
      } catch {
        // Encrypted under another user or another machine's key: unreadable here.
        return { available: true, value: '' };
      }
    },
    /** Stores the value, or removes it when it is empty. */
    write(name, value) {
      checkName(name);
      if (!available()) return { available: false };
      const text = typeof value === 'string' ? value.trim().slice(0, MAX_SECRET_LENGTH) : '';
      const values = readAll();
      if (text) values[name] = safeStorage.encryptString(text).toString('base64');
      else delete values[name];
      writeAll(values);
      return { available: true };
    },
  };
}

module.exports = { SECRET_NAMES, createSecretStore };
