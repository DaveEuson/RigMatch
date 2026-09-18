// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { tickerTips } from '../lib/glossary';
import type { RigPick } from '../lib/modelCatalog';
import { isVisiblePullProgress } from '../lib/modelCatalog';
import { renderLabel, type RenderActivity } from '../lib/renderActivity';
import { formatMatchScore } from '../lib/scoring';
import type { ModelRow, PullProgressUpdate } from '../types';
import { DownloadTickerDock } from './DownloadTickerDock';
import { Elapsed } from './Elapsed';
import { MessageSquare, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Moved out of App.tsx with Ticker, its only consumer. */
const LEARNING_TIPS: { term: string; tip: string }[] = tickerTips();

export function Ticker({
  activity,
  isDesktopRuntime,
  topPick,
  queuedRows,
  pullProgressByModel,
  isPulling,
  pullingModel,
  isPullCancelRequested,
  isPullPauseRequested,
  isPullPaused,
  onResumeQueue,
  onPauseQueue,
  onCancelQueue,
  onOpenDownloads,
  render = null,
  onOpenRender,
  onOpenChat,
}: {
  activity: string;
  isDesktopRuntime: boolean;
  topPick?: RigPick | null;
  queuedRows: ModelRow[];
  pullProgressByModel: Record<string, PullProgressUpdate>;
  isPulling: boolean;
  pullingModel: string | null;
  isPullCancelRequested: boolean;
  isPullPauseRequested: boolean;
  isPullPaused: boolean;
  onResumeQueue: () => void;
  onPauseQueue: () => void;
  onCancelQueue: () => void;
  onOpenDownloads: () => void;
  /**
   * What ComfyUI is rendering, wherever it was started. It takes the tip's
   * place until it ends, so a test whose panel was closed is still in view.
   */
  render?: RenderActivity | null;
  /** Where the render is shown in full: its model's row, or the comparison. */
  onOpenRender?: (render: RenderActivity) => void;
  onOpenChat: () => void;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  const [showActivity, setShowActivity] = useState(false);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A render that begins while an announcement is up takes the bar at once:
  // the announcement is about what came before it. A clip asked for from Chat
  // seconds after its last sound finished stayed hidden behind "made audio".
  const rendering = Boolean(render);
  const [wasRendering, setWasRendering] = useState(rendering);
  if (rendering !== wasRendering) {
    setWasRendering(rendering);
    if (rendering) setShowActivity(false);
  }

  useEffect(() => {
    if (!activity) return;
    const showTimer = setTimeout(() => setShowActivity(true), 0);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => setShowActivity(false), 5000);
    return () => {
      clearTimeout(showTimer);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, [activity]);

  useEffect(() => {
    if (showActivity) return;
    const id = setInterval(() => setTipIndex((i) => (i + 1) % LEARNING_TIPS.length), 8000);
    return () => clearInterval(id);
  }, [showActivity]);

  const tip = LEARNING_TIPS[tipIndex];
  const pickScore = topPick?.score?.total ?? 0;
  const pickGrade = topPick?.score?.grade;
  const pickName = topPick?.row.displayName ?? null;
  // One decimal, same as every other Match score in the app.
  const pickScoreLabel = topPick?.score ? formatMatchScore(topPick.score) : null;
  const showDownloadDock = Boolean(
    queuedRows.length > 0 ||
    pullingModel ||
    Object.values(pullProgressByModel).some((progress) => isVisiblePullProgress(progress)),
  );
  const showRender = Boolean(render) && !showActivity;

  return (
    <footer className={showDownloadDock ? 'ticker has-download-dock' : 'ticker'}>
      <button type="button" className="ticker-chat-link" onClick={onOpenChat} title="Open RigMatch Chat">
        <MessageSquare size={13} aria-hidden="true" />
        <span>Chat</span>
      </button>
      <div className={showRender ? 'ticker-learn rendering' : 'ticker-learn'}>
        {showActivity ? (
          <>
            <span className="ticker-label ticker-label-activity">Activity</span>
            <strong className="ticker-activity-text">{activity}</strong>
          </>
        ) : render ? (
          <>
            <span className="ticker-label ticker-label-render">{renderLabel(render)}</span>
            <button
              type="button"
              className="ticker-render-open"
              onClick={() => onOpenRender?.(render)}
              title={render.solo ? `Show ${render.model ?? 'the test'} on the Models screen` : 'Show the comparison'}
            >
              <strong>
                {render.model ?? 'ComfyUI'}
                {render.step ? ` · ${render.step.index + 1} of ${render.step.total}` : ''}
              </strong>
              {render.startedAt !== null && (
                <span className="ticker-render-clock"><Elapsed since={render.startedAt} /></span>
              )}
              <span className="ticker-tip">{render.message}</span>
            </button>
            <button
              type="button"
              className="ticker-render-stop"
              onClick={render.stop}
              title="Stop it: ComfyUI cancels what it is rendering"
            >
              <X aria-hidden="true" />
              Stop
            </button>
          </>
        ) : (
          <>
            <span className="ticker-label ticker-label-learn">Learn</span>
            <strong className="ticker-term">{tip.term}</strong>
            <span className="ticker-tip">{tip.tip}</span>
          </>
        )}
      </div>
      {showDownloadDock && (
        <DownloadTickerDock
          queuedRows={queuedRows}
          pullProgressByModel={pullProgressByModel}
          isPulling={isPulling}
          pullingModel={pullingModel}
          isPullCancelRequested={isPullCancelRequested}
          isPullPauseRequested={isPullPauseRequested}
          isPullPaused={isPullPaused}
          onResumeQueue={onResumeQueue}
          onPauseQueue={onPauseQueue}
          onCancelQueue={onCancelQueue}
          onOpenDownloads={onOpenDownloads}
        />
      )}
      <div className="ticker-right">
        <span>{isDesktopRuntime ? 'Desktop bridge online' : 'Preview mode'}</span>
        <strong>
          {/* A top pick can exist before it has ever been scored, in which case
              there is no grade — this used to print the literal word
              "undefined" next to "0 Match". Say what is true instead. */}
          {pickName
            ? pickGrade && pickScoreLabel
              ? `${pickName} · ${pickScoreLabel} Match · ${pickGrade}`
              : `${pickName} · not tested yet`
            : 'No model tested yet'}
        </strong>
      </div>
      <div className="queue-meter" aria-label="Top pick score">
        {Array.from({ length: 12 }).map((_, index) => (
          <i key={index} className={pickName && index < Math.round(pickScore / 10) ? 'lit' : ''} />
        ))}
      </div>
    </footer>
  );
}
