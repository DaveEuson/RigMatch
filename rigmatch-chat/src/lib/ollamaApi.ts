export type OllamaModel = {
  name: string;
  size: number;
  modified_at: string;
};

// Valid model name: alphanumeric + limited punctuation, no path traversal
const VALID_MODEL_NAME = /^[a-z0-9][a-z0-9._:/-]{0,199}$/i;

export function isValidModelName(name: string): boolean {
  return VALID_MODEL_NAME.test(name) && !name.includes('..');
}

export function assertLocalhostUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid Ollama URL: ${url}`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ollama URL must use http or https');
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    throw new Error('Ollama URL must point to localhost');
  }
}

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function getVersion(baseUrl: string): Promise<string | null> {
  assertLocalhostUrl(baseUrl);
  try {
    const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json() as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

export async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  assertLocalhostUrl(baseUrl);
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json() as { models: OllamaModel[] };
  const models = Array.isArray(data.models) ? data.models : [];
  // N-08: reject models with names that could be used for prototype pollution or path traversal
  return models.filter((m) => isValidModelName(m.name));
}

export async function streamChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  assertLocalhostUrl(baseUrl);
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) throw new Error(`Ollama chat returned ${res.status}`);
  if (!res.body) throw new Error("No response body from Ollama");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
        if (parsed.message?.content) onToken(parsed.message.content);
        if (parsed.done) return;
      } catch {
        // skip malformed line
      }
    }
  }
}
