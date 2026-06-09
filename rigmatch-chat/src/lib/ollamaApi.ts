import { invoke, Channel } from "@tauri-apps/api/core";

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
  return VALID_MODEL_NAME.test(name) && !name.includes("..");
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

export async function streamChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const channel = new Channel<string>();
  let active = true;
  signal?.addEventListener("abort", () => {
    active = false;
  });
  channel.onmessage = (token) => {
    if (active) onToken(token);
  };

  const invokePromise = invoke<void>("stream_chat", {
    baseUrl,
    model,
    messages,
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
