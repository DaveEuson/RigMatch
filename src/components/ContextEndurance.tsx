// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import {
  ENDURANCE_ON_CARD_MIN,
  ENDURANCE_SPEED_KEPT_MIN,
  ENDURANCE_STAGES,
  contextLabel,
  describeBaseline,
  describeEnduranceTime,
  estimateEnduranceSeconds,
  type EnduranceProgress,
  type EnduranceStage,
} from '../lib/contextEndurance';
import { formatDateTime, formatGb, formatThroughputValue } from '../lib/format';
import { formatLocale } from '../lib/formatLocale';
import { rigScoreSession as session, useRigScoreSession } from '../lib/rigScoreLive';
import type { OllamaModel } from '../types';
import './ContextEndurance.css';

/** An Ollama cloud model runs on Ollama's servers, so there is no card of this PC to check. */
const CLOUD_TAG = /[:-]cloud$/i;

const tpsText = (value: number | null) => {
  const rounded = value === null ? null : formatThroughputValue(value);
  return rounded === null ? '--' : `${Number(rounded).toLocaleString(formatLocale())} tok/s`;
};

function progressText(progress: EnduranceProgress | null): string {
  if (!progress || progress.phase === 'checking') return 'Checking Ollama…';
  if (progress.phase === 'calibrating') return 'Loading the model and measuring how many tokens a line costs on it…';
  if (progress.phase === 'unloading') return 'Unloading the model…';
  const stage = ENDURANCE_STAGES.find((entry) => entry.id === progress.stage);
  return `${stage ? `${stage.label}, ${contextLabel(stage.numCtx)} of context` : 'A stage'} (${progress.index} of ${progress.of})…`;
}

