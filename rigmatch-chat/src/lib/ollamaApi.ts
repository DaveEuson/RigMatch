import { invoke, Channel } from "@tauri-apps/api/core";
import type { ModelContextInfo } from "./contextWindow";

export type OllamaModel = {
  name: string;
  size: number;
  modified_at: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

// Valid model name: alphanumeric + limited punctuation, no path traversal
const VALID_MODEL_NAME = /^[a-z0-9][a-z0-9._:/-]{0,199}$/i;

export function isValidModelName(name: string): boolean {
  return VALID_MODEL_NAME.test(name) &&
    !name.includes("..") &&
    !name.includes("//") &&
    !/^[a-z][a-z0-9+.-]*:\/\//i.test(name);
}

export function assertLocalhostUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Ollama URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ollama URL must use http or https");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error("Ollama URL must point to localhost");
  }
}

// All HTTP requests go through the Rust backend to avoid CORS issues —
// Tauri's WebView origin (tauri://localhost) is rejected by Ollama's CORS policy.

export async function getVersion(baseUrl: string): Promise<string | null> {
  try {
    return await invoke<string | null>("get_ollama_version", { baseUrl });
  } catch {
    return null;
  }
}

export async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  const models = await invoke<OllamaModel[]>("list_ollama_models", { baseUrl });
  return models.filter((m) => isValidModelName(m.name));
}

/** Conversation history, read from the app data directory. */
export async function readConversationsFile(): Promise<string | null> {
  return await invoke<string | null>("read_conversations");
}

export async function writeConversationsFile(contents: string): Promise<void> {
  await invoke<void>("write_conversations", { contents });
}

export async function getModelContextInfo(
  baseUrl: string,
  model: string,
): Promise<ModelContextInfo | null> {
  try {
    return await invoke<ModelContextInfo | null>("get_model_context_info", { baseUrl, model });
  } catch {
    // An older Ollama, or a model whose metadata does not carry these fields.
    // The caller falls back to Ollama's own default rather than failing a chat.
    return null;
  }
}

/** Emitted by the Rust side: content as it arrives, then one final tally. */
type StreamEvent =
  | { type: "token"; value: string }
  | { type: "done"; promptTokens: number; evalTokens: number };

export async function streamChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
  options?: {
    numCtx?: number;
    /**
     * Ollama's own count of the prompt tokens it evaluated. The only exact
     * measure of how much of the conversation the model actually saw — if it
     * comes back far below what was sent, the middle was silently dropped.
     */
    onDone?: (stats: { promptTokens: number; evalTokens: number }) => void;
  },
): Promise<void> {
  assertLocalhostUrl(baseUrl);
  if (!isValidModelName(model)) throw new Error("Invalid model name");

  const channel = new Channel<StreamEvent>();
  let active = true;
  signal?.addEventListener("abort", () => {
    active = false;
  });
  channel.onmessage = (event) => {
    if (!active) return;
    if (event.type === "token") onToken(event.value);
    else options?.onDone?.({ promptTokens: event.promptTokens, evalTokens: event.evalTokens });
  };

  const invokePromise = invoke<void>("stream_chat", {
    baseUrl,
    model,
    messages,
    numCtx: options?.numCtx ?? null,
    onToken: channel,
  });

  if (!signal) {
    await invokePromise;
    return;
  }

  // Race the invoke against the abort signal so the caller gets AbortError immediately
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    signal.addEventListener("abort", () =>
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
    );
  });

  await Promise.race([invokePromise, abortPromise]);
}
