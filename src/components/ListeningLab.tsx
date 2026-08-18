import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Mic, RefreshCw, Square, Upload } from "lucide-react";
import { getScoreTone } from "../lib/format";
import { listeningBlockedReason } from "../lib/wizardCopy";
import { readAdvancedLabResults, writeAdvancedLabResults, type AdvancedLabResult } from "../lib/labResults";
import { LISTENING_REFERENCE, getListeningTestAudio, runAdvancedListeningChallenge } from "../lib/labChallenges";
import {
  DEFAULT_LISTENING_SCRIPT_ID,
  LISTENING_SCRIPTS,
  isScriptLongEnough,
  listeningScriptById,
  referenceFor,
  type ListeningSource,
} from "../lib/listeningScripts";
import { toListeningWav } from "../lib/wavEncoder";
import type { OllamaStatus } from "../types";

/**
 * Decode whatever the browser can read into raw channels.
 *
 * A microphone gives webm/opus and an upload could be anything; both are
 * decoded here and re-encoded to the 16 kHz mono WAV the bundled reference
 * uses, so no model is ever handed a container it might refuse. A refusal
 * would land on that model's scorecard as if it could not hear.
 */
async function decodeAudio(data: ArrayBuffer) {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(data.slice(0));
    return {
      sampleRate: buffer.sampleRate,
      channels: Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
    };
  } finally {
    void ctx.close();
  }
}

type RunState = { phase: 'idle' | 'running' | 'complete' | 'failed'; result: AdvancedLabResult | null; message: string };

