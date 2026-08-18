import { useCallback, useState } from 'react';

import { agentArcadeApi } from '../api';
import { getErrorMessage } from '../lib/format';
import { chatBeyondNote, classifyChatRequest } from '../lib/chatCapabilityGuard';
import { getModelRuntime, isVisionModel } from '../lib/modelCatalog';
import type { ChatAttachment, ChatMessage, ModelRow, OllamaStatus } from '../types';

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
}: {
  selectedModel: string;
  selectedRow: ModelRow | undefined;
  ollama: OllamaStatus;
  welcomeMessage: ChatMessage;
  initialMessagesByModel: Record<string, ChatMessage[]>;
  setActivity: (message: string) => void;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  // Pending image (data URL) the user attached for the next vision-model message.
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(null);
  const [chatMessagesByModel, setChatMessagesByModel] = useState<Record<string, ChatMessage[]>>(initialMessagesByModel);

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
    const beyond = chatBeyondNote(classifyChatRequest(userMessage.content), chatModel);
    const opening: ChatMessage[] = beyond
      ? [userMessage, { id: `${Date.now()}-limit`, role: 'agent', content: beyond }]
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
  }, [chatAttachment, chatInput, ollama, selectedModel, selectedRow, welcomeMessage, setActivity]);

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
    resetChat,
  };
}