/** A bar for a share of something, 0 to 1. The numbers beside it say the same, so the bar is for the eye only. */
function Bar({ share, flagged }: { share: number; flagged: boolean }) {
  return (
    <span className={`endurance-bar${flagged ? ' is-flagged' : ''}`} aria-hidden="true">
      <i style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%` }} />
    </span>
  );
}

function StageRow({ stage, base }: { stage: EnduranceStage; base: EnduranceStage }) {
  const ctx = contextLabel(stage.numCtx);
  const lead = (
    <td data-label="Size">
      <strong>{stage.label}</strong>
      <small>{ctx} of context</small>
    </td>
  );
  if (stage.status === 'failed') {
    return (
      <tr>
        {lead}
        <td className="endurance-failed" colSpan={5}>{stage.outOfMemory ? 'Ran out of memory at this size.' : 'Ollama stopped with an error at this size.'}</td>
      </tr>
    );
  }
  const kept = base.writingTps && stage.writingTps && stage !== base ? stage.writingTps / base.writingTps : null;
  return (
    <tr>
      {lead}
      <td data-label="Prompt">
        <span className="figure">{stage.promptTokens.toLocaleString(formatLocale())} tokens</span>
        <small>Read at {tpsText(stage.readingTps)}</small>
        {!stage.sizeOk && <small>Not the size meant: left out of the verdict.</small>}
      </td>
      <td data-label="Writing">
        <span className="figure">{tpsText(stage.writingTps)}</span>
        {stage.writingTps !== null && base.writingTps ? <Bar share={stage.writingTps / base.writingTps} flagged={kept !== null && kept < ENDURANCE_SPEED_KEPT_MIN} /> : null}
        <small>{[stage.feels, kept !== null ? `${Math.round(kept * 100)}% of its ${contextLabel(base.numCtx)} speed` : null].filter(Boolean).join(' · ')}</small>
      </td>
      <td data-label="On the graphics card">
        {stage.gpuShare === null ? <span className="rigscore-dim">--</span> : (
          <>
            <span className="figure">{Math.round(stage.gpuShare * 100)}%</span>
            <Bar share={stage.gpuShare} flagged={stage.gpuShare < ENDURANCE_ON_CARD_MIN} />
          </>
        )}
      </td>
      <td data-label="Passkey"><span className="figure">{stage.passkeyKept ? 'Kept' : 'Lost'}</span></td>
      <td data-label="Loads in"><span className="figure">{stage.loadSeconds > 0 ? `${stage.loadSeconds.toFixed(1)} s` : '--'}</span></td>
    </tr>
  );
}

/**
 * Context endurance, on the Speed score screen: where does one installed model
 * slow down or lose its place as the context grows, on this card. Every other
 * test here runs at a short context. The state lives in the app's one session
 * (lib/rigScoreSession.ts), so a check goes on when someone looks at another
 * screen, and the card counts as busy while it runs.
 */
export function ContextEndurance({ models, ready, busy }: {
  models: OllamaModel[];
  /** Ollama answers. */
  ready: boolean;
  /** A show or test is running: the graphics card is taken. */
  busy: boolean;
}) {
  const state = useRigScoreSession();
  const local = models.filter((entry) => entry.provider !== 'lm-studio' && !CLOUD_TAG.test(entry.name));
  const [picked, setPicked] = useState('');
  const withResult = local.find((entry) => state.enduranceResults.some((result) => result.model === entry.name));
  const model = local.find((entry) => entry.name === picked) ?? withResult ?? local[0];
  const result = state.enduranceResults.find((entry) => entry.model === model?.name);
  const running = state.endurance;
  const message = model ? state.enduranceMessages[model.name] : undefined;
  const canRun = ready && !busy && !running && !state.running && Boolean(model);
  const cost = model ? describeEnduranceTime(estimateEnduranceSeconds({ sizeGb: model.sizeGb, estimateTps: null })) : null;
  const base = result?.stages[0];

  return (
    <section className="endurance" aria-label="Context endurance">
      <h3 className="mypc-heading">Context endurance</h3>
      <p className="endurance-lede">
        The speed test runs at a short context, but a long chat, a long document or a whole project fills much more of it.
        Pick an installed model and RigMatch fills 2K, 8K and 16K of context in turn, to find where it slows down or loses its place on this PC.
      </p>

      <div className="endurance-controls">
        <label className="endurance-pick">
          <span>Model</span>
          <select
            value={model?.name ?? ''}
            onChange={(event) => setPicked(event.target.value)}
            disabled={local.length === 0 || Boolean(running)}
          >
            {local.length === 0 && <option value="">No installed model</option>}
            {local.map((entry) => <option key={entry.name} value={entry.name}>{entry.name} · {formatGb(entry.sizeGb)}</option>)}
          </select>
        </label>
        {running ? (
          <button type="button" className="btn btn-line" onClick={session.stop}>Stop</button>
        ) : (
          <button type="button" className="btn btn-line" disabled={!canRun} onClick={() => { if (model) void session.checkContext(model.name); }}>
            {result ? 'Check again' : 'Check context'}
          </button>
        )}
        {cost && !running && <span className="endurance-cost">Takes {cost}, longer if the model stops fitting. It loads the model at each size.</span>}
      </div>

      <div className="endurance-status" role="status">
        {running && <p><strong>Checking {running.model}.</strong> {progressText(state.enduranceProgress)}</p>}
        {!running && message && <p>{message}</p>}
        {!ready && <p>Ollama is not running, so the check cannot start.</p>}
        {ready && busy && !running && <p>A test is running. The check waits until it has finished, so the two do not share the graphics card.</p>}
        <p className="rigscore-dim">Ollama only: LM Studio does not report how much of a model sits on the graphics card.</p>
      </div>

      {result && base && (
        <>
          <div className="endurance-verdict">
            <p className="endurance-headline"><strong>{result.verdict.headline}.</strong></p>
            <p>{result.verdict.detail}</p>
            {result.verdict.notes.map((note) => <p key={note} className="endurance-note">{note}</p>)}
          </div>

          <table className="rigscore-table endurance-table">
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">Prompt</th>
                <th scope="col">Writing</th>
                <th scope="col">On the graphics card</th>
                <th scope="col">Passkey</th>
                <th scope="col">Loads in</th>
              </tr>
            </thead>
            <tbody>
              {result.stages.map((stage) => <StageRow key={stage.id} stage={stage} base={base} />)}
            </tbody>
          </table>

          <p className="rigscore-footnote">
            {[
              describeBaseline(result.baseline),
              `Measured ${formatDateTime(result.completedAt)} on ${result.stamp.gpu ?? 'an unread graphics card'}${result.stamp.ollamaVersion ? `, Ollama ${result.stamp.ollamaVersion}` : ''}.`,
              `A size is flagged when writing falls under ${Math.round(ENDURANCE_SPEED_KEPT_MIN * 100)}% of its ${contextLabel(base.numCtx)} speed, less than ${Math.round(ENDURANCE_ON_CARD_MIN * 100)}% of the model sits on the graphics card, or the passkey hidden in the prompt is lost.`,
              'Those cut-offs were set on three models on one card (an RTX 4070 12 GB), so treat the verdict as a guide.',
              'Loading is timed on its own and left out of the speeds. The result stays on this PC.',
            ].filter(Boolean).join(' ')}
          </p>
        </>
      )}
    </section>
  );
}