export function ListeningLab({
  ollama,
  models,
  gpuNoteForRun,
}: {
  ollama: OllamaStatus;
  models: string[];
  /** Re-checks the GPU as the run starts; returns a sentence, or '' when clear. */
  gpuNoteForRun?: () => Promise<string>;
}) {
  const [model, setModel] = useState('');
  const [source, setSource] = useState<ListeningSource>('sample');
  const [scriptId, setScriptId] = useState(DEFAULT_LISTENING_SCRIPT_ID);
  const [typedReference, setTypedReference] = useState('');
  const [captured, setCaptured] = useState<{ base64: string; label: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [runState, setRunState] = useState<RunState>({ phase: 'idle', result: null, message: '' });
  const [savedResults, setSavedResults] = useState<Record<string, AdvancedLabResult>>(() => readAdvancedLabResults());

  // Which microphone, and which one the user picked.
  //
  // getUserMedia({ audio: true }) takes whatever Windows calls the default,
  // which on a machine with a headset, a webcam and a USB interface is a coin
  // toss the user cannot see or change. Recording "worked" and the input was
  // never named anywhere.
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const activeModel = models.includes(model) ? model : (models[0] ?? '');
  const script = listeningScriptById(scriptId);
  const running = runState.phase === 'running';
  const needsCapture = source !== 'sample';
  const canRun = Boolean(activeModel) && ollama.ready && !running && (!needsCapture || Boolean(captured));
  const blockedReason = listeningBlockedReason({
    hasModel: Boolean(activeModel),
    providerReady: ollama.ready,
    running,
    needsCapture,
    hasCapture: Boolean(captured),
  });

  // A recording left running when the panel closes keeps the microphone light
  // on, which is alarming and entirely our fault.
  useEffect(() => () => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  /**
   * List the microphones.
   *
   * Labels are empty until permission has been granted at least once — that is
   * the browser refusing to let an unprompted page fingerprint the hardware —
   * so this is called again after the first recording starts, when the names
   * become readable.
   */
  const loadInputs = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(devices.filter((d) => d.kind === 'audioinput'));
    } catch {
      // No device access at all: the picker stays hidden and the default is used.
    }
  }, []);

  useEffect(() => {
    if (source === 'record') void (async () => { await loadInputs(); })();
  }, [source, loadInputs]);

  const startRecording = useCallback(async () => {
    setCaptureError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId ? { deviceId: { exact: inputId } } : true,
      });
      // Labels are readable now that permission has been granted, so the picker
      // can stop saying "Microphone 1".
      void loadInputs();
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const base64 = await toListeningWav(await blob.arrayBuffer(), decodeAudio);
          setCaptured({ base64, label: `recording of "${listeningScriptById(scriptId).label}"` });
        } catch {
          setCaptureError('That recording could not be read. Try again, or upload a file instead.');
        }
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setCaptureError('No microphone was available, or permission was declined.');
      setRecording(false);
    }
  }, [inputId, loadInputs, scriptId]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const onUpload = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setCaptureError('');
    try {
      const base64 = await toListeningWav(await file.arrayBuffer(), decodeAudio);
      setCaptured({ base64, label: file.name });
    } catch {
      setCaptureError(`${file.name} could not be decoded. Try a WAV, MP3, or M4A.`);
    }
  }, []);

  const start = useCallback(async () => {
    if (!canRun) return;
    const reference = referenceFor(source, {
      sampleReference: LISTENING_REFERENCE,
      scriptId,
      typedReference,
    });
    const gpuNote = gpuNoteForRun ? await gpuNoteForRun() : '';
    setRunState({ phase: 'running', result: null, message: `Playing the audio to ${activeModel}...${gpuNote}` });

    const audio = source === 'sample' ? await getListeningTestAudio() : captured?.base64 ?? '';
    const result = await runAdvancedListeningChallenge(activeModel, ollama.baseUrl, audio, undefined, reference);

    setRunState({
      phase: result.error ? 'failed' : 'complete',
      result,
      message: result.error
        ? result.error
        : reference === null
          ? `${activeModel} wrote a transcript, but nothing said what the audio contains, so accuracy was not measured.`
          : `${activeModel} scored ${result.score}/100 against the ${source === 'sample' ? 'reference passage' : 'script'}.`,
    });
    if (!result.error && reference !== null) {
      const merged = { ...readAdvancedLabResults(), [`listening:${activeModel}`]: result };
      writeAdvancedLabResults(merged);
      setSavedResults(merged);
    }
  }, [activeModel, canRun, captured, ollama.baseUrl, scriptId, source, typedReference, gpuNoteForRun]);

  const visible = runState.result ?? savedResults[`listening:${activeModel}`] ?? null;
  const typedTooShort = source === 'upload' && typedReference.trim() !== '' && !isScriptLongEnough(typedReference);

  return (
    <article className="advanced-lab-card">
      <div className="advanced-lab-card-head">
        <Mic aria-hidden="true" />
        <div>
          <span>Ground-truth test</span>
          <strong>Listening</strong>
        </div>
        <b className={visible ? `advanced-lab-grade ${getScoreTone(visible.score)}` : 'advanced-lab-grade locked'}>
          {visible ? `${visible.score} · ${visible.grade}` : 'Not run'}
        </b>
      </div>
      <p>
        Plays speech and counts the words the model got wrong. The only test here with a right
        answer — everything else is judged, this one is measured.
      </p>

      <div className="advanced-lab-image-controls">
        <label htmlFor="listening-model">Model</label>
        <select id="listening-model" value={activeModel} onChange={(e) => setModel(e.target.value)} disabled={running}>
          {models.length
            ? models.map((name) => <option key={name} value={name}>{name}</option>)
            : <option value="">No model that can hear is installed</option>}
        </select>
      </div>

      <div className="advanced-lab-image-controls">
        <label htmlFor="listening-source">Audio</label>
        <select
          id="listening-source"
          value={source}
          onChange={(e) => { setSource(e.target.value as ListeningSource); setCaptured(null); setCaptureError(''); }}
          disabled={running || recording}
        >
          <option value="sample">Bundled sample — 42 words</option>
          <option value="record">Read a script aloud</option>
          <option value="upload">Upload a file</option>
        </select>
      </div>

      {source === 'record' && (
        <>
          <div className="advanced-lab-image-controls">
            <label htmlFor="listening-script">Script</label>
            <select id="listening-script" value={scriptId} onChange={(e) => { setScriptId(e.target.value); setCaptured(null); }} disabled={running || recording}>
              {LISTENING_SCRIPTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {inputs.length > 1 && (
            <div className="advanced-lab-image-controls">
              <label htmlFor="listening-input">Microphone</label>
              <select
                id="listening-input"
                value={inputId}
                onChange={(e) => { setInputId(e.target.value); setCaptured(null); }}
                disabled={running || recording}
              >
                <option value="">System default</option>
                {inputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="listening-script-card">
            <span>Read this aloud, clearly</span>
            <strong>{script.text}</strong>
          </div>
          <p className="advanced-lab-message">
            Read the script above word for word. The score compares what the model
            heard against this text, so improvising will mark the model down for
            hearing you correctly.
          </p>
          <div className="advanced-lab-actions">
            {recording ? (
              <button type="button" className="primary-button compact" onClick={stopRecording}>
                <Square aria-hidden="true" /> Stop recording
              </button>
            ) : (
              <button type="button" className="primary-button compact" onClick={() => void startRecording()} disabled={running}>
                <Mic aria-hidden="true" /> {captured ? 'Record again' : 'Start recording'}
              </button>
            )}
          </div>
        </>
      )}

      {source === 'upload' && (
        <>
          <label className="advanced-lab-actions">
            <span className="mini-button outline">
              <Upload aria-hidden="true" /> Choose an audio file
            </span>
            <input
              type="file"
              accept="audio/*"
              className="visually-hidden-input"
              onChange={(e) => void onUpload(e.target.files?.[0])}
              disabled={running}
            />
          </label>
          <label className="settings-field">
            <span>What does it say? (optional)</span>
            <textarea
              rows={3}
              value={typedReference}
              onChange={(e) => setTypedReference(e.target.value)}
              placeholder="Type the words spoken, and the transcript gets scored against them."
              disabled={running}
            />
          </label>
          <div className="advanced-lab-warning">
            <AlertTriangle aria-hidden="true" />
            <span>
              {typedTooShort
                ? 'That is quite short. Under about thirty words, one ordinary slip reads as failure — the score will be harsher than the model deserves.'
                : 'Without this, the transcript is shown but no accuracy score is given. Scoring it against a guess would measure agreement between two models, not hearing.'}
            </span>
          </div>
        </>
      )}

      {captured && <p className="advanced-lab-message complete">Ready: {captured.label}</p>}
      {captureError && <p className="advanced-lab-message failed">{captureError}</p>}

      <div className="advanced-lab-actions">
        <button type="button" className="primary-button compact" onClick={() => void start()} disabled={!canRun}>
          <RefreshCw className={running ? 'spin' : ''} aria-hidden="true" />
          {running ? 'Listening' : 'Run Listening Test'}
        </button>
        {/* A disabled primary button that says nothing is a dead end: this one
            was gated on four separate conditions and named none of them. */}
        {blockedReason && <span className="advanced-lab-blocked">{blockedReason}</span>}
      </div>

      {runState.message && <p className={`advanced-lab-message ${runState.phase}`}>{runState.message}</p>}
      {visible && !visible.error && (
        <div className="advanced-lab-result">
          <div className="listening-transcript">
            <span>What the model heard</span>
            <strong>{visible.response || '(nothing)'}</strong>
          </div>
          <div className="advanced-lab-checks">
            {visible.checks.map((check) => (
              <div key={check.label} className={check.passed ? 'passed' : 'failed'} title={check.detail}>
                <span>{check.passed ? 'Pass' : 'Miss'}</span>
                <strong>{check.label}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
