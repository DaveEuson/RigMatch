// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useState } from 'react';
import { AlertTriangle, Play, Sparkles } from 'lucide-react';
import { readComfySettings } from '../lib/comfySettings';
import { GENERATION_MODELS, type ComfyFolderListing } from '../lib/generationCatalog';
import { CUSTOM_IMAGE_PROMPT_ID, IMAGE_BENCHMARK_PROMPTS } from '../lib/imageGenScoring';
import type { ImageLineupEntry } from '../lib/imageLineup';
import { startImageLineup, stopImageLineup, type ImageLineupStage } from '../lib/imageLineupSession';
import { readVideoCalibration } from '../lib/videoCalibrationStore';
import { formatVideoEstimate, type VideoMachine } from '../lib/videoFit';
import { isVideoCheckpoint } from '../lib/videoGen';
import { allLineupEntries, estimateLineup, lineupCardFacts, measuredSecondsFor } from '../lib/videoLineup';
import { startVideoLineup, stopVideoLineup } from '../lib/videoLineupSession';
import { useImageLineupSession } from '../hooks/useImageLineupSession';
import { useLabResults } from '../hooks/useLabResults';
import { useVideoLineupSession } from '../hooks/useVideoLineupSession';
import { ComfyNeeded } from './ComfyNeeded';
import { Elapsed } from './Elapsed';
import { PromptPicker } from './PromptPicker';

/** What the Comparison screen's one-prompt run needs from the rest of the app. */
export type ComparisonRunContext = {
  comfyReachable: boolean;
  comfyFolders: ComfyFolderListing;
  /** The vision model that checks the results; empty when none is installed. */
  judgeModel: string;
  ollamaBaseUrl: string;
  machine: VideoMachine;
  /** Another test holds the graphics card, so a time taken now would measure the contention. */
  gpuBusy: boolean;
  onCheckComfy: () => void;
  /** The Models screen, where another model can be downloaded. */
  onOpenModels: () => void;
};

