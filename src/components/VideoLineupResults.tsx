// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { accuracyCounted, balanceLabel, balanceSplit } from '../lib/balance';
import { fetchComfyOutput } from '../lib/comfyTransport';
import { dataUrlToBlob } from '../lib/dataUrl';
import { getErrorMessage, getScoreTone } from '../lib/format';
import type { AdvancedLabResult } from '../lib/labResults';
import { formatVideoDuration } from '../lib/videoFit';
import { againstEstimate, rankLineupByBalance, type LineupRecord, type LineupRecordEntry } from '../lib/videoLineup';
// Its own clock, so the list does not re-render every second of a three-hour render.
import { Elapsed } from './Elapsed';

const AGAINST_ESTIMATE = {
  inside: 'inside its estimate',
  faster: 'faster than estimated',
  slower: 'slower than estimated',
} as const;

/**
 * A lineup's leaderboard and its clips, ranked at the Balance fader.
 *
 * The Video Lab shows it under the race it runs, and the Comparison screen
 * shows it as the Video channel's comparison. One board, so the two screens can
 * never rank the same race differently.
 */
export function VideoLineupResults({
  record,
  saved,
  rankAt,
  running = false,
  current = null,
  unfinished = [],
}: {
  record: LineupRecord;
  /** Every saved Lab result: the clips' frames and file references live there. */
  saved: Record<string, AdvancedLabResult>;
  /** Where the fader stands, already 0 when nothing can judge. */
  rankAt: number;
  running?: boolean;
  /** The model rendering now, with its estimate already worded when there is one. */
  current?: { name: string; startedAt: number; note?: string } | null;
  unfinished?: Array<{ key: string; name: string }>;
}) {
  // Clips are fetched only when asked for: a few seconds of footage is
  // megabytes, and the scored artifact is the frame.
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [loadingClips, setLoadingClips] = useState<ReadonlySet<string>>(() => new Set());
  const [clipErrors, setClipErrors] = useState<Record<string, string>>({});
  const clipUrls = useRef(new Map<string, string>());
  // Object URLs outlive the component unless revoked, and each pins a clip in memory.
  useEffect(() => {
    const urls = clipUrls.current;
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, []);

  // Ranked at the fader, not by time alone: a quick clip of the wrong scene is
  // not what anyone raced for, and a failed check can never win.
  const ranked = rankLineupByBalance(record.entries, rankAt);
  const places = ranked.filter((entry) => entry.standing === 'ranked').map((entry) => entry.item.key);
  // With no clip judged the list is in time order whatever the fader says, and
  // the label must say so rather than claim a weighting that never applied.
  const judgedRace = accuracyCounted(ranked);
  const rankLabel = judgedRace ? balanceLabel(rankAt) : 'speed only';
  const clips = ranked
    .filter(({ item }) => !item.error)
    .map(({ item }) => ({ item, result: saved[`video:${item.key}`] }))
    .filter((clip): clip is { item: LineupRecordEntry; result: AdvancedLabResult } => clip.result?.lineupId === record.id);
  const clipKey = (key: string) => `${record.id}:${key}`;

  const loadClip = async (key: string, ref: { filename: string; subfolder: string; type: string }) => {
    setLoadingClips((currentLoading) => new Set(currentLoading).add(key));
    try {
      const dataUrl = await fetchComfyOutput(ref);
      // A blob costs one copy and then behaves like a file; a multi-megabyte
      // data: URL sitting in the DOM does not. Decoded in place, because
      // fetch() on a data: URL is refused by the app's own security policy.
      const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
      const previous = clipUrls.current.get(key);
      if (previous) URL.revokeObjectURL(previous);
      clipUrls.current.set(key, url);
      setPlayback((currentPlayback) => ({ ...currentPlayback, [key]: url }));
      setClipErrors((currentErrors) => {
        const next = { ...currentErrors };
        delete next[key];
        return next;
      });
    } catch (error) {
      // Usually the clip was cleared from ComfyUI's output folder since the
      // run. Said rather than swallowed: staying quiet here once hid a player
      // that could not play anything at all.
      setClipErrors((currentErrors) => ({ ...currentErrors, [key]: getErrorMessage(error) }));
    } finally {
      setLoadingClips((currentLoading) => {
        const next = new Set(currentLoading);
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
    <section className="video-lineup-results" aria-label={running ? 'This lineup so far' : 'Last lineup'}>
      <div className="video-lineup-results-head">
        <strong>{running ? 'This lineup so far' : 'Last lineup'}</strong>
        <span>
          “{record.prompt}” · seed {record.seed} ·{' '}
          {record.unloaded ? 'every model started cold' : 'models were not unloaded between runs'}
          {record.gpu ? ` · ${record.gpu}` : ''}
        </span>
        <span>
          {judgedRace
            ? `Ranked at ${balanceSplit(rankAt)}`
            : 'Ranked on speed alone: nothing checked these clips, so accuracy cannot count'}
          {typeof record.balance === 'number' && Math.round(record.balance) !== Math.round(rankAt)
            ? `; the race started at ${balanceLabel(record.balance)}`
            : ''}
        </span>
      </div>
      <ol className="video-lineup-board">
        {ranked.map((entry) => {
          const item = entry.item;
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
          const time = formatVideoDuration(item.elapsedMs / 1000);
          const matched = typeof item.adherence === 'number'
            ? `${Math.round(item.adherence * 100)}% of the prompt`
            : 'unjudged';
          if (entry.standing === 'failed') {
            return (
              <li key={item.key} className="short">
                <b>—</b>
                <span>
                  <strong>{item.name}</strong>
                  <em>{matched}: below the pass line, so it cannot win</em>
                </span>
                <span className="video-lineup-board-time">{time}</span>
                <span />
              </li>
            );
          }
          const verdict = againstEstimate(item);
          // Both measures scored against this race — the fastest clip gets full
          // marks for speed — so a fixed scale built for one model family cannot
          // sink another.
          const value = Math.round(entry.value * 100);
          return (
            <li key={item.key} className={entry.standing === 'unjudged' ? 'unjudged' : undefined}>
              <b>{entry.standing === 'ranked' ? places.indexOf(item.key) + 1 : '·'}</b>
              <span>
                <strong>{item.name}</strong>
                <em>
                  {entry.standing === 'unjudged' ? 'unjudged, so it ranks after judged clips' : matched}
                  {` · ${item.realtimeCost.toFixed(1)}× realtime`}
                  {verdict ? ` · ${AGAINST_ESTIMATE[verdict]}` : ''}
                </em>
              </span>
              <span className="video-lineup-board-time">{time}</span>
              <b className={`advanced-lab-grade ${getScoreTone(value)}`}>{value} · {rankLabel}</b>
            </li>
          );
        })}
        {current && (
          <li className="rendering">
            <b><RefreshCw className="spin" aria-hidden="true" /></b>
            <span>
              <strong>{current.name}</strong>
              <em>{current.note ? `rendering — ${current.note}` : 'rendering'}</em>
            </span>
            <span className="video-lineup-board-time"><Elapsed since={current.startedAt} /></span>
            <span />
          </li>
        )}
        {unfinished.map((item) => (
          <li key={item.key} className="waiting">
            <b>·</b>
            <span>
              <strong>{item.name}</strong>
              <em>{running ? 'waiting its turn' : 'not run'}</em>
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
                  {clipErrors[key] && (
                    <em className="video-lineup-error">Could not load this clip. {clipErrors[key]}</em>
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
  );
}
