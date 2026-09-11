// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Film, Play, RefreshCw } from 'lucide-react';
import type { ComfyStatus, PullProgressUpdate, SystemProfile } from '../types';
import { getScoreTone } from '../lib/format';
import { fetchComfyOutput } from '../lib/comfyTransport';
import { readComfySettings } from '../lib/comfySettings';
import { formatBytesGb, generationModelById } from '../lib/generationCatalog';
import { readHuggingFaceToken } from '../lib/huggingFaceToken';
import { CUSTOM_IMAGE_PROMPT_ID } from '../lib/imageGenScoring';
import { readAdvancedLabResults, type AdvancedLabResult } from '../lib/labResults';
import { readVideoCalibration } from '../lib/videoCalibrationStore';
import { CALIBRATION_MODEL, formatVideoDuration, formatVideoEstimate, type VideoEstimate } from '../lib/videoFit';
import {
  againstEstimate,
  allLineupEntries,
  comfyListing,
  estimateLineup,
  lineupCardFacts,
  measuredSecondsFor,
  rankLineup,
  videoMachineFrom,
  type LineupCardFacts,
  type LineupRecordEntry,
  type VideoLineupEntry,
} from '../lib/videoLineup';
import { startVideoLineup, stopVideoLineup, subscribeLineupSession } from '../lib/videoLineupSession';
import { useVideoLineupSession } from '../hooks/useVideoLineupSession';
import { PromptPicker } from './PromptPicker';

type Card = { entry: VideoLineupEntry; facts: LineupCardFacts };

/** Ready to race, then downloadable, then waiting on a token, then too big here. */
function cardGroup({ facts }: Card): number {
  if (facts.runnable) return 0;
  if (facts.fit.status === 'fits' || facts.fit.status === 'offload') return 1;
  if (facts.fit.status === 'needs-token') return 2;
  return 3;
}

const DOWNLOADING: ReadonlySet<string> = new Set(['queued', 'started', 'pulling', 'paused']);

const AGAINST_ESTIMATE = {
  inside: 'inside its estimate',
  faster: 'faster than estimated',
  slower: 'slower than estimated',
} as const;

