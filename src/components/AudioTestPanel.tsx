// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useState } from 'react';
import { AlertTriangle, AudioLines, Play, X } from 'lucide-react';
import type { ModelRow } from '../types';
import { AUDIO_CLIP_SECONDS, audioModelSpec } from '../lib/audioCatalog';
import { AUDIO_BENCHMARK_PROMPTS, audioRealtimeCost } from '../lib/audioGenScoring';
import { startAudioLineup, stopAudioLineup } from '../lib/audioLineupSession';
import { asksForInstrumental } from '../lib/audioWorkflows';
import { JUDGE_PASS } from '../lib/balance';
import { readComfySettings } from '../lib/comfySettings';
import { ensureComfyRunning } from '../lib/comfyStarter';
import { formatDateTime } from '../lib/format';
import { CUSTOM_IMAGE_PROMPT_ID } from '../lib/imageGenScoring';
import type { AdvancedLabResult } from '../lib/labResults';
import { formatVideoDuration } from '../lib/videoFit';
import { workbenchById } from '../lib/workbench';
import { useAudioLineupSession } from '../hooks/useAudioLineupSession';
import { useImageLineupSession } from '../hooks/useImageLineupSession';
import { useLabResults } from '../hooks/useLabResults';
import { useRowPanel } from '../hooks/useRowPanel';
import { useVideoLineupSession } from '../hooks/useVideoLineupSession';
import { AudioClipPlayer } from './AudioClipPlayer';
import { BalanceFader } from './BalanceFader';
import { ComfyNeeded } from './ComfyNeeded';
import { Elapsed } from './Elapsed';
import type { GenerationTestContext } from './GenerationTestPanel';
import { PromptPicker } from './PromptPicker';

/**
 * Test an audio model where it is listed.
 *
 * The picture and video tests' shape, for sound: a prompt, the question of what
 * matters more, and the result under the row, with the clip one click away. It
 * runs through the same session as a comparison of audio models, so the two
 * can never render at once, and saves where a comparison does, so Scorecards
 * and Comparison see it too.
 *
 * Asking to test a ComfyUI model is asking for ComfyUI, so opening this starts
 * it when it is not running and Settings allows it.
 */
