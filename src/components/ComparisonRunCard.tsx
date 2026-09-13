// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { AlertTriangle, Play, Sparkles } from 'lucide-react';
import { AUDIO_CLIP_SECONDS } from '../lib/audioCatalog';
import { AUDIO_BENCHMARK_PROMPTS } from '../lib/audioGenScoring';
import { installedAudioEntries } from '../lib/audioLineup';
import { startAudioLineup, stopAudioLineup, type AudioLineupStage } from '../lib/audioLineupSession';
import { isPictureCheckpoint } from '../lib/checkpointKinds';
import { readComfySettings } from '../lib/comfySettings';
import { GENERATION_MODELS, type ComfyFolderListing } from '../lib/generationCatalog';
import { CUSTOM_IMAGE_PROMPT_ID, IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';
import type { ImageLineupEntry } from '../lib/imageLineup';
import { startImageLineup, stopImageLineup, type ImageLineupStage } from '../lib/imageLineupSession';
import { readVideoCalibration } from '../lib/videoCalibrationStore';
import { formatVideoDuration, formatVideoEstimate, type VideoMachine } from '../lib/videoFit';
import { allLineupEntries, estimateLineup, lineupCardFacts, measuredSecondsFor } from '../lib/videoLineup';
import { startVideoLineup, stopVideoLineup } from '../lib/videoLineupSession';
import { useAudioLineupSession } from '../hooks/useAudioLineupSession';
import { useImageLineupSession } from '../hooks/useImageLineupSession';
import { useLabResults } from '../hooks/useLabResults';
import { useImageTest } from '../hooks/useRenderActivity';
import { useVideoLineupSession } from '../hooks/useVideoLineupSession';
import { ComfyNeeded } from './ComfyNeeded';
import { Elapsed } from './Elapsed';
import type { GenerationChannel } from './GenerationTestPanel';
import { PromptPicker } from './PromptPicker';

/** What the Comparison screen's one-prompt run needs from the rest of the app. */
export type ComparisonRunContext = {
  comfyReachable: boolean;
  comfyFolders: ComfyFolderListing;
  /** The vision model that checks pictures and clips; empty when none is installed. */
  judgeModel: string;
  /** The model that listens to made audio; empty when nothing installed can hear. */
  listenerModel: string;
  ollamaBaseUrl: string;
  machine: VideoMachine;
  /** Another test holds the graphics card, so a time taken now would measure the contention. */
  gpuBusy: boolean;
  onCheckComfy: () => void;
  /** The Models screen, where another model can be downloaded. */
  onOpenModels: () => void;
};

const STAGE: Record<ImageLineupStage | AudioLineupStage, string> = {
  waiting: 'waiting its turn',
  drawing: 'drawing',
  drawn: 'drawn',
  making: 'making its clip',
  made: 'made',
  checking: 'being checked',
  checked: 'checked',
  failed: 'failed',
};

/** How each kind of run is spoken about. */
const COPY: Record<GenerationChannel, {
  noun: string;
  heading: string;
  runsOn: string;
  listLabel: string;
  start: (count: number) => string;
  startIdle: string;
  doing: string;
  notDone: string;
}> = {
  images: {
    noun: 'picture',
    heading: 'Draw the same prompt with several models',
    runsOn: 'Picture models run on ComfyUI',
    listLabel: 'Picture models that can run here',
    start: (count) => `Draw ${count} pictures`,
    startIdle: 'Draw them',
    doing: 'drawing',
    notDone: 'not drawn',
  },
  video: {
    noun: 'video',
    heading: 'Race video models on the same prompt',
    runsOn: 'Video models run on ComfyUI',
    listLabel: 'Video models that can run here',
    start: (count) => `Race ${count} models`,
    startIdle: 'Race them',
    doing: 'rendering',
    notDone: 'not rendered',
  },
  audio: {
    noun: 'audio',
    heading: 'Make the same sound with several models',
    runsOn: 'Audio models run on ComfyUI',
    listLabel: 'Audio models that can run here',
    start: (count) => `Make ${count} clips`,
    startIdle: 'Make them',
    doing: 'making its clip',
    notDone: 'not made',
  },
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The name a person knows a checkpoint by: the catalogue's, or the file's own. */
function checkpointName(file: string): string {
  return GENERATION_MODELS.find((model) => model.filename.toLowerCase() === file.toLowerCase())?.label ?? file;
}

/**
 * Several models, one prompt, run from the screen that shows them side by side.
 *
 * Comparison used to show only what the Lab had already made, so comparing two
 * picture models meant testing each on its own and hoping the prompts matched.
 * Here the models are ticked and one prompt is picked, and they run one after
 * another with the same seed, every one rendered before any is checked. The
 * results land in the board below, ranked at the fader above.
 *
 * Video runs the Lab's own race, so the two screens can never disagree about
 * one; pictures and audio follow the same rules through their own lineups.
 */
export function ComparisonRunCard({
  channel,
  context,
  balance,
}: {
  channel: GenerationChannel;
  context: ComparisonRunContext;
  /** Where the fader stands, already 0 when nothing can judge. */
  balance: number;
}) {
  const video = channel === 'video';
  const audio = channel === 'audio';
  const copy = COPY[channel];
  const saved = useLabResults();
  const videoSession = useVideoLineupSession();
  const imageSession = useImageLineupSession();
  const audioSession = useAudioLineupSession();
  const imageTest = useImageTest();
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set());
  const [promptId, setPromptId] = useState((audio ? AUDIO_BENCHMARK_PROMPTS : IMAGE_BENCHMARK_PROMPTS)[0].id);
  const [customPrompt, setCustomPrompt] = useState('');
  const [confirmUnload, setConfirmUnload] = useState(false);

  const calibration = readVideoCalibration();
  // What can race now: on disk, and able to run on this machine. Fastest
  // first, the order the Lab runs them in.
  const videoCards = video
    ? allLineupEntries(context.comfyFolders)
      .map((entry) => ({
        entry,
        facts: lineupCardFacts(entry, {
          machine: context.machine,
          installed: context.comfyFolders,
          calibration,
          measuredSeconds: measuredSecondsFor(entry, saved, context.machine.gpuName),
        }),
      }))
      .filter(({ facts }) => facts.runnable)
      .sort((a, b) => a.facts.estimate.seconds - b.facts.estimate.seconds)
    : [];
  // A video or audio checkpoint cannot draw a still, so it is not offered here.
  const imageEntries: ImageLineupEntry[] = channel === 'images'
    ? (context.comfyFolders.checkpoints ?? [])
      .filter(isPictureCheckpoint)
      .map((file) => ({ checkpoint: file, name: checkpointName(file) }))
    : [];
  // Every file each needs, where ComfyUI reads it.
  const audioEntries = audio ? installedAudioEntries(context.comfyFolders) : [];

  const lastNote = (key: string, verb: string) => {
    const last = saved[key];
    return last && !last.error ? `last ${verb} in ${formatVideoDuration(last.elapsedMs / 1000)}` : 'not tested here yet';
  };
  const options = video
    ? videoCards.map(({ entry, facts }) => ({
      key: entry.key,
      name: entry.name,
      note: formatVideoEstimate(facts.estimate, { roughNote: false }),
    }))
    : audio
      ? audioEntries.map((entry) => ({ key: entry.key, name: entry.name, note: lastNote(`audio:${entry.key}`, 'made') }))
      : imageEntries.map((entry) => ({
        key: entry.checkpoint,
        name: entry.name,
        note: lastNote(`image:${entry.checkpoint}`, 'drew'),
      }));
  const picked = options.filter((option) => picks.has(option.key));
  const pickedVideo = videoCards.filter(({ entry }) => picks.has(entry.key));

  // A model tested on its own from the Models screen runs through the same
  // session as a comparison, but it is not this card's to stop.
  const running = video
    ? videoSession.running && !videoSession.solo
    : audio
      ? audioSession.running && !audioSession.solo
      : imageSession.running;
  const soloRunning = video
    ? videoSession.running && Boolean(videoSession.solo)
    : audio && audioSession.running && Boolean(audioSession.solo);
  const promptReady = promptId !== CUSTOM_IMAGE_PROMPT_ID || customPrompt.trim().length > 0;
  // Why it cannot run right now, in a sentence. One graphics card, one render.
  const blocked = context.gpuBusy
    ? 'Another test is using the graphics card. This can run when it finishes.'
    : soloRunning
      ? 'A model is being tested on its own. This can run when it finishes.'
      : imageTest
        ? `${imageTest.name} is drawing a picture from its row. This can run when it finishes.`
      : channel !== 'images' && imageSession.running
        ? 'Pictures are being compared. This can run when they finish.'
        : channel !== 'video' && videoSession.running
          ? 'A video is rendering. This can run when it finishes.'
          : channel !== 'audio' && audioSession.running
            ? 'Audio is being made. This can run when it finishes.'
            : null;
  const canRun = context.comfyReachable && !blocked && !running && picked.length >= 2 && promptReady && !confirmUnload;

  const toggle = (key: string) => setPicks((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const begin = async () => {
    setConfirmUnload(false);
    if (video) {
      await startVideoLineup({
        entries: pickedVideo.map(({ entry }) => entry),
        expected: Object.fromEntries(pickedVideo.map(({ entry, facts }) => [
          entry.key,
          { low: facts.estimate.low, high: facts.estimate.high, basis: facts.estimate.basis },
        ])),
        promptId,
        customPrompt,
        judgeModel: context.judgeModel || undefined,
        ollamaBaseUrl: context.ollamaBaseUrl,
        // Every model starts cold, the way its estimate was measured. The
        // person agreed in Settings, or in the warning below.
        unloadBetweenRuns: true,
        gpuName: context.machine.gpuName,
        balance,
      });
      return;
    }
    if (audio) {
      await startAudioLineup({
        entries: audioEntries.filter((entry) => picks.has(entry.key)),
        promptId,
        customPrompt,
        listenerModel: context.listenerModel || undefined,
        ollamaBaseUrl: context.ollamaBaseUrl,
        unloadBetweenRuns: true,
        balance,
      });
      return;
    }
    await startImageLineup({
      entries: imageEntries.filter((entry) => picks.has(entry.checkpoint)),
      promptId,
      customPrompt,
      judgeModel: context.judgeModel || undefined,
      ollamaBaseUrl: context.ollamaBaseUrl,
      unloadBetweenRuns: true,
      balance,
    });
  };

  // Settings has already asked, for a ComfyUI that is RigMatch's alone.
  const requestStart = () => {
    if (readComfySettings().dedicated) void begin();
    else setConfirmUnload(true);
  };

  const total = pickedVideo.length > 0
    ? estimateLineup(pickedVideo.map(({ entry }) => entry), context.machine, { calibration, saved })
    : null;
  const note = blocked
    ?? (picked.length < 2
      ? 'Tick two or more to compare.'
      : total
        ? `${picked.length} picked · ${lowerFirst(formatVideoEstimate(total, { roughNote: false }))} in total`
        : audio
          ? `${picked.length} picked · the same prompt, seed and length for each`
          : `${picked.length} picked · the same prompt and seed for each`);
  const message = video
    ? (videoSession.solo ? '' : videoSession.message)
    : audio
      ? (audioSession.solo ? '' : audioSession.message)
      : imageSession.message;
  const failed = video ? videoSession.failed : audio ? audioSession.failed : imageSession.failed;
  const checker = audio
    ? (context.listenerModel ? `checked by ${context.listenerModel}` : 'judged by your ear')
    : (context.judgeModel ? `checked by ${context.judgeModel}` : 'unjudged: no vision model');

  // Where each model in this comparison has got to. Video shows its own race below.
  type Step = { key: string; name: string; stage: ImageLineupStage | AudioLineupStage; startedAt: number | null; error?: string };
  let steps: Step[] = [];
  let finished = false;
  if (channel === 'images' && imageSession.run) {
    finished = imageSession.run.finished;
    steps = imageSession.run.planned.map((entry) => ({
      key: entry.checkpoint,
      name: entry.name,
      stage: imageSession.stages[entry.checkpoint] ?? 'waiting',
      startedAt: imageSession.current?.checkpoint === entry.checkpoint ? imageSession.current.startedAt : null,
      error: imageSession.errors[entry.checkpoint],
    }));
  } else if (audio && audioSession.run && !audioSession.solo) {
    finished = audioSession.run.finished;
    steps = audioSession.run.planned.map((entry) => ({
      key: entry.key,
      name: entry.name,
      stage: audioSession.stages[entry.key] ?? 'waiting',
      startedAt: audioSession.current?.key === entry.key ? audioSession.current.startedAt : null,
      error: audioSession.errors[entry.key],
    }));
  }

  return (
    <section className="comparison-run" aria-label={`Run ${copy.noun} models on one prompt`}>
      <div className="comparison-run-head">
        <Sparkles aria-hidden="true" />
        <div>
          <span>One prompt</span>
          <strong>{copy.heading}</strong>
        </div>
      </div>
      <p>
        Tick the models and pick a prompt. They run one after another with the same seed, every one
        renders before any is checked, and the results land below, ranked by the fader.
      </p>

      {!context.comfyReachable ? (
        <ComfyNeeded runs={copy.runsOn} onCheck={context.onCheckComfy} />
      ) : options.length < 2 ? (
        <div className="comparison-run-short">
          <span>
            {options.length === 0
              ? `No ${copy.noun} model that can run here is installed yet.`
              : `Only one ${copy.noun} model can run here: ${options[0].name}.`}
            {' '}Download another from the Models screen, and they can be compared here.
          </span>
          <button type="button" className="mini-button outline" onClick={context.onOpenModels}>
            Open Models
          </button>
        </div>
      ) : (
        <>
          <ul className="comparison-run-models" aria-label={copy.listLabel}>
            {options.map((option) => (
              <li key={option.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={picks.has(option.key)}
                    disabled={running}
                    onChange={() => toggle(option.key)}
                  />
                  <span>
                    <strong>{option.name}</strong>
                    <em>{option.note}</em>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <PromptPicker
            idPrefix={`comparison-run-${channel}`}
            value={promptId}
            onChange={setPromptId}
            customPrompt={customPrompt}
            onCustomPromptChange={setCustomPrompt}
            disabled={running}
            prompts={audio ? AUDIO_BENCHMARK_PROMPTS : IMAGE_BENCHMARK_PROMPTS}
            subject={audio ? 'clip' : 'picture'}
          />
          <div className="advanced-lab-safeguards">
            <span>same prompt and seed</span>
            {audio && <span>{AUDIO_CLIP_SECONDS} s each</span>}
            <span>every model starts cold</span>
            <span>{checker}</span>
            {video && (
              <span title="Temporal consistency and flicker have no right answer and no local model judges them reliably.">
                motion not scored
              </span>
            )}
          </div>

          {confirmUnload && (
            <div className="video-lineup-confirm" role="alertdialog" aria-label="Unload ComfyUI between models?">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>This unloads ComfyUI before every model.</strong>
                <span>
                  Each one then starts cold, so the times compare fairly. Anything you have loaded in
                  ComfyUI yourself is unloaded too.
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

          <div className="comparison-run-bar">
            {running ? (
              <button
                type="button"
                className="mini-button outline"
                onClick={video ? stopVideoLineup : audio ? stopAudioLineup : stopImageLineup}
              >
                Stop
              </button>
            ) : (
              <button type="button" className="primary-button compact" onClick={requestStart} disabled={!canRun}>
                <Play aria-hidden="true" />
                {picked.length >= 2 ? copy.start(picked.length) : copy.startIdle}
              </button>
            )}
            {!running && <span>{note}</span>}
          </div>
        </>
      )}

      {steps.length > 0 && (
        <ol className="comparison-run-progress" aria-label="This comparison">
          {steps.map((step) => (
            <li key={step.key} className={step.stage}>
              <span>{step.name}</span>
              <em>
                {step.startedAt !== null
                  ? <>{copy.doing}, <Elapsed since={step.startedAt} /></>
                  : step.stage === 'failed'
                    ? `failed: ${step.error ?? 'no reason was given'}`
                    : step.stage === 'waiting' && finished
                      ? copy.notDone
                      : STAGE[step.stage]}
              </em>
            </li>
          ))}
        </ol>
      )}

      {message && (
        <p className={`advanced-lab-message ${failed ? 'failed' : running ? 'running' : 'complete'}`} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