const BASIS_NOTE: Record<VideoEstimate['basis'], string> = {
  measured: 'Timed on this GPU.',
  calibrated: 'Scaled by this GPU’s own LTX-Video 2B time.',
  rough: 'The reference RTX 4070’s time, until this machine has been timed.',
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function describeOutput(entry: VideoLineupEntry): string {
  const { width, height, seconds, sound } = entry.output;
  return `${width}×${height} · ${Math.round(seconds)} s${sound ? ' · sound' : ''}`;
}

/** Its own clock, so the list does not re-render every second of a three-hour render. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{formatVideoDuration(Math.max(0, (now - since) / 1000))}</>;
}

/**
 * The Video Lab: several video models, one prompt, raced on this computer.
 *
 * Every card answers what someone asks before spending an evening on a 20 GB
 * download — will it run here, how long will a clip take, how much is left to
 * fetch — from this machine's own numbers, before anything is downloaded. Then
 * the picked models render the same prompt and seed one at a time, fastest
 * first, and the result is a leaderboard by time with the clips side by side.
 */
export function VideoLineupLab({
  comfyStatus,
  comfyChecking,
  onCheckComfy,
  system,
  judgeModel,
  promptId,
  onPromptIdChange,
  customPrompt,
  onCustomPromptChange,
  otherRunActive,
  ollamaBaseUrl,
  gpuNoteForRun,
  onDownloadModel,
  onStopDownload,
  pullProgressByModel,
}: {
  comfyStatus: ComfyStatus | null;
  comfyChecking: boolean;
  onCheckComfy: () => void;
  system: SystemProfile;
  /** The vision model that checks each clip's middle frame; empty when none is installed. */
  judgeModel: string;
  promptId: string;
  onPromptIdChange: (id: string) => void;
  customPrompt: string;
  onCustomPromptChange: (text: string) => void;
  /** The Image test is rendering, and the GPU is taken. */
  otherRunActive: boolean;
  ollamaBaseUrl: string;
  gpuNoteForRun: () => Promise<string>;
  onDownloadModel?: (generationId: string) => void;
  onStopDownload?: () => void;
  pullProgressByModel?: Record<string, PullProgressUpdate>;
}) {
  const session = useVideoLineupSession();
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmUnload, setConfirmUnload] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Clips are fetched only when asked for: a few seconds of footage is
  // megabytes, and the scored artifact is the frame.
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [loadingClips, setLoadingClips] = useState<ReadonlySet<string>>(() => new Set());
  const clipUrls = useRef(new Map<string, string>());
  // Read again whenever the lineup moves: a finished model replaces its own
  // estimate with its time, and LTX-Video 2B recalibrates every other.
  const [saved, setSaved] = useState(() => readAdvancedLabResults());
  const [calibration, setCalibration] = useState(() => readVideoCalibration());
  useEffect(() => subscribeLineupSession(() => {
    setSaved(readAdvancedLabResults());
    setCalibration(readVideoCalibration());
  }), []);
  // Object URLs outlive the component unless revoked, and each pins a clip in memory.
  useEffect(() => {
    const urls = clipUrls.current;
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, []);

  const machine = useMemo(() => videoMachineFrom(system), [system]);
  const machineKnown = system.memory.totalGb > 0;
  const reachable = Boolean(comfyStatus?.reachable);
  // Only a running ComfyUI can say what is on disk. Without it every model
  // reads as missing, and the sizes are whole downloads.
  const installed = useMemo(() => comfyListing(reachable ? comfyStatus : null), [comfyStatus, reachable]);
  const hasToken = Boolean(readHuggingFaceToken());

  const cards = useMemo<Card[]>(() => allLineupEntries(installed)
    .map((entry) => ({
      entry,
      facts: lineupCardFacts(entry, {
        machine,
        installed,
        hasToken,
        calibration,
        measuredSeconds: measuredSecondsFor(entry, saved, machine.gpuName),
      }),
    }))
    .sort((a, b) => cardGroup(a) - cardGroup(b) || a.facts.estimate.seconds - b.facts.estimate.seconds),
  [installed, machine, hasToken, calibration, saved]);

  const picked = cards.filter((card) => picks.has(card.entry.key) && card.facts.runnable);
  const total = estimateLineup(picked.map((card) => card.entry), machine, { calibration, saved });
  const readyCount = cards.filter((card) => card.facts.runnable).length;
  const tooBigCount = cards.filter((card) => cardGroup(card) === 3).length;
  const visible = showAll ? cards : cards.filter((card) => cardGroup(card) < 3);
  const rough = machineKnown && cards.some((card) => card.facts.estimate.basis === 'rough');
  const calibrator = cards.find((card) => card.entry.key === CALIBRATION_MODEL);
  const promptReady = promptId !== CUSTOM_IMAGE_PROMPT_ID || customPrompt.trim().length > 0;
  const canStart = reachable && machineKnown && picked.length > 0 && promptReady && !session.running && !otherRunActive;

  const togglePick = (key: string) => setPicks((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const begin = async () => {
    setConfirmUnload(false);
    const note = await gpuNoteForRun();
    await startVideoLineup({
      entries: picked.map((card) => card.entry),
      expected: Object.fromEntries(picked.map(({ entry, facts }) => [
        entry.key,
        { low: facts.estimate.low, high: facts.estimate.high, basis: facts.estimate.basis },
      ])),
      promptId,
      customPrompt,
      judgeModel: judgeModel || undefined,
      ollamaBaseUrl,
      // Every lineup unloads: a model that starts warm looks faster than it
      // is. The user agreed in Settings, or in the warning below.
      unloadBetweenRuns: true,
      gpuName: machine.gpuName,
      note,
    });
  };

  // Settings has already asked, for a ComfyUI that is RigMatch's alone.
  const requestStart = () => {
    if (readComfySettings().dedicated) void begin();
    else setConfirmUnload(true);
  };

  const downloadProgress = (entry: VideoLineupEntry) => {
    const label = entry.found ? undefined : generationModelById(entry.key)?.label;
    return label ? pullProgressByModel?.[label] : undefined;
  };

  const renderAction = (entry: VideoLineupEntry, facts: LineupCardFacts) => {
    if (facts.installed) {
      return (
        <span className="video-lineup-ondisk">
          <Check aria-hidden="true" />
          {entry.found ? 'In ComfyUI' : 'On disk'}
        </span>
      );
    }
    const progress = downloadProgress(entry);
    if (progress && DOWNLOADING.has(progress.phase)) {
      return (
        <span className="video-lineup-downloading" title={progress.status}>
          <span>{progress.percent != null ? `${Math.round(progress.percent)}%` : 'Starting'}</span>
          {onStopDownload && (
            <button type="button" className="mini-button outline" onClick={onStopDownload}>Stop</button>
          )}
        </span>
      );
    }
    if (progress?.phase === 'complete') {
      return <span className="video-lineup-ondisk" title="ComfyUI only looks for new files when it starts.">Restart ComfyUI</span>;
    }
    if (facts.fit.status === 'too-big') return <span className="video-lineup-na">—</span>;
    if (facts.fit.status === 'needs-token') {
      return <span className="video-lineup-na" title={facts.fit.detail}>Token needed: Settings</span>;
    }
    return (
      <>
        <button
          type="button"
          className="mini-button"
          onClick={() => onDownloadModel?.(entry.key)}
          disabled={!onDownloadModel || !reachable}
          title={reachable
            ? `Downloads ${formatBytesGb(facts.downloadBytes)} into ComfyUI: only the files it does not have yet.`
            : 'Start ComfyUI first, so RigMatch can see which files you already have.'}
        >
          <Download aria-hidden="true" />
          {formatBytesGb(facts.downloadBytes)}
        </button>
        {progress?.phase === 'failed' && progress.error && (
          <em className="video-lineup-error">{progress.error}</em>
        )}
      </>
    );
  };

  const record = session.record;
  const ranked = record ? rankLineup(record.entries) : [];
  const finished = new Set(record?.entries.map((item) => item.key));
  const unfinished = record ? record.planned.filter((item) => !finished.has(item.key) && item.key !== session.current?.key) : [];
  const currentCard = session.current ? cards.find((card) => card.entry.key === session.current?.key) : undefined;
  const clips = record
    ? ranked
      .filter((item) => !item.error)
      .map((item) => ({ item, result: saved[`video:${item.key}`] }))
      .filter((clip): clip is { item: LineupRecordEntry; result: AdvancedLabResult } => clip.result?.lineupId === record.id)
    : [];
  const clipKey = (key: string) => `${record?.id ?? ''}:${key}`;

  const loadClip = async (key: string, ref: { filename: string; subfolder: string; type: string }) => {
    setLoadingClips((current) => new Set(current).add(key));
    try {
      const dataUrl = await fetchComfyOutput(ref);
      // A blob costs one copy and then behaves like a file; a multi-megabyte
      // data: URL sitting in the DOM does not.
      const url = URL.createObjectURL(await (await fetch(dataUrl)).blob());
      const previous = clipUrls.current.get(key);
      if (previous) URL.revokeObjectURL(previous);
      clipUrls.current.set(key, url);
      setPlayback((current) => ({ ...current, [key]: url }));
    } catch {
      // Cleared from ComfyUI's output folder since the run. The frame and the
      // time are still here, so this stays quiet.
    } finally {
      setLoadingClips((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const playAll = () => {
    for (const { item, result } of clips) {
      const key = clipKey(item.key);
      if (result.videoRef && !playback[key]) void loadClip(key, result.videoRef);
    }
  };

  return (
    <article className="advanced-lab-card video-lineup" aria-label="Video lineup">
      <div className="advanced-lab-card-head">
        <Film aria-hidden="true" />
        <div>
          <span>Extra beta creative test</span>
          <strong>Video Lineup</strong>
        </div>
        <b className="advanced-lab-grade locked">
          {machineKnown && reachable ? `${readyCount} ready to race` : 'Extra beta'}
        </b>
      </div>
      <p>
        Pick video models, give them all the same prompt and seed, and see which renders fastest on
        this computer — then watch the clips side by side. Whether each one fits, how long a clip
        takes, and how much is left to download are worked out for this machine before anything is
        downloaded.
      </p>

      {!reachable && (
        <div className="utility-empty compact">
          <strong>{comfyChecking ? 'Looking for ComfyUI...' : 'ComfyUI is not running'}</strong>
          <span>
            Fit and time below come from this machine and need nothing running. Seeing which models
            you already have, downloading them, and racing them all need ComfyUI — start it and it
            will be found on port 8188.
          </span>
          <button type="button" className="mini-button outline" onClick={onCheckComfy} disabled={comfyChecking}>
            <RefreshCw className={comfyChecking ? 'spin' : ''} aria-hidden="true" />
            Check again
          </button>
        </div>
      )}

      <div className="video-lineup-setup">
        <PromptPicker
          idPrefix="video-lineup"
          value={promptId}
          onChange={onPromptIdChange}
          customPrompt={customPrompt}
          onCustomPromptChange={onCustomPromptChange}
          disabled={session.running}
        />
        <div className="advanced-lab-safeguards">
          <span>same prompt and seed</span>
          <span>fastest first</span>
          <span>{judgeModel ? `middle frame checked by ${judgeModel}` : 'unjudged: no vision model'}</span>
          <span title="Temporal consistency and flicker have no right answer and no local model judges them reliably.">
            motion not scored
          </span>
        </div>
      </div>

      {rough && calibrator && (
        <div className="video-lineup-note">
          <span>
            Times are rough until RigMatch has timed this machine. LTX-Video 2B takes{' '}
            {formatVideoDuration(calibrator.entry.sizing.refSeconds)} on the reference RTX 4070; race it
            once and every estimate here is scaled to this GPU.
          </span>
          {calibrator.facts.runnable && !picks.has(CALIBRATION_MODEL) && (
            <button type="button" className="mini-button outline" onClick={() => togglePick(CALIBRATION_MODEL)} disabled={session.running}>
              Add LTX-Video 2B
            </button>
          )}
        </div>
      )}

      <div className="video-lineup-list" role="list" aria-label="Video models">
        <div className="video-lineup-row video-lineup-row-head" aria-hidden="true">
          <span>Model</span>
          <span>On this machine</span>
          <span>One clip</span>
          <span>Makes</span>
          <span>Download</span>
        </div>
        {visible.map(({ entry, facts }) => {
          const checked = picks.has(entry.key) && facts.runnable;
          return (
            <div
              key={entry.key}
              role="listitem"
              className={`video-lineup-row${checked ? ' picked' : ''}${facts.runnable ? '' : ' unavailable'}`}
            >
              <label
                className="video-lineup-name"
                title={reachable ? facts.blocked ?? undefined : 'Start ComfyUI, and RigMatch can see which of these you already have.'}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!facts.runnable || session.running}
                  onChange={() => togglePick(entry.key)}
                />
                <span>
                  <strong>{entry.name}</strong>
                  <em>{entry.found ? 'Found in ComfyUI' : entry.publisher}{entry.spec ? ` · ${entry.spec.released}` : ''}</em>
                </span>
              </label>
              <span
                className={`video-lineup-fit ${machineKnown ? facts.fit.status : 'unknown'}`}
                title={machineKnown ? facts.fit.detail : undefined}
              >
                {machineKnown ? facts.fit.label : 'Reading this machine…'}
              </span>
              <span className="video-lineup-time" title={machineKnown ? BASIS_NOTE[facts.estimate.basis] : undefined}>
                {machineKnown ? formatVideoEstimate(facts.estimate, { roughNote: false }) : '—'}
              </span>
              <span className="video-lineup-output">{describeOutput(entry)}</span>
              <span className="video-lineup-action">{renderAction(entry, facts)}</span>
            </div>
          );
        })}
      </div>
      {tooBigCount > 0 && (
        <button type="button" className="mini-button outline video-lineup-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Hide the models too big for this machine' : `Show ${tooBigCount} too big for this machine`}
        </button>
      )}

      {confirmUnload && (
        <div className="video-lineup-confirm" role="alertdialog" aria-label="Unload ComfyUI between models?">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>This unloads ComfyUI before every model.</strong>
            <span>
              Each model then starts cold, the way its estimate was measured, so the times compare
              fairly. Anything you have loaded in ComfyUI yourself is unloaded too.
            </span>
            <div className="advanced-lab-actions">
              <button type="button" className="primary-button compact" onClick={() => void begin()}>
                Unload and start
              </button>
              <button type="button" className="mini-button outline" onClick={() => setConfirmUnload(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="video-lineup-start">
        <span>
          {picked.length > 0
            ? `${picked.length} picked · ${lowerFirst(formatVideoEstimate(total, { roughNote: false }))} in total`
            : readyCount > 0 ? 'Tick the models to race.' : 'Download a model that fits, and it can race here.'}
        </span>
        {session.running ? (
          <button type="button" className="mini-button outline" onClick={stopVideoLineup}>
            Stop
          </button>
        ) : (
          <button type="button" className="primary-button compact" onClick={requestStart} disabled={!canStart || confirmUnload}>
            <Play aria-hidden="true" />
            {picked.length > 1 ? `Race ${picked.length} models` : 'Render it'}
          </button>
        )}
      </div>

      {session.message && (
        <p className={`advanced-lab-message ${session.failed ? 'failed' : session.running ? 'running' : 'complete'}`}>
          {session.message}
        </p>
      )}

      {record && (
        <section className="video-lineup-results" aria-label={session.running ? 'This lineup so far' : 'Last lineup'}>
          <div className="video-lineup-results-head">
            <strong>{session.running ? 'This lineup so far' : 'Last lineup'}</strong>
            <span>
              “{record.prompt}” · seed {record.seed} ·{' '}
              {record.unloaded ? 'every model started cold' : 'models were not unloaded between runs'}
              {record.gpu ? ` · ${record.gpu}` : ''}
            </span>
          </div>
          <ol className="video-lineup-board">
            {ranked.map((item, index) => {
              if (item.error) {
                return (
                  <li key={item.key} className="failed">
                    <b>—</b>
                    <span>
                      <strong>{item.name}</strong>
                      <em>{item.error}</em>
                    </span>
                    <span className="video-lineup-board-time">failed</span>
                    <span />
                  </li>
                );
              }
              const verdict = againstEstimate(item);
              return (
                <li key={item.key}>
                  <b>{index + 1}</b>
                  <span>
                    <strong>{item.name}</strong>
                    <em>
                      {`${item.realtimeCost.toFixed(1)}× realtime`}
                      {item.judged ? '' : ' · unjudged'}
                      {verdict ? ` · ${AGAINST_ESTIMATE[verdict]}` : ''}
                    </em>
                  </span>
                  <span className="video-lineup-board-time">{formatVideoDuration(item.elapsedMs / 1000)}</span>
                  <b className={`advanced-lab-grade ${getScoreTone(item.score)}`}>{item.score} · {item.grade}</b>
                </li>
              );
            })}
            {session.current && (
              <li className="rendering">
                <b><RefreshCw className="spin" aria-hidden="true" /></b>
                <span>
                  <strong>{session.current.name}</strong>
                  <em>
                    {currentCard ? `rendering — ${lowerFirst(formatVideoEstimate(currentCard.facts.estimate, { roughNote: false }))}` : 'rendering'}
                  </em>
                </span>
                <span className="video-lineup-board-time"><Elapsed since={session.current.startedAt} /></span>
                <span />
              </li>
            )}
            {unfinished.map((item) => (
              <li key={item.key} className="waiting">
                <b>·</b>
                <span>
                  <strong>{item.name}</strong>
                  <em>{session.running ? 'waiting its turn' : 'not run'}</em>
                </span>
                <span />
                <span />
              </li>
            ))}
          </ol>

          {clips.length > 0 && (
            <div className="video-lineup-clips">
              {clips.map(({ item, result }) => {
                const key = clipKey(item.key);
                const ref = result.videoRef;
                return (
                  <figure key={key} className="video-lineup-clip">
                    {playback[key] ? (
                      <video src={playback[key]} controls autoPlay loop muted />
                    ) : result.imageDataUrl ? (
                      <img src={result.imageDataUrl} alt={`Middle frame of the clip ${item.name} rendered`} />
                    ) : (
                      <div className="video-lineup-clip-empty">No frame came back</div>
                    )}
                    <figcaption>
                      <strong>{item.name}</strong>
                      <span>{formatVideoDuration(item.elapsedMs / 1000)}</span>
                      {!playback[key] && ref && (
                        <button
                          type="button"
                          className="mini-button outline"
                          onClick={() => void loadClip(key, ref)}
                          disabled={loadingClips.has(key)}
                        >
                          <Play aria-hidden="true" />
                          {loadingClips.has(key) ? 'Loading' : 'Play'}
                        </button>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
          {clips.length > 1 && clips.some(({ item, result }) => result.videoRef && !playback[clipKey(item.key)]) && (
            <div className="advanced-lab-actions">
              <button type="button" className="mini-button" onClick={playAll}>
                <Play aria-hidden="true" />
                Play them all side by side
              </button>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
