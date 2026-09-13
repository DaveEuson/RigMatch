// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { Eye, Mic, Play, X } from 'lucide-react';
import type { Balances } from '../lib/balance';
import { formatDateTime, getErrorMessage } from '../lib/format';
import {
  VISION_TEST_IMAGES,
  getListeningTestAudio,
  getVisionTestImageDataUrl,
  runAdvancedListeningChallenge,
  runAdvancedVisionChallenge,
} from '../lib/labChallenges';
import { readAdvancedLabResults, writeAdvancedLabResults, type AdvancedLabResult } from '../lib/labResults';
import type { RowSkillTest } from '../lib/rowTests';
import { workbenchById } from '../lib/workbench';
import { useLabResults } from '../hooks/useLabResults';
import { useRowPanel } from '../hooks/useRowPanel';
import { BalanceFader } from './BalanceFader';
import { Elapsed } from './Elapsed';
import { LabChecks } from './LabChecks';

/** What a listening or picture-reading test run from a model's own row needs. */
export type SkillTestContext = {
  ollamaBaseUrl: string;
  ollamaReady: boolean;
  balances: Balances;
  onBalanceChange: (channel: 'listening' | 'reading', value: number) => void;
  /** Another test holds the graphics card, so a time taken now would measure the contention. */
  gpuBusy: boolean;
  /** The Listening Lab, where your own recording or an audio file can be played instead. */
  onOpenListeningLab: () => void;
  /** Comparison, where several models' results sit side by side. */
  onOpenComparison: () => void;
};

type Run = { phase: 'idle' | 'running' | 'complete' | 'failed'; message: string; startedAt?: number };

/**
 * The channel's own test, run from a model's row on the Models screen.
 *
 * On Listens to audio a row's Test used to ask the chat questions, which say
 * nothing about hearing. Here it plays the bundled 42-word passage and counts
 * the words the model got wrong; on Reads images it shows a test picture and
 * scores the description. Both are the tests the Lab and the Run dialog run,
 * saved where they save, so Comparison and Scorecards see them.
 */
