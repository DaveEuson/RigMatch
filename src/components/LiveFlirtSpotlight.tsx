// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import robotSpeedDateShow from '../assets/robot-speed-date-show.webp';
import type { BenchmarkQuestion } from '../benchmarkSuite';
import type { HostBanterPhase } from '../lib/hostBanter';
import { getDateReaction, getHostBanter } from '../lib/hostBanter';
import { getShortModelName } from '../lib/modelCatalog';
import type { ModelRow, NetworkHost, RunProgress, SystemProfile } from '../types';
import { AvatarBust, MachineAvatar } from './Avatars';
import { MetricTile } from './CommonChrome';
import { Maximize2, MessageSquare, Minimize2, Plus, X } from 'lucide-react';
import { useState } from 'react';

export function LiveFlirtSpotlight({
  progress,
  host,
  system,
  rows,
  questionPlan,
  onStop,
}: {
  progress: RunProgress;
  host?: NetworkHost;
  system?: SystemProfile;
  rows?: ModelRow[];
  questionPlan?: BenchmarkQuestion[];
  onStop?: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  // Live rig meters while the model works the hardware. Unified-memory Macs
  // report one shared pool instead of separate VRAM.
  const liveMeters = system ? (() => {
    const gpu = system.gpu;
    const memPct = system.memory.totalGb ? (system.memory.usedGb / system.memory.totalGb) * 100 : 0;
    const meters: Array<{ label: string; value: string; level: number }> = [
      { label: 'CPU', value: `${system.cpu.loadPercent}%`, level: system.cpu.loadPercent },
      { label: 'RAM', value: `${system.memory.usedGb} / ${system.memory.totalGb} GB`, level: memPct },
    ];
    if (gpu.isUnifiedMemory) {
      meters.push({ label: 'Memory', value: `${system.memory.totalGb} GB unified`, level: memPct });
    } else if (gpu.vramGb) {
      meters.push({
        label: 'VRAM',
        value: gpu.vramUsedGb != null ? `${gpu.vramUsedGb} / ${gpu.vramGb} GB` : `${gpu.vramGb} GB`,
        level: gpu.vramUsedGb != null ? (gpu.vramUsedGb / gpu.vramGb) * 100 : 0,
      });
    }
    if (gpu.gpuLoadPercent != null) {
      meters.push({ label: 'GPU', value: `${gpu.gpuLoadPercent}%`, level: gpu.gpuLoadPercent });
    }
    return meters;
  })() : [];
  const stageRows = rows?.length
    ? rows
    : [{ displayName: progress.currentModel } as ModelRow];
  const activeModel = progress.currentModel;
  const modelCounter = progress.total > 1
    ? `model ${progress.completed + 1}/${progress.total}`
    : null;
  const questionCounter = progress.questionTotal
    ? `q ${(progress.questionIndex ?? 0) + 1}/${progress.questionTotal}`
    : null;
  const counterLabel = [modelCounter, questionCounter].filter(Boolean).join(' · ');
  const currentQuestionIndex = Math.max(0, progress.questionIndex ?? 0);
  const currentQuestion = questionPlan?.[currentQuestionIndex];
  const currentLabel = progress.questionLabel ?? currentQuestion?.label ?? 'Question';
  const currentPrompt = progress.questionPrompt ?? currentQuestion?.prompt ?? 'The host is about to ask the next prompt.';
  const runLabel = progress.questionRunTotal && progress.questionRunTotal > 1
    ? `Run ${Math.min(progress.questionRunTotal, (progress.questionRunIndex ?? 0) + 1)}/${progress.questionRunTotal}`
    : null;
  const phaseLabel = progress.questionPhase === 'prompt-run'
    ? (runLabel ?? 'Timing run')
    : progress.questionPhase === 'prompt-token'
      ? 'Answering live'
      : progress.questionPhase === 'prompt-start'
        ? 'Host is asking'
        : progress.questionPhase === 'prompt-complete'
          ? 'Answer scored'
          : progress.questionPhase === 'failed'
            ? 'Needs attention'
            : 'Warming up';
  const activeShortName = getShortModelName(activeModel);
  // Which stool the model on stage is sitting in — so the host can address it by
  // number, like "Contestant #1".
  const activeContestantNumber = stageRows.findIndex((row) => row?.displayName === activeModel) + 1;
  const banterPhase: HostBanterPhase = progress.questionPhase === 'prompt-start'
    ? 'asking'
    : progress.questionPhase === 'prompt-complete'
      ? 'scored'
      : (progress.questionPhase === 'prompt-run' || progress.questionPhase === 'prompt-token')
        ? 'answering'
        : 'warming';
  const banterCtx = {
    contestantNumber: activeContestantNumber,
    model: activeShortName,
    questionLabel: currentLabel,
    phase: banterPhase,
    index: currentQuestionIndex,
  };
  // Two voices on stage: the HOST asks the questions (question card), while the
  // computer is TONIGHT'S DATE — the one the contestants are trying to win.
  const hostLine = getHostBanter(banterCtx);
  const dateLine = getDateReaction(banterCtx);
  const totalQuestions = progress.questionTotal ?? questionPlan?.length ?? 0;
  const completedQuestions = progress.completedQuestions ?? 0;
  const stageSlots = Array.from({ length: Math.max(5, stageRows.length) }, (_item, index) => stageRows[index]);

  if (minimized) {
    const miniStatus = [counterLabel, phaseLabel].filter(Boolean).join(' · ');
    return (
      <aside className="live-mini-bar" role="status" aria-live="polite" aria-label="Speed Dating running (minimized)">
        <span className="live-mini-dot" aria-hidden="true" />
        <div className="live-mini-info">
          <strong>{activeShortName} on stage</strong>
          <em>{miniStatus || 'Warming up'}</em>
          <div className="live-mini-track" aria-hidden="true"><i style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <span className="live-mini-percent">{progress.percent}%</span>
        <button type="button" className="mini-button" onClick={() => setMinimized(false)} title="Expand the live show">
          <Maximize2 aria-hidden="true" />
          Expand
        </button>
        {onStop && (
          <button type="button" className="live-show-stop compact" onClick={onStop} title="Stop after the current question finishes">
            <X aria-hidden="true" />
            Stop
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="live-flirt-spotlight live-game-show" aria-label="Live Speed Dating game show stage">
      <div className="live-show-bg" style={{ backgroundImage: `url(${robotSpeedDateShow})` }} aria-hidden="true" />
      <div className="live-show-marquee" aria-hidden="true">
        {Array.from({ length: 22 }).map((_item, index) => <i key={index} />)}
      </div>

      <div className="live-show-shell">
        <header className="live-show-header">
          <div>
            <span>{progress.mode === 'speed-date' ? 'Live Speed Dating' : 'Live Model Test'}</span>
            <strong>{activeShortName} is on stage</strong>
          </div>
          <div className="live-show-counters">
            {counterLabel && <em>{counterLabel}</em>}
            <b>{phaseLabel}</b>
          </div>
          {liveMeters.length > 0 && (
            <div className="live-show-meters" aria-label="Live system load">
              {liveMeters.map((meter) => (
                <MetricTile key={meter.label} label={meter.label} value={meter.value} level={meter.level} />
              ))}
            </div>
          )}
          <div className="live-show-header-actions">
            <button type="button" className="live-show-minimize" onClick={() => setMinimized(true)} title="Minimize — keep the run going and use the rest of RigMatch">
              <Minimize2 aria-hidden="true" />
              Minimize
            </button>
            {onStop && (
              <button type="button" className="live-show-stop" onClick={onStop} title="Stop after the current question finishes">
                <X aria-hidden="true" />
                Stop
              </button>
            )}
          </div>
        </header>

        <section className="live-show-main">
          <div className="live-show-host-card">
            <div className="live-show-host-spotlight" aria-hidden="true" />
            <MachineAvatar host={host} size="medium" />
            <div>
              <span>Tonight's date</span>
              <strong>{host?.hostname ?? 'This computer'}</strong>
              <p>{dateLine}</p>
            </div>
            <div className="live-show-mic" aria-hidden="true">
              <MessageSquare />
            </div>
          </div>

          <div className="live-show-stage">
            <div className="live-show-sign" aria-hidden="true">
              <span>The</span>
              <strong>Dating Game</strong>
              <em>for local AI</em>
            </div>
            <ol className="live-show-contestants" aria-label="Contestants sitting on stage">
              {stageSlots.map((row, index) => {
                const displayName = row?.displayName ?? '';
                const isActive = displayName === activeModel;
                const score = displayName ? progress.questionScores?.[displayName] : undefined;
                return (
                  <li
                    key={displayName || `empty-live-stool-${index}`}
                    className={[isActive ? 'active' : '', row ? 'filled' : 'empty'].filter(Boolean).join(' ')}
                  >
                    <span className="live-show-seat-number">{index + 1}</span>
                    <div className="live-show-stool">
                      {row ? <AvatarBust model={displayName} size="large" /> : <Plus aria-hidden="true" />}
                    </div>
                    <div className="live-show-nameplate">
                      <span>{row ? `Contestant ${index + 1}` : 'Open stool'}</span>
                      <strong>{row ? getShortModelName(displayName) : 'Waiting'}</strong>
                      <em>{isActive ? 'Answering now' : score ? `${score} scored` : row ? 'On deck' : 'Empty'}</em>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="live-show-question-card" aria-label="Current question">
          <div>
            <span>
              {activeContestantNumber > 0 ? `Host → Contestant #${activeContestantNumber}` : 'Host'}
              {totalQuestions ? ` · Question ${Math.min(totalQuestions, currentQuestionIndex + 1)} of ${totalQuestions}` : ''}
            </span>
            <strong>{hostLine}</strong>
            <p>{currentPrompt}</p>
          </div>
          <div className="live-show-progress">
            <span>{progress.percent}%</span>
            <div aria-label={`${progress.percent}% complete`}>
              <i style={{ width: `${progress.percent}%` }} />
            </div>
            <em>{completedQuestions} answered · {progress.message}</em>
            {/* No affiliate CTA here. This overlay is the surface actively
                measuring the user's hardware; selling them a GPU beside the
                progress bar makes a low fit score look like a sales pitch.
                Hardware upgrade links live in Your Rig only. */}
          </div>
        </section>
      </div>
    </aside>
  );
}
