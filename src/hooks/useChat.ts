// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useRef, useState } from 'react';

import { agentArcadeApi } from '../api';
import { getErrorMessage } from '../lib/format';
import { chatBeyondNote, classifyChatRequest } from '../lib/chatCapabilityGuard';
import { canHearAudio, getModelRuntime, isVisionModel } from '../lib/modelCatalog';
import type { ChatAction, ChatAttachment, ChatMessage, ModelRow, OllamaStatus } from '../types';

/**
 * The conversation with the selected model.
 *
 * Messages are kept per model rather than in one thread: the app exists to
 * compare models, and a single transcript would attribute one model's answers
 * to whichever was selected when you read it. `chatMessages` is therefore
 * derived from the selection, not stored.
 *
 * The runtime is resolved per send rather than captured, because the same
 * conversation can be continued against a model served by Ollama or by LM
 * Studio, and those have different base URLs.
 */
export function useChat({
  selectedModel,
  selectedRow,
  ollama,
  welcomeMessage,
  initialMessagesByModel,
  setActivity,
  imageGeneration,
}: {
  selectedModel: string;
  selectedRow: ModelRow | undefined;
  ollama: OllamaStatus;
  welcomeMessage: ChatMessage;
  initialMessagesByModel: Record<string, ChatMessage[]>;
  setActivity: (message: string) => void;
  /**
   * Making a picture, when this computer actually can.
   *
   * Passed in rather than reached for: whether ComfyUI is up, which checkpoint
   * is loaded and how to drive it belong to the app, and a chat hook that knew
   * all that would be a chat hook that could promise things on its own.
   */
  imageGeneration?: {
    available: boolean;
    run: (prompt: string, signal: AbortSignal) => Promise<{ dataUrl?: string; error?: string }>;
    /**
     * A sentence about the GPU, if it is busy. Optional, and never awaited
     * before starting: reading the card takes three to five seconds, and making
     * someone wait that long to be told their machine is slow is its own joke.
     */
    gpuNote?: () => Promise<string>;
  };
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  // Pending image (data URL) the user attached for the next vision-model message.
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(null);
  const [chatMessagesByModel, setChatMessagesByModel] = useState<Record<string, ChatMessage[]>>(initialMessagesByModel);
  /** The generation in flight, so Stop reaches this one and not a later one. */
  const generationRef = useRef<AbortController | null>(null);
  /** How busy the card was when the offer was made — see runChatAction. */
  const gpuNoteRef = useRef('');

  const chatMessages = chatMessagesByModel[selectedModel] ?? [welcomeMessage];
  const chatSupportsImages = isVisionModel(selectedModel);

  const sendChat = useCallback(async () => {
    const message = chatInput.trim();
    const attachment = chatAttachment;
    // Allow an attachment-only send (e.g. "read this") but keep a default
    // prompt so the model always gets some text to act on.
    if (!message && !attachment) return;

    // Audio and images both travel in `images` — that is how Ollama takes a
    // recording, verified against gemma4:e2b, which transcribed a WAV sent
    // this way.
    const attached = attachment ? [attachment.dataUrl] : undefined;
    const defaultPrompt = attachment?.kind === 'audio'
      ? 'What is said in this recording?'
      : 'What is in this image?';

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message || (attachment ? defaultPrompt : ''),
      ...(attached ? { images: attached } : {}),
      ...(attachment ? { attachmentKind: attachment.kind } : {}),
    };
    // Pinned before the await: the user can select another model while the
    // response is in flight, and the reply belongs to the model that was asked.
    const chatModel = selectedModel;
    // Said before the model answers, not after.
    //
    // Ollama serves text: ask any of these models for a picture and it will
    // describe one warmly, or announce it has made one. The second is a plain
    // untruth, and relaying it without comment made the app complicit. The note
    // is additive — the request still goes through, because a guard that
    // refuses on a false positive is a worse failure than a redundant sentence.
    const beyondKind = classifyChatRequest(userMessage.content);
    const canGenerateHere = beyondKind === 'image' && Boolean(imageGeneration?.available);
    if (canGenerateHere) {
      // Read the card now, while the offer is being made and nothing of ours is
      // running on it. Not awaited: the answer takes three to five seconds and
      // the message should appear at once.
      gpuNoteRef.current = '';
      void imageGeneration?.gpuNote?.().then((note) => { gpuNoteRef.current = note; }).catch(() => {});
    }
    const beyond = chatBeyondNote(beyondKind, chatModel, {
      canGenerateHere,
      canHear: Boolean(selectedRow && canHearAudio(selectedRow)),
    });
    const opening: ChatMessage[] = beyond
      ? [userMessage, {
        id: `${Date.now()}-limit`,
        role: 'agent',
        content: beyond,
        ...(canGenerateHere
          ? { action: { kind: 'generate-image' as const, prompt: userMessage.content, label: 'Generate it here' } }
          : {}),
      }]
      : [userMessage];

    setChatMessagesByModel((prev) => ({
      ...prev,
      [chatModel]: [...(prev[chatModel] ?? [welcomeMessage]), ...opening],
    }));
    setChatInput('');
    setChatAttachment(null);

    try {
      const runtime = getModelRuntime(selectedRow, ollama);
      const response = await agentArcadeApi.sendChat({
        model: chatModel,
        message: userMessage.content,
        baseUrl: runtime.baseUrl,
        provider: runtime.provider,
        ...(attached ? { images: attached } : {}),
      });
      setChatMessagesByModel((prev) => ({
        ...prev,
        [chatModel]: [
          ...(prev[chatModel] ?? [welcomeMessage]),
          { id: `${Date.now()}-agent`, role: 'agent', content: response.message },
        ],
      }));
    } catch (error) {
      const errMsg = getErrorMessage(error);
      setActivity(`Chat failed: ${errMsg}`);
      setChatMessagesByModel((prev) => ({
        ...prev,
        [chatModel]: [
          ...(prev[chatModel] ?? [welcomeMessage]),
          { id: `${Date.now()}-error`, role: 'agent', content: `I could not reach the selected model: ${errMsg}` },
        ],
      }));
    }
  }, [chatAttachment, chatInput, ollama, selectedModel, selectedRow, welcomeMessage, setActivity, imageGeneration]);

  /**
   * Drop an attachment the newly selected model cannot take, and say so.
   *
   * Silently clearing it would be its own small lie — the user attached
   * something and it vanished — and silently sending it produces "Failed to
   * load image or audio file" from Ollama, which reads as a broken recording
   * rather than the wrong model.
   */
  const dropAttachment = useCallback((reason: string, intoModel: string) => {
    setChatAttachment(null);
    // Into the thread the user is now looking at, not the one they left.
    // Closing over selectedModel put the explanation in the previous model's
    // transcript — present, correct, and invisible — which is the trap a
    // per-model transcript sets for anything that happens *during* a switch.
    setChatMessagesByModel((prev) => ({
      ...prev,
      [intoModel]: [...(prev[intoModel] ?? [welcomeMessage]), {
        id: `${Date.now()}-dropped`,
        role: 'agent',
        content: reason,
      }],
    }));
  }, [welcomeMessage]);

  /**
   * Take up the offer: generate the picture and put it in the transcript.
   *
   * The user's own words are the prompt. Rewriting them into something a
   * diffusion model likes better would produce a picture of a request they did
   * not make, and they would have no way to tell.
   */
  const runChatAction = useCallback(async (action: ChatAction) => {
    const chatModel = selectedModel;

    if (action.kind === 'stop-image') {
      generationRef.current?.abort();
      return;
    }
    if (!imageGeneration) return;

    const runId = `${Date.now()}-gen`;
    const controller = new AbortController();
    generationRef.current = controller;

    /** Rewrite the one running message rather than appending another. */
    const say = (content: string, extra: Partial<ChatMessage> = {}) => {
      setChatMessagesByModel((prev) => {
        const thread = prev[chatModel] ?? [welcomeMessage];
        const at = thread.findIndex((m) => m.id === runId);
        const next: ChatMessage = { id: runId, role: 'agent', content, ...extra };
        return {
          ...prev,
          [chatModel]: at === -1 ? [...thread, next] : thread.map((m, i) => (i === at ? next : m)),
        };
      });
    };

    // Elapsed seconds, not a percentage.
    //
    // ComfyUI is polled for completion and reports nothing in between, so any
    // bar would be an invented measurement — the exact thing this app refuses
    // to do with a score. A rising count is true, and it is what tells someone
    // the difference between "slow" and "stuck".
    const startedAt = Date.now();
    const stopOffer = { action: { kind: 'stop-image' as const, prompt: action.prompt, label: 'Stop' } };
    say(`Generating "${action.prompt}" with ComfyUI...`, stopOffer);

    // Measured when the offer was made, before ComfyUI was asked for anything.
    //
    // Probing during the run reported `heavy` and blamed the user's graphics
    // card — while the only thing loading it was this generation. nvidia-smi
    // reads the card as it is now, so asking mid-run means measuring ourselves
    // and calling it their problem. The reading taken at offer time is of the
    // machine before we touched it, which is the one that answers "will this be
    // slow", and it has had the seconds since the user read the offer to land.
    const busyNote = gpuNoteRef.current;

    const ticking = setInterval(() => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      say(`Generating "${action.prompt}" with ComfyUI... ${seconds}s${busyNote}`, stopOffer);
    }, 1000);

    try {
      const result = await imageGeneration.run(action.prompt, controller.signal);
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      if (result.dataUrl) {
        say(`Here it is: "${action.prompt}". ${seconds}s.`, {
          images: [result.dataUrl],
          attachmentKind: 'image',
        });
      } else if (controller.signal.aborted) {
        say(`Stopped after ${seconds}s. Nothing was saved.`);
      } else {
        say(`That image could not be made: ${result.error ?? 'ComfyUI did not return a picture.'}`);
      }
    } finally {
      clearInterval(ticking);
      if (generationRef.current === controller) generationRef.current = null;
    }
  }, [imageGeneration, selectedModel, welcomeMessage]);

  /** The in-memory half of "Clear Data": every conversation, and the draft. */
  const resetChat = useCallback(() => {
    setChatInput('');
    setChatMessagesByModel({});
  }, []);

  return {
    chatOpen,
    setChatOpen,
    chatInput,
    setChatInput,
    chatAttachment,
    setChatAttachment,
    chatMessagesByModel,
    chatMessages,
    chatSupportsImages,
    sendChat,
    runChatAction,
    dropAttachment,
    resetChat,
  };
}