export function SkillTestPanel({
  id,
  kind,
  model,
  context,
  onClose,
}: {
  id: string;
  kind: RowSkillTest;
  /** The installed model's name, as Ollama knows it. */
  model: string;
  context: SkillTestContext;
  onClose: () => void;
}) {
  const listening = kind === 'listening';
  const channel = listening ? 'listening' : 'reading';
  const saved = useLabResults();
  const { ref, size, style } = useRowPanel();
  const [pictureId, setPictureId] = useState(VISION_TEST_IMAGES[0].id);
  const [run, setRun] = useState<Run>({ phase: 'idle', message: '' });

  const balance = context.balances[channel];
  // The keys the Lab and the Run dialog save under, so this is the same record.
  const resultKey = `${listening ? 'listening' : 'vision'}:${model}`;
  const last: AdvancedLabResult | undefined = saved[resultKey];
  const picture = VISION_TEST_IMAGES.find((image) => image.id === pictureId) ?? VISION_TEST_IMAGES[0];
  const running = run.phase === 'running';
  // Why it cannot run right now, in a sentence.
  const blocked = !context.ollamaReady
    ? 'Ollama is not running. Start it, and this can run.'
    : context.gpuBusy
      ? 'Another test is using the graphics card. This can run when it finishes.'
      : null;

  const start = async () => {
    setRun({
      phase: 'running',
      startedAt: Date.now(),
      message: listening
        ? `Playing the passage to ${model}…`
        : `Showing ${model} the ${picture.label.toLowerCase()} picture…`,
    });
    try {
      const result = listening
        ? await runAdvancedListeningChallenge(model, context.ollamaBaseUrl, await getListeningTestAudio())
        : await runAdvancedVisionChallenge(model, context.ollamaBaseUrl, await getVisionTestImageDataUrl(picture.src));
      if (result.error) {
        setRun({ phase: 'failed', message: result.error });
        return;
      }
      // Read-modify-write against live storage, with where the fader stood as
      // it started, like every other test.
      writeAdvancedLabResults({ ...readAdvancedLabResults(), [resultKey]: { ...result, balance } });
      const seconds = (result.elapsedMs / 1000).toFixed(1);
      setRun({
        phase: 'complete',
        message: listening
          ? `${model} scored ${result.score}/100 against the passage, in ${seconds} s.`
          : `${model} described it in ${seconds} s, for a description score of ${result.score}.`,
      });
    } catch (error) {
      setRun({ phase: 'failed', message: getErrorMessage(error) });
    }
  };

  return (
    <section
      ref={ref}
      id={id}
      className={`generation-test skill-test ${kind} ${size}`}
      style={style}
      aria-label={`Test ${model}`}
      tabIndex={-1}
    >
      <header className="generation-test-head">
        {listening ? <Mic aria-hidden="true" /> : <Eye aria-hidden="true" />}
        <div>
          <span>{listening ? 'Listening test' : 'Picture-reading test'} · runs on Ollama</span>
          <strong>Test {model}</strong>
        </div>
        <button
          type="button"
          className="icon-action"
          onClick={onClose}
          aria-label={`Close the test of ${model}`}
          title="Close"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="generation-test-setup">
        <p className="skill-test-about">
          {listening
            ? 'Plays a 42-word spoken passage and counts the words the model gets wrong. The one test here with a right answer, and every model hears the same recording.'
            : 'Shows the model a test picture and scores how well it describes it. Every model is shown the same pictures, so their descriptions compare.'}
        </p>
        {!listening && (
          <div className="skill-test-pictures" role="group" aria-label="Test picture">
            {VISION_TEST_IMAGES.map((image) => (
              <button
                key={image.id}
                type="button"
                aria-pressed={image.id === pictureId}
                onClick={() => setPictureId(image.id)}
                disabled={running}
              >
                <img src={image.src} alt="" />
                <span>{image.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="advanced-lab-safeguards">
          {listening ? (
            <>
              <span>42 words</span>
              <span>the same recording for every model</span>
              <span>scored word for word</span>
            </>
          ) : (
            <>
              <span>the same pictures for every model</span>
              <span>{picture.label}</span>
            </>
          )}
        </div>
        <div className="generation-test-run">
          <button
            type="button"
            className="primary-button compact"
            onClick={() => void start()}
            disabled={running || Boolean(blocked)}
          >
            <Play aria-hidden="true" />
            {running
              ? (listening ? 'Listening…' : 'Looking…')
              : (listening ? 'Play it the passage' : 'Show it the picture')}
          </button>
          <span>{running && run.startedAt ? <><Elapsed since={run.startedAt} /> so far</> : blocked ?? ''}</span>
        </div>
        {run.message && <p className={`advanced-lab-message ${run.phase}`} role="status">{run.message}</p>}
        <button
          type="button"
          className="generation-test-lab-link"
          onClick={listening ? context.onOpenListeningLab : context.onOpenComparison}
        >
          {listening ? 'Use your own recording or an audio file in the Lab' : 'Compare its description with other models'}
        </button>
      </div>

      <BalanceFader
        value={balance}
        onChange={(value) => context.onBalanceChange(channel, value)}
        accuracyMeans={workbenchById(channel).accuracyMeans}
        disabled={running}
      />

      <div className="generation-test-result">
        {last && !last.error ? (
          <>
            <span className="generation-test-label">Latest result</span>
            {!listening && last.imageDataUrl && (
              <figure className="generation-test-picture">
                <img src={last.imageDataUrl} alt="The test picture it described" />
              </figure>
            )}
            <div className="listening-transcript skill-test-answer">
              <span>{listening ? 'What it heard' : 'What it saw'}</span>
              <strong>{last.response || '(nothing came back)'}</strong>
            </div>
            <p className="generation-test-meta">
              <b>{last.score}/100 · {last.grade}</b> · {(last.elapsedMs / 1000).toFixed(1)} s · {formatDateTime(last.completedAt)}
            </p>
            {last.checks.length > 0 && <LabChecks checks={last.checks} />}
          </>
        ) : (
          <div className="generation-test-placeholder">
            {listening ? <Mic aria-hidden="true" /> : <Eye aria-hidden="true" />}
            <span>
              {listening
                ? 'The transcript appears here, scored against what was said.'
                : 'Its description appears here, scored.'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
