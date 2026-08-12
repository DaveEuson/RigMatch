import { useCallback, useState } from "react";
import { AlertTriangle, Check, FolderOpen, RefreshCw } from "lucide-react";
import {
  COMFY_DEFAULT_BASE_URL,
  normalizeComfyUrl,
  readComfySettings,
  writeComfySettings,
} from "../lib/comfySettings";
import { getComfyStatus, pickAndVerifyComfyFolder } from "../lib/comfyTransport";

/**
 * Where ComfyUI is, and whether RigMatch may disturb it.
 *
 * The address is editable rather than the default being moved. ComfyUI lives
 * on 8188 and RigMatch connects to one the user started, so a different
 * default would not dodge a collision — it would just fail to find anything.
 * What a second instance needs is somewhere to point RigMatch at, which is
 * this field.
 */
export function ComfySettings() {
  const initial = readComfySettings();
  const [url, setUrl] = useState(initial.baseUrl);
  const [dedicated, setDedicated] = useState(initial.dedicated);
  const [probe, setProbe] = useState<{ phase: 'idle' | 'checking' | 'ok' | 'bad'; message: string }>({
    phase: 'idle', message: '',
  });
  const [folder, setFolder] = useState(initial.folder);
  const [folderNote, setFolderNote] = useState<{ tone: 'ok' | 'bad' | 'warn'; message: string } | null>(null);

  const chooseFolder = useCallback(async () => {
    const result = await pickAndVerifyComfyFolder();
    if (result.canceled) return;
    if (!result.ok || !result.root) {
      // Not saved. A folder that failed verification is worse than none: it
      // would silently take a multi-gigabyte download somewhere unused.
      setFolderNote({ tone: 'bad', message: result.reason ?? 'That folder could not be verified.' });
      return;
    }
    setFolder(result.root);
    writeComfySettings({ folder: result.root });
    setFolderNote(result.warning
      ? { tone: 'warn', message: result.warning }
      : { tone: 'ok', message: 'Verified against the ComfyUI that is running. Downloads will land here.' });
  }, []);

  const normalized = normalizeComfyUrl(url);
  const urlValid = normalized !== null;

  const save = useCallback((next: { baseUrl?: string; dedicated?: boolean }) => {
    writeComfySettings(next);
    if (next.dedicated !== undefined) setDedicated(next.dedicated);
  }, []);

  const testConnection = useCallback(async () => {
    if (!normalized) return;
    setProbe({ phase: 'checking', message: '' });
    writeComfySettings({ baseUrl: normalized });
    const status = await getComfyStatus(normalized);
    if (!status.reachable) {
      setProbe({ phase: 'bad', message: 'Nothing answered there. Is ComfyUI running?' });
      return;
    }
    const models = status.checkpoints.length;
    const encoders = status.textEncoders?.length ?? 0;
    setProbe({
      phase: 'ok',
      message: `Connected — ${models} checkpoint${models === 1 ? '' : 's'}, ${encoders} text encoder${encoders === 1 ? '' : 's'}.`,
    });
  }, [normalized]);

  return (
    <>
      <div className="utility-stat">
        <span>ComfyUI address</span>
        <strong>Image and video generation run here, not on Ollama</strong>
        <em>
          ComfyUI is a separate free program RigMatch does not install or bundle. Leave this on the
          default unless you run it somewhere else.
        </em>
      </div>

      <label className="settings-field">
        <span>Address</span>
        <input
          type="text"
          value={url}
          spellCheck={false}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => { if (normalized) save({ baseUrl: normalized }); }}
          placeholder={COMFY_DEFAULT_BASE_URL}
          aria-label="ComfyUI address"
          aria-invalid={!urlValid}
        />
      </label>
      {!urlValid && url.trim() !== '' && (
        <div className="advanced-lab-warning">
          <AlertTriangle aria-hidden="true" />
          <span>
            That has to be a local address — localhost, 127.0.0.1, or just a port number. ComfyUI has
            no password, so RigMatch will not point a benchmark at another machine.
          </span>
        </div>
      )}

      <div className="advanced-lab-actions">
        <button type="button" className="mini-button outline" onClick={() => void testConnection()} disabled={!urlValid || probe.phase === 'checking'}>
          <RefreshCw className={probe.phase === 'checking' ? 'spin' : ''} aria-hidden="true" />
          Test connection
        </button>
        {probe.phase === 'ok' && (
          <span className="settings-probe ok"><Check aria-hidden="true" /> {probe.message}</span>
        )}
        {probe.phase === 'bad' && (
          <span className="settings-probe bad"><AlertTriangle aria-hidden="true" /> {probe.message}</span>
        )}
      </div>

      <div className="utility-stat">
        <span>Models folder</span>
        <strong>{folder || 'Not set — image and video models cannot be downloaded yet'}</strong>
        <em>
          ComfyUI reports its version and its graphics card but never its own location, so this
          cannot be found automatically. RigMatch checks the folder you pick against the models
          the running ComfyUI lists, and only accepts it if they match.
        </em>
      </div>
      <div className="advanced-lab-actions">
        <button type="button" className="mini-button outline" onClick={() => void chooseFolder()}>
          <FolderOpen aria-hidden="true" />
          {folder ? 'Change folder' : 'Choose ComfyUI folder'}
        </button>
        {folderNote && (
          <span className={`settings-probe ${folderNote.tone === 'ok' ? 'ok' : 'bad'}`}>
            {folderNote.tone === 'ok' ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
            {folderNote.message}
          </span>
        )}
      </div>

      <label className="advanced-lab-consent">
        <input
          type="checkbox"
          checked={dedicated}
          onChange={(event) => save({ dedicated: event.target.checked })}
        />
        <span>
          This ComfyUI is only for RigMatch. Lets a run unload models first, which makes the memory
          reading exact. Leave it off if you use ComfyUI for your own work — otherwise every
          benchmark would evict whatever you had loaded.
        </span>
      </label>
    </>
  );
}