const STAGE: Record<ImageLineupStage, string> = {
  waiting: 'waiting its turn',
  drawing: 'drawing',
  drawn: 'drawn',
  checking: 'being checked',
  checked: 'checked',
  failed: 'failed',
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
 * one; pictures follow the same rules through the image lineup.
 */
export function ComparisonRunCard({
  channel,
  context,
  balance,
}: {
  channel: 'images' | 'video';
  context: ComparisonRunContext;
  /** Where the fader stands, already 0 when nothing can judge. */
  balance: number;
}) {
  const video = channel === 'video';
  const saved = useLabResults();
  const videoSession = useVideoLineupSession();
  const imageSession = useImageLineupSession();
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set());
  const [promptId, setPromptId] = useState(IMAGE_BENCHMARK_PROMPTS[0].id);
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
  // A video checkpoint cannot draw a still, so it is not offered here.
  const imageEntries: ImageLineupEntry[] = video
    ? []
    : (context.comfyFolders.checkpoints ?? [])
      .filter((file) => !isVideoCheckpoint(file))
      .map((file) => ({ checkpoint: file, name: checkpointName(file) }));

  const options = video
    ? videoCards.map(({ entry, facts }) => ({
      key: entry.key,
      name: entry.name,
      note: formatVideoEstimate(facts.estimate, { roughNote: false }),
    }))
    : imageEntries.map((entry) => {
      const last = saved[`image:${entry.checkpoint}`];
      return {
        key: entry.checkpoint,
        name: entry.name,
        note: last && !last.error ? `last drew in ${(last.elapsedMs / 1000).toFixed(1)} s` : 'not tested here yet',
      };
    });
  const picked = options.filter((option) => picks.has(option.key));
  const pickedVideo = videoCards.filter(({ entry }) => picks.has(entry.key));

  // A model tested on its own from the Models screen renders through the same
  // session as a race, but it is not this card's to stop.
  const raceRunning = videoSession.running && !videoSession.solo;
  const running = video ? raceRunning : imageSession.running;
  const promptReady = promptId !== CUSTOM_IMAGE_PROMPT_ID || customPrompt.trim().length > 0;
  // Why it cannot run right now, in a sentence.
  const blocked = context.gpuBusy
    ? 'Another test is using the graphics card. This can run when it finishes.'
    : video && videoSession.running && videoSession.solo
      ? 'A model is being tested on its own. This can run when it finishes.'
      : video && imageSession.running
        ? 'Pictures are being compared. This can run when they finish.'
        : !video && videoSession.running
          ? 'A video is rendering. This can run when it finishes.'
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

  const noun = video ? 'video' : 'picture';
  const total = pickedVideo.length > 0
    ? estimateLineup(pickedVideo.map(({ entry }) => entry), context.machine, { calibration, saved })
    : null;
  const note = blocked
    ?? (picked.length < 2
      ? 'Tick two or more to compare.'
      : total
        ? `${picked.length} picked · ${lowerFirst(formatVideoEstimate(total, { roughNote: false }))} in total`
        : `${picked.length} picked · the same prompt and seed for each`);
  const message = video ? (videoSession.solo ? '' : videoSession.message) : imageSession.message;
  const failed = video ? videoSession.failed : imageSession.failed;
  const progress = !video && imageSession.run ? imageSession.run.planned : [];

  return (
    <section className="comparison-run" aria-label={`Run ${noun} models on one prompt`}>
      <div className="comparison-run-head">
        <Sparkles aria-hidden="true" />
        <div>
          <span>One prompt</span>
          <strong>{video ? 'Race video models on the same prompt' : 'Draw the same prompt with several models'}</strong>
        </div>
      </div>
      <p>
        Tick the models and pick a prompt. They run one after another with the same seed, every one
        renders before any is checked, and the results land below, ranked by the fader.
      </p>

      {!context.comfyReachable ? (
        <ComfyNeeded
          runs={video ? 'Video models run on ComfyUI' : 'Picture models run on ComfyUI'}
          onCheck={context.onCheckComfy}
        />
      ) : options.length < 2 ? (
        <div className="comparison-run-short">
          <span>
            {options.length === 0
              ? `No ${noun} model that can run here is installed yet.`
              : `Only one ${noun} model can run here: ${options[0].name}.`}
            {' '}Download another from the Models screen, and they can be compared here.
          </span>
          <button type="button" className="mini-button outline" onClick={context.onOpenModels}>
            Open Models
          </button>
        </div>
      ) : (
        <>
          <ul className="comparison-run-models" aria-label={`${video ? 'Video' : 'Picture'} models that can run here`}>
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
          />
          <div className="advanced-lab-safeguards">
            <span>same prompt and seed</span>
            <span>every model starts cold</span>
            <span>{context.judgeModel ? `checked by ${context.judgeModel}` : 'unjudged: no vision model'}</span>
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
              <button type="button" className="mini-button outline" onClick={video ? stopVideoLineup : stopImageLineup}>
                Stop
              </button>
            ) : (
              <button type="button" className="primary-button compact" onClick={requestStart} disabled={!canRun}>
                <Play aria-hidden="true" />
                {picked.length >= 2
                  ? (video ? `Race ${picked.length} models` : `Draw ${picked.length} pictures`)
                  : (video ? 'Race them' : 'Draw them')}
              </button>
            )}
            {!running && <span>{note}</span>}
          </div>
        </>
      )}

      {progress.length > 0 && (
        <ol className="comparison-run-progress" aria-label="This comparison">
          {progress.map((entry) => {
            const stage = imageSession.stages[entry.checkpoint] ?? 'waiting';
            const current = imageSession.current?.checkpoint === entry.checkpoint ? imageSession.current : null;
            return (
              <li key={entry.checkpoint} className={stage}>
                <span>{entry.name}</span>
                <em>
                  {current
                    ? <>drawing, <Elapsed since={current.startedAt} /></>
                    : stage === 'failed'
                      ? `failed: ${imageSession.errors[entry.checkpoint] ?? 'no reason was given'}`
                      : stage === 'waiting' && imageSession.run?.finished
                        ? 'not drawn'
                        : STAGE[stage]}
                </em>
              </li>
            );
          })}
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
