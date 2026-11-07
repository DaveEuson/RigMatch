// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { formatDateTime, formatGb } from '../lib/format';
import { isEmbeddingModel } from '../lib/modelCatalog';
import { PAL_LINES, PAL_TELL_LABELS, replyTime, type PalProgress } from '../lib/palCheck';
import { rigScoreBusy, rigScoreSession as session, useRigScoreSession } from '../lib/rigScoreLive';
import type { OllamaModel } from '../types';
import './ContextEndurance.css';
import './PalCheck.css';

/** An Ollama cloud model runs on Ollama's servers: not this PC's to check. */
const CLOUD_TAG = /[:-]cloud$/i;

function progressText(progress: PalProgress | null): string {
  if (!progress || progress.phase === 'checking') return 'Checking Ollama…';
  if (progress.phase === 'unloading') return 'Unloading the model…';
  return progress.index === 1
    ? `Loading the model and sending the first message (1 of ${progress.of})…`
    : `Message ${progress.index} of ${progress.of}…`;
}

/**
 * The pal check, on the Speed score screen beside the context check: could
 * one installed model pass for a person in a chat? The state lives in the
 * app's one session (lib/rigScoreSession.ts), as the context check's does.
 */
export function PalCheck({ models, ready, busy }: {
  models: OllamaModel[];
  /** Ollama answers. */
  ready: boolean;
  /** A show or test is running: the graphics card is taken. */
  busy: boolean;
}) {
  const state = useRigScoreSession();
  // An embedding model writes no text, so it has nothing to say back.
  const local = models.filter((entry) => entry.provider !== 'lm-studio' && !CLOUD_TAG.test(entry.name) && !isEmbeddingModel(entry.name));
  const [picked, setPicked] = useState('');
  const withResult = local.find((entry) => state.palResults.some((result) => result.model === entry.name));
  const model = local.find((entry) => entry.name === picked) ?? withResult ?? local[0];
  const result = state.palResults.find((entry) => entry.model === model?.name);
  const running = state.pal;
  const message = model ? state.palMessages[model.name] : undefined;
  const canRun = ready && !busy && !rigScoreBusy(state) && Boolean(model);

  return (
    <section className="endurance pal-check" aria-label="Pal check">
      <h3 className="mypc-heading">Pal check</h3>
      <p className="endurance-lede">
        Could this model pass for a person in a chat? RigMatch tells it to be one, sends it {PAL_LINES.length} instant messages,
        one of them asking whether it is an AI, and reads every reply for the tells that give a machine away.
        It is the part of a Turing test a rule can check. How human the rest sounds is yours to judge, so the whole chat is shown.
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
          <button type="button" className="btn btn-line" disabled={!canRun} onClick={() => { if (model) void session.checkPal(model.name); }}>
            {result ? 'Chat again' : 'Start the chat'}
          </button>
        )}
        {!running && <span className="endurance-cost">{PAL_LINES.length} short messages: about a minute once the model has loaded.</span>}
      </div>

      <div className="endurance-status" role="status">
        {running && <p><strong>Chatting with {running.model}.</strong> {progressText(state.palProgress)}</p>}
        {!running && message && <p>{message}</p>}
        {!ready && <p>Ollama is not running, so the check cannot start.</p>}
        {ready && busy && !running && <p>A test is running. The check waits until it has finished, so the two do not share the graphics card.</p>}
      </div>

      {result && (
        <>
          <div className="endurance-verdict">
            <p className="endurance-headline"><strong>{result.verdict.headline}.</strong></p>
            <p>{result.verdict.detail}</p>
            {result.verdict.notes.map((note) => <p key={note} className="endurance-note">{note}</p>)}
          </div>

          <ol className="pal-chat" aria-label={`The chat with ${result.model}`}>
            {result.turns.map((turn, index) => {
              const time = replyTime(turn);
              return (
                <li key={`${index}-${turn.kind}`}>
                  <p className="pal-you"><span className="pal-who">You</span> {turn.you}</p>
                  <p className="pal-them">
                    <span className="pal-who">{result.model}</span>{' '}
                    {turn.reply ? turn.reply : <em className="rigscore-dim">(sent nothing)</em>}
                  </p>
                  {(turn.tells.length > 0 || time) && (
                    <p className="pal-meta">
                      {turn.tells.map((tell) => <span key={tell} className="pal-tell">{PAL_TELL_LABELS[tell]}</span>)}
                      {time && <span>{time}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <p className="rigscore-footnote">
            {[
              `Chatted ${formatDateTime(result.completedAt)} on ${result.stamp.gpu ?? 'an unread graphics card'}${result.stamp.ollamaVersion ? `, Ollama ${result.stamp.ollamaVersion}` : ''}.`,
              'The rules look for a reply that says it is an AI, a list, bold or headings, assistant phrases ("how can I help", "feel free to"),',
              'more than 60 words, nothing at all, and, in the last reply, no sign of the dog. They catch the obvious tells only.',
              'Not part of the Match Score. The chat stays on this PC.',
            ].join(' ')}
          </p>
        </>
      )}
    </section>
  );
}
