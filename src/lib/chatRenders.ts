// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Video and audio made for RigMatch Chat.
 *
 * Chat asks over the loopback bridge, and this renders with the graph a
 * model's own Test uses, at its settings, then hands the file's bytes to the
 * main process to save. It is a use, not a test: nothing is judged or recorded
 * in Scorecards, since what someone asks Chat for is not a benchmark prompt,
 * and ComfyUI is not unloaded first, since nothing here is being raced.
 */

import { AUDIO_CLIP_SECONDS, type AudioModelSpec } from './audioCatalog.ts';
import { audioPromptById } from './audioGenScoring.ts';
import { runAudioGeneration } from './audioGenRun.ts';
import { buildAudioWorkflow } from './audioWorkflows.ts';
import { decodeAudio } from './browserAudio.ts';
import { createComfyTransport, createVideoTransport, fetchComfyOutput } from './comfyTransport.ts';
import { CUSTOM_IMAGE_PROMPT_ID, customImagePrompt } from './imageGenScoring.ts';
import { runVideoGeneration } from './videoGenRun.ts';
import { lineupGraph, lineupTimeoutMs, type VideoLineupEntry } from './videoLineup.ts';

/** A finished file as a data URL, or why there is none. */
export type ChatRender = { dataUrl?: string; error?: string; stopped?: boolean };

// A new seed each time: ComfyUI hands back its cached result for a repeated
// one, and someone asking twice wants a second clip, not the first again.
const freshSeed = () => Math.floor(Math.random() * 2 ** 31);

export async function renderChatVideo({ entry, prompt, baseUrl, signal }: {
  entry: VideoLineupEntry;
  prompt: string;
  baseUrl: string;
  signal: AbortSignal;
}): Promise<ChatRender> {
  const result = await runVideoGeneration({
    transport: createVideoTransport(baseUrl),
    graph: lineupGraph(entry, { prompt, seed: freshSeed() }),
    model: entry.name,
    output: entry.output,
    imagePrompt: customImagePrompt(prompt),
    signal,
    timeoutMs: lineupTimeoutMs(entry),
  });
  if (signal.aborted) return { stopped: true, error: 'Stopped before it finished.' };
  if (result.error || !result.videoRef) return { error: result.error ?? 'ComfyUI finished without saving a video.' };
  return { dataUrl: await fetchComfyOutput(result.videoRef, baseUrl) };
}

export async function renderChatAudio({ spec, prompt, baseUrl, signal }: {
  spec: AudioModelSpec;
  prompt: string;
  baseUrl: string;
  signal: AbortSignal;
}): Promise<ChatRender> {
  const audioPrompt = audioPromptById(CUSTOM_IMAGE_PROMPT_ID, prompt);
  const result = await runAudioGeneration({
    transport: createComfyTransport(baseUrl),
    decode: decodeAudio,
    graph: buildAudioWorkflow(spec, {
      prompt: audioPrompt.prompt,
      seed: freshSeed(),
      seconds: AUDIO_CLIP_SECONDS,
      prefix: `rigmatch-chat/${spec.key}`,
    }),
    model: spec.name,
    seconds: AUDIO_CLIP_SECONDS,
    audioPrompt,
    signal,
  });
  if (signal.aborted) return { stopped: true, error: 'Stopped before it finished.' };
  if (result.error || !result.audioRef) return { error: result.error ?? 'ComfyUI finished without saving any audio.' };
  return { dataUrl: await fetchComfyOutput(result.audioRef, baseUrl) };
}