export function AudioTestPanel({
  id,
  row,
  context,
  onClose,
}: {
  id: string;
  row: ModelRow;
  context: GenerationTestContext;
  onClose: () => void;
}) {
  const saved = useLabResults();
  const session = useAudioLineupSession();
  const imageLineup = useImageLineupSession();
  const videoSession = useVideoLineupSession();
  const [promptId, setPromptId] = useState(AUDIO_BENCHMARK_PROMPTS[0].id);
  const [customPrompt, setCustomPrompt] = useState('');
  const [confirmUnload, setConfirmUnload] = useState(false);
  const { ref: panelRef, size, style } = useRowPanel();

  // Start ComfyUI now, so it loads while the prompt is picked. Settings can turn this off.
  useEffect(() => {
    if (!context.comfyReachable) void ensureComfyRunning('test');
  }, [context.comfyReachable]);

  const spec = row.generationId ? audioModelSpec(row.generationId) : undefined;
  // The key a comparison saves under, so a test here and one there are the same record.
  const last: AdvancedLabResult | undefined = spec ? saved[`audio:${spec.key}`] : undefined;
  const balance = context.balances.audio;
  const lockedReason = context.lockedReason('audio');
  // Nothing installed can hear, so the run counts speed alone, and says so.
  const rankAt = lockedReason ? 0 : balance;
  const mine = Boolean(spec && session.solo?.key === spec.key);
  const running = mine && session.running;
  const promptReady = promptId !== CUSTOM_IMAGE_PROMPT_ID || customPrompt.trim().length > 0;
  // Why it cannot run right now, in a sentence. ComfyUI not answering has a box of its own.
  const blocked = !context.comfyReachable
    ? null
    : context.gpuBusy
      ? 'Another test is using the graphics card. This can run when it finishes.'
      : imageLineup.running
        ? 'Pictures are being compared. This can run when they finish.'
        : videoSession.running
          ? 'A video is rendering. This can run when it finishes.'
          : session.running && !mine
            ? 'Audio is being made. This can run when it finishes.'
            : !spec
              ? 'RigMatch has no graph for this model yet.'
              : !row.installed
                ? 'ComfyUI does not list every file this model needs, so there is nothing to run. Download it from its row.'
                : null;
  const canRun = context.comfyReachable && !blocked && promptReady && !running && !confirmUnload;

  const begin = async () => {
    setConfirmUnload(false);
    if (!spec) return;
    await startAudioLineup({
      entries: [{ key: spec.key, name: spec.name }],
      promptId,
      customPrompt,
      listenerModel: context.listenerModel || undefined,
      ollamaBaseUrl: context.ollamaBaseUrl,
      // Started cold, so its time compares with a comparison's. The person
      // agreed in Settings, or in the warning below.
      unloadBetweenRuns: true,
      balance: rankAt,
      solo: true,
    });
  };

  // Settings has already asked, for a ComfyUI that is RigMatch's alone.
  const start = () => {
    if (readComfySettings().dedicated) void begin();
    else setConfirmUnload(true);
  };

  const share = typeof last?.adherence === 'number' ? last.adherence : null;
  const message = mine ? session.message : '';
  const tone = session.failed ? 'failed' : session.running ? 'running' : 'complete';
  const lastSeconds = last?.seconds ?? AUDIO_CLIP_SECONDS;

  return (
    <section
      ref={panelRef}
      id={id}
      className={`generation-test audio ${size}`}
      style={style}
      aria-label={`Test ${row.displayName}`}
      tabIndex={-1}
    >
      <header className="generation-test-head">
        <AudioLines aria-hidden="true" />
        <div>
          <span>Audio test · runs on ComfyUI</span>
          <strong>Test {row.displayName}</strong>
        </div>
        <button
          type="button"
          className="icon-action"
          onClick={onClose}
          aria-label={`Close the test of ${row.displayName}`}
          title="Close"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="generation-test-setup">
        <PromptPicker
          idPrefix={`generation-test-${row.generationId ?? 'model'}`}
          value={promptId}
          onChange={setPromptId}
          customPrompt={customPrompt}
          onCustomPromptChange={setCustomPrompt}
          disabled={running}
          prompts={AUDIO_BENCHMARK_PROMPTS}
          subject="clip"
        />
        <div className="advanced-lab-safeguards">
          <span>{AUDIO_CLIP_SECONDS} s</span>
          {spec && <span>{spec.steps} steps</span>}
          <span title="ComfyUI is unloaded first, so the time compares with a comparison's.">starts cold</span>
          {spec && asksForInstrumental(spec) && (
            <span title="ACE-Step is asked for an instrumental: the prompts describe a sound, and there are no words to sing.">
              instrumental
            </span>
          )}
          <span>{context.listenerModel ? `checked by ${context.listenerModel}` : 'unjudged: nothing installed can hear'}</span>
          {spec && <span>made for {spec.makes}</span>}
        </div>

        {!context.comfyReachable ? (
          <ComfyNeeded runs={`${row.displayName} runs on ComfyUI`} onCheck={context.onCheckComfy} />
        ) : (
          <>
            {confirmUnload && (
              <div className="video-lineup-confirm" role="alertdialog" aria-label="Unload ComfyUI first?">
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>This unloads ComfyUI first.</strong>
                  <span>
                    {row.displayName} then starts cold, so its time compares fairly with a comparison’s.
                    Anything you have loaded in ComfyUI yourself is unloaded too.
                  </span>
                  <div className="advanced-lab-actions">
                    <button type="button" className="primary-button compact" onClick={() => void begin()}>
                      Unload and make it
                    </button>
                    <button type="button" className="mini-button outline" onClick={() => setConfirmUnload(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="generation-test-run">
              {running ? (
                <button type="button" className="mini-button outline" onClick={stopAudioLineup}>
                  Stop
                </button>
              ) : (
                <button type="button" className="primary-button compact" onClick={start} disabled={!canRun}>
                  <Play aria-hidden="true" />
                  Make it
                </button>
              )}
              <span>
                {running && session.current
                  ? <>Making the clip, <Elapsed since={session.current.startedAt} /> so far.</>
                  : blocked ?? ''}
              </span>
            </div>
          </>
        )}

        {message && <p className={`advanced-lab-message ${tone}`} role="status">{message}</p>}

        <button type="button" className="generation-test-lab-link" onClick={() => context.onOpenComparison('audio')}>
          Compare it with other audio models
        </button>
      </div>

      <BalanceFader
        value={balance}
        onChange={(value) => context.onBalanceChange('audio', value)}
        accuracyMeans={workbenchById('audio').accuracyMeans}
        lockedReason={lockedReason}
        disabled={running}
      />

      <div className="generation-test-result">
        {last ? (
          <>
            <span className="generation-test-label">Latest result</span>
            <figure className="generation-test-picture">
              {last.audioRef ? (
                <AudioClipPlayer audioRef={last.audioRef} label={`Play the clip ${row.displayName} made`} />
              ) : (
                <div className="generation-test-empty">No clip came back</div>
              )}
              <figcaption>
                <strong>{formatVideoDuration(last.elapsedMs / 1000)}</strong>
                <span>{audioRealtimeCost(last.elapsedMs, lastSeconds).toFixed(1)}× realtime</span>
                <span className={share === null ? 'unjudged' : share >= JUDGE_PASS ? 'passed' : 'short'}>
                  {share === null
                    ? 'unjudged'
                    : `${Math.round(share * 100)}% of the prompt heard${share < JUDGE_PASS ? ', below the pass line' : ''}`}
                </span>
              </figcaption>
            </figure>
            <p className="generation-test-meta">
              “{last.response}” · {formatDateTime(last.completedAt)}
            </p>
            {last.checks.length > 0 && (
              <div className="advanced-lab-checks">
                {last.checks.map((check) => (
                  <div key={check.label} className={check.passed ? 'passed' : 'failed'} title={check.detail}>
                    <span>{check.passed ? 'Pass' : 'Miss'}</span>
                    <strong>{check.label}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="generation-test-placeholder">
            <AudioLines aria-hidden="true" />
            <span>The clip appears here, ready to play, with how much of the prompt was heard in it.</span>
          </div>
        )}
      </div>
    </section>
  );
}
