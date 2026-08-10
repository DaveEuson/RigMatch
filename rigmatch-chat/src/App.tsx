import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { listModels, streamChat, getVersion, getModelContextInfo, readConversationsFile, writeConversationsFile, assertLocalhostUrl, type OllamaModel, type ChatMessage } from "./lib/ollamaApi";
import { createWriteScheduler, parseStore, serializeStore, type ConversationMap } from "./lib/conversationStore";
import {
  DEFAULT_PERSONALITY_ID,
  loadSettings,
  saveSettings,
  type AppSettings,
  type PersonalityProfile,
} from "./lib/settings";
import {
  CONTEXT_STEPS,
  chooseContextSize,
  estimateTokens,
  formatContextSize,
  formatGib,
  getContextUsage,
  kvCacheBytes,
  type ModelContextInfo,
} from "./lib/contextWindow";

marked.use({ breaks: true, gfm: true });

const AVATAR_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(content) as string, { USE_PROFILES: { html: true } });
}
import avatarLlama    from "../assets/model-avatar-llama.png";
import avatarGemma    from "../assets/model-avatar-gemma.png";
import avatarMistral  from "../assets/model-avatar-mistral.png";
import avatarPhi      from "../assets/model-avatar-phi.png";
import avatarQwen     from "../assets/model-avatar-qwen.png";
import avatarDeepseek from "../assets/model-avatar-deepseek.png";
import avatarGeneric  from "../assets/model-avatar-generic.png";

// ─── Types ────────────────────────────────────────────────────────────────────

type AvatarFamily = "llama" | "gemma" | "mistral" | "phi" | "qwen" | "deepseek" | "generic";

type Buddy = {
  modelName: string;
  displayName: string;
  avatarFamily: AvatarFamily;
  sizeGb: number;
};

type AppMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type ConnectionStatus = "connected" | "disconnected" | "checking";
type ModelScore = { speed: number; sobriety: number; stability: number; fit: number; total: number; grade: string };
type SystemStats = { cpuPercent: number; ramUsedGb: number; ramTotalGb: number };
type PersonalityDraft = {
  id: string | null;
  name: string;
  instructions: string;
  avatarDataUrl?: string;
  builtIn?: boolean;
};

// ─── Persistence ─────────────────────────────────────────────────────────────

const CONVERSATIONS_KEY = "rigmatch-chat:conversations:v1";
const RIG_SCORES_KEY = "rigmatch-chat:rig-scores:v1";

type BridgePayload = { scores: Record<string, ModelScore>; chosen: string | null };

/**
 * Read history from the app data directory, importing anything still in
 * localStorage the first time.
 *
 * The old key is only cleared once the file has been written successfully — if
 * the write fails, the history stays where it was rather than being deleted
 * from one place before it exists in the other.
 */
async function loadConversations(): Promise<Record<string, AppMessage[]>> {
  try {
    const fromFile = parseStore(await readConversationsFile());
    if (fromFile) return fromFile as Record<string, AppMessage[]>;
  } catch {
    // Fall through to the legacy store; an unreadable file must not lose it.
  }

  let legacy: Record<string, AppMessage[]> = {};
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    legacy = raw ? (JSON.parse(raw) as Record<string, AppMessage[]>) : {};
  } catch {
    return {};
  }
  if (Object.keys(legacy).length === 0) return legacy;

  try {
    await writeConversationsFile(serializeStore(legacy));
    localStorage.removeItem(CONVERSATIONS_KEY);
  } catch {
    // Keep the legacy copy and try again next launch.
  }
  return legacy;
}

function loadCachedBridge(): BridgePayload {
  try {
    const raw = localStorage.getItem(RIG_SCORES_KEY);
    return raw ? (JSON.parse(raw) as BridgePayload) : { scores: {}, chosen: null };
  } catch {
    return { scores: {}, chosen: null };
  }
}

function saveCachedBridge(payload: BridgePayload): void {
  localStorage.setItem(RIG_SCORES_KEY, JSON.stringify(payload));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvatarFamily(modelName: string): AvatarFamily {
  const n = modelName.toLowerCase();
  if (n.includes("llama") || n.includes("tinyllama")) return "llama";
  if (n.includes("gemma")) return "gemma";
  if (n.includes("mistral") || n.includes("ministral")) return "mistral";
  if (n.includes("phi")) return "phi";
  if (n.includes("qwen") || n.includes("starcoder") || n.includes("codestral") || n.includes("coder")) return "qwen";
  if (n.includes("deepseek")) return "deepseek";
  return "generic";
}

function isEmbeddingModel(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("embed") || n.includes("nomic") || n.includes("bge") || n.includes("all-minilm") || n.includes("mxbai");
}

// Deduplicate: if a base model has both :latest and explicit tags, drop the :latest alias
function deduplicateModels(models: OllamaModel[]): OllamaModel[] {
  const byBase = new Map<string, OllamaModel[]>();
  for (const m of models) {
    const base = m.name.split(":")[0] ?? m.name;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(m);
  }
  const result: OllamaModel[] = [];
  for (const [, group] of byBase) {
    if (group.length === 1) { result.push(group[0]); continue; }
    const nonLatest = group.filter((m) => { const tag = m.name.split(":")[1]; return tag && tag !== "latest"; });
    result.push(...(nonLatest.length > 0 ? nonLatest : [group[0]!]));
  }
  return result;
}

function speedToToks(speed: number): string {
  if (speed >= 90) return "~20 tok/s";
  if (speed >= 75) return "~10 tok/s";
  if (speed >= 55) return "~5 tok/s";
  if (speed >= 35) return "~2 tok/s";
  return "<2 tok/s";
}

function getDisplayName(raw: string): string {
  const [base, tag] = raw.split(":");
  const formatted = (base ?? raw)
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  if (tag && tag !== "latest") return `${formatted} ${tag.toUpperCase()}`;
  return formatted;
}

function modelToBuddy(model: OllamaModel): Buddy {
  return {
    modelName: model.name,
    displayName: getDisplayName(model.name),
    avatarFamily: getAvatarFamily(model.name),
    sizeGb: Math.round((model.size / 1e9) * 10) / 10,
  };
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getResponseLabel(score: ModelScore | undefined, sizeGb: number): string {
  if (score != null) {
    const s = score.speed;
    if (s >= 90) return "~1s · very fast";
    if (s >= 75) return "~3s · fast";
    if (s >= 55) return "~8s";
    if (s >= 35) return "~20s · slow";
    return "slow";
  }
  if (sizeGb < 1.5) return "~1s est.";
  if (sizeGb < 3) return "~3s est.";
  if (sizeGb < 6) return "~8s est.";
  if (sizeGb < 12) return "~20s est.";
  return "30s+ est.";
}

function playDing(muted: boolean): void {
  if (muted) return;
  try {
    const ctx = new AudioContext();
    const notes: Array<[number, number]> = [
      [880, 0],
      [1174.66, 0.12],
    ];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  } catch {
    // audio not available
  }
}

// ─── Avatar component ─────────────────────────────────────────────────────────

const FAMILY_AVATAR: Record<AvatarFamily, string> = {
  llama:    avatarLlama,
  gemma:    avatarGemma,
  mistral:  avatarMistral,
  phi:      avatarPhi,
  qwen:     avatarQwen,
  deepseek: avatarDeepseek,
  generic:  avatarGeneric,
};

function BuddyAvatar({
  family,
  customSrc,
  alt,
  size = "normal",
  isTyping = false,
}: {
  family: AvatarFamily;
  customSrc?: string;
  alt?: string;
  size?: "sm" | "normal" | "lg";
  isTyping?: boolean;
}) {
  const sizeClass =
    size === "lg" ? "rm-avatar rm-avatar-lg" : size === "sm" ? "rm-avatar rm-avatar-sm" : "rm-avatar";
  return (
    <img
      src={customSrc || FAMILY_AVATAR[family]}
      alt={alt || family}
      className={`${sizeClass}${isTyping ? " rm-avatar-typing" : ""}`}
    />
  );
}

/**
 * How much of this model's memory the conversation is using.
 *
 * Without this the app gave no sign that anything was wrong: past the limit
 * Ollama keeps the system prompt and the newest tokens, drops everything
 * between, and answers as though the earlier turns were never said — while the
 * transcript above still shows them all.
 */
function ContextMeter({ usage, info, limit }: {
  usage: ReturnType<typeof getContextUsage>;
  info: ModelContextInfo | null;
  limit: number;
}) {
  const state = usage.willTruncate ? "full" : usage.nearLimit ? "near" : "ok";
  const cost = info ? kvCacheBytes(info, limit) : 0;
  const title = [
    `Using about ${usage.used.toLocaleString()} of ${limit.toLocaleString()} tokens.`,
    info ? `This model supports up to ${info.maxContext.toLocaleString()}.` : null,
    cost > 0 ? `A ${formatContextSize(limit)} window costs roughly ${formatGib(cost)} of video memory.` : null,
    usage.willTruncate
      ? "The oldest messages will drop out of the model's memory on the next reply."
      : null,
  ].filter(Boolean).join(" ");

  return (
    <div className={`rm-context-meter rm-context-${state}`} title={title}>
      <span className="rm-context-label">
        {usage.willTruncate ? "MEMORY FULL" : "MEMORY"} {formatContextSize(usage.used)} / {formatContextSize(limit)}
      </span>
      <span className="rm-context-track" aria-hidden="true">
        <span className="rm-context-fill" style={{ width: `${Math.round(usage.fraction * 100)}%` }} />
      </span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [activeBuddy, setActiveBuddy] = useState<string | null>(null);
  // Starts empty and fills in from disk. `historyLoaded` gates every write —
  // without it the first save would fire with the empty initial state and
  // overwrite the file before the load that was about to populate it landed.
  const [messagesByModel, setMessagesByModel] = useState<Record<string, AppMessage[]>>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [typingModel, setTypingModel] = useState<string | null>(null);
  // Each model's declared memory, read once per model from /api/show.
  const [contextInfo, setContextInfo] = useState<Record<string, ModelContextInfo | null>>({});
  // Ollama's own token counts from the last completed reply in each
  // conversation — what the model actually saw, as opposed to what we sent it.
  // `messageCount` records how much of the transcript those counts covered, so
  // anything added afterwards can be estimated on top rather than double-counted.
  const [tokenMarkByKey, setTokenMarkByKey] = useState<
    Record<string, { promptTokens: number; evalTokens: number; messageCount: number }>
  >({});
  const [draft, setDraft] = useState("");
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<AppSettings>(settings);
  const [rigScores, setRigScores] = useState<Record<string, ModelScore>>(() => loadCachedBridge().scores);
  const [chosenModel, setChosenModel] = useState<string | null>(() => loadCachedBridge().chosen);
  const [profileModal, setProfileModal] = useState<Buddy | null>(null);
  const [personalityEditor, setPersonalityEditor] = useState<PersonalityDraft | null>(null);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [vramUsedGb, setVramUsedGb] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const prevTypingRef = useRef<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────

  const RANK_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

  // Standard competition ranking: rank = 1 + count of models with strictly higher score
  const modelRankings = useMemo(() => {
    const entries = Object.entries(rigScores);
    const map = new Map<string, number>();
    for (const [model, score] of entries) {
      const rank = 1 + entries.filter(([, s]) => s.total > score.total).length;
      if (rank <= 3) map.set(model, rank);
    }
    return map;
  }, [rigScores]);

  // Sort: chosen model first, then top-3 by rank, then the rest alphabetically
  const visibleBuddies = useMemo(() => {
    const filtered = buddies.filter((b) => !settings.hiddenModels.includes(b.modelName));
    return [...filtered].sort((a, b) => {
      const aChosen = a.modelName === chosenModel ? 0 : 1;
      const bChosen = b.modelName === chosenModel ? 0 : 1;
      if (aChosen !== bChosen) return aChosen - bChosen;
      const rankA = modelRankings.get(a.modelName) ?? 999;
      const rankB = modelRankings.get(b.modelName) ?? 999;
      return rankA - rankB;
    });
  }, [buddies, settings.hiddenModels, modelRankings, chosenModel]);

  const activeBuddyObj = visibleBuddies.find((b) => b.modelName === activeBuddy) ?? null;
  const activePersonality = useMemo(
    () =>
      settings.personalityProfiles.find((profile) => profile.id === settings.activePersonalityId)
      ?? settings.personalityProfiles.find((profile) => profile.id === DEFAULT_PERSONALITY_ID)
      ?? settings.personalityProfiles[0],
    [settings.activePersonalityId, settings.personalityProfiles],
  );
  const activeConversationKey = activeBuddy
    ? `${activeBuddy}::${activePersonality?.id ?? DEFAULT_PERSONALITY_ID}`
    : null;
  const activeMessages = useMemo(() => {
    if (!activeConversationKey) return [];
    if (messagesByModel[activeConversationKey]) return messagesByModel[activeConversationKey];
    if (activePersonality?.id === DEFAULT_PERSONALITY_ID && activeBuddy) {
      return messagesByModel[activeBuddy] ?? [];
    }
    return [];
  }, [activeBuddy, activeConversationKey, activePersonality?.id, messagesByModel]);
  // How much memory the active model is actually being given. "auto" sizes it
  // from the model's own limit against a KV budget; a pinned number is still
  // clamped to what the model declares, since asking beyond that does nothing.
  const activeContextInfo = activeBuddy ? contextInfo[activeBuddy] ?? null : null;
  const activeContextLimit = useMemo(() => {
    if (settings.contextSize === "auto") return chooseContextSize(activeContextInfo);
    if (!activeContextInfo) return settings.contextSize;
    return Math.min(settings.contextSize, activeContextInfo.maxContext);
  }, [settings.contextSize, activeContextInfo]);

  // Exact where Ollama has told us, estimated only for what it has not seen yet.
  //
  // A completed turn gives both halves: prompt_eval_count covers the system
  // prompt and every message up to that point, eval_count covers the reply. So
  // the only guesswork is whatever has been typed or added since — which is why
  // the mark is recorded against the message count it was measured at.
  const contextUsage = useMemo(() => {
    const measured = activeConversationKey ? tokenMarkByKey[activeConversationKey] : undefined;
    const estimateFrom = (index: number) => activeMessages
      .slice(index)
      .reduce((sum, message) => sum + estimateTokens(message.content), 0);

    const used = measured
      ? measured.promptTokens + measured.evalTokens + estimateFrom(measured.messageCount)
      : estimateFrom(0);

    return getContextUsage(used + estimateTokens(draft), activeContextLimit);
  }, [activeConversationKey, tokenMarkByKey, activeMessages, draft, activeContextLimit]);

  const assistantDisplayName = activePersonality?.name || activeBuddyObj?.displayName || "RigMatch Buddy";
  const assistantAvatarSrc = activePersonality?.avatarDataUrl;
  const normalizeHiddenModels = useCallback(
    (hiddenModels: string[]) => {
      const knownModels = new Set(buddies.map((b) => b.modelName));
      return Array.from(new Set(hiddenModels)).filter((model) => knownModels.has(model));
    },
    [buddies],
  );

  // ── Apply theme ───────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  // ── Fetch models ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setConnectionStatus("checking");
    try {
      const [models, version] = await Promise.all([
        listModels(settings.ollamaUrl),
        getVersion(settings.ollamaUrl),
      ]);
      const chatModels = deduplicateModels(models.filter((m) => !isEmbeddingModel(m.name)));
      setBuddies(chatModels.map(modelToBuddy));
      setOllamaVersion(version);
      setConnectionStatus("connected");
      if (chatModels.length > 0 && activeBuddy === null) {
        const bridge = loadCachedBridge();
        const modelNames = chatModels.map((m) => m.name);
        const topFromScores = Object.entries(bridge.scores).reduce<string | null>(
          (best, [model, score]) =>
            modelNames.includes(model) && (!best || score.total > (bridge.scores[best]?.total ?? 0))
              ? model
              : best,
          null,
        );
        const preferred = [bridge.chosen, topFromScores].find(
          (m): m is string => !!m && modelNames.includes(m),
        );
        setActiveBuddy(preferred ?? chatModels[0].name);
      }
    } catch {
      setBuddies([]);
      setOllamaVersion(null);
      setConnectionStatus("disconnected");
    }
  }, [settings.ollamaUrl, activeBuddy]);

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  useEffect(() => {
    if (connectionStatus !== "disconnected") return;
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [connectionStatus, refresh]);

  // ── RigMatch scores bridge ──────────────────────────────────────────────

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const raw = await invoke<Record<string, unknown>>("get_rig_scores");
        const payload: BridgePayload = (raw.scores && typeof raw.scores === "object")
          ? { scores: raw.scores as Record<string, ModelScore>, chosen: (raw.chosen as string | null) ?? null }
          : { scores: raw as Record<string, ModelScore>, chosen: null };
        setRigScores(payload.scores);
        setChosenModel(payload.chosen);
        saveCachedBridge(payload);
      } catch {
        // RigMatch not running — use cached scores from last session
      }
    };
    void fetchScores();
    const id = setInterval(() => void fetchScores(), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!settings.showSystemMonitor) {
      const id = window.setTimeout(() => {
        setSysStats(null);
        setVramUsedGb(null);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const poll = async () => {
      try {
        const stats = await invoke<SystemStats>("get_system_stats");
        setSysStats(stats);
      } catch { /* ignore */ }
      try {
        const gb = await invoke<number | null>("get_ollama_vram", { baseUrl: settings.ollamaUrl });
        setVramUsedGb(gb ?? null);
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [settings.showSystemMonitor, settings.ollamaUrl]);

  // ── Model memory ─────────────────────────────────────────────────────────

  // Read each model's declared context once, when it is first opened. Cached by
  // model name because it cannot change without the model itself changing, and
  // a null result is cached too so a model whose metadata lacks these fields is
  // not re-fetched on every switch.
  useEffect(() => {
    if (!activeBuddy || activeBuddy in contextInfo) return;
    let cancelled = false;
    void getModelContextInfo(settings.ollamaUrl, activeBuddy).then((info) => {
      if (!cancelled) setContextInfo((prev) => ({ ...prev, [activeBuddy]: info }));
    });
    return () => { cancelled = true; };
  }, [activeBuddy, contextInfo, settings.ollamaUrl]);

  // ── Persist conversations ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void loadConversations().then((loaded) => {
      if (cancelled) return;
      setMessagesByModel(loaded);
      setHistoryLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // One writer for the life of the app. Updates arrive once per streamed token;
  // this turns a burst of them into an occasional write, and keeps a failure
  // from reaching React — an unguarded write here used to trip the error
  // boundary on mount once localStorage was full, on every launch.
  const writerRef = useRef<ReturnType<typeof createWriteScheduler<ConversationMap>> | null>(null);
  if (!writerRef.current) {
    writerRef.current = createWriteScheduler<ConversationMap>({
      write: async (value) => {
        await writeConversationsFile(serializeStore(value));
        setPersistError(null);
      },
      onError: (error) => setPersistError(String((error as Error)?.message ?? error)),
    });
  }

  useEffect(() => {
    if (!historyLoaded) return;
    writerRef.current?.schedule(messagesByModel as ConversationMap);
  }, [messagesByModel, historyLoaded]);

  // The last few hundred milliseconds of a reply would otherwise be lost if the
  // window closed inside the coalescing window.
  useEffect(() => {
    const flush = () => { void writerRef.current?.flush(); };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  // ── Scroll transcript ─────────────────────────────────────────────────────

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeMessages, typingModel]);

  // ── Ding on message received ──────────────────────────────────────────────

  useEffect(() => {
    const prev = prevTypingRef.current;
    prevTypingRef.current = typingModel;
    if (prev !== null && typingModel === null) {
      playDing(settings.muted);
    }
  }, [typingModel, settings.muted]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    if (!activeBuddy || !activeConversationKey || !draft.trim() || typingModel) return;

    const userMsg: AppMessage = { id: genId(), role: "user", content: draft.trim(), ts: Date.now() };
    const history = messagesByModel[activeConversationKey]
      ?? (activePersonality?.id === DEFAULT_PERSONALITY_ID ? (messagesByModel[activeBuddy] ?? []) : []);
    const updatedHistory = [...history, userMsg];

    setMessagesByModel((prev) => ({ ...prev, [activeConversationKey]: updatedHistory }));
    setDraft("");
    setTypingModel(activeBuddy);

    const profilePrompt = [
      settings.systemPrompt.trim(),
      activePersonality?.instructions.trim()
        ? `Personality profile: ${activePersonality.name}\n${activePersonality.instructions.trim()}`
        : "",
      `You are currently powered by the local Ollama model "${activeBuddy}". Do not claim to be a different model.`,
    ].filter(Boolean).join("\n\n");
    const ollamaHistory: ChatMessage[] = [
      ...(profilePrompt
        ? [{ role: "system" as const, content: profilePrompt }]
        : []),
      ...updatedHistory.map((m) => ({ role: m.role, content: m.content })),
    ];
    const assistantId = genId();
    let accumulated = "";

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamChat(
        settings.ollamaUrl,
        activeBuddy,
        ollamaHistory,
        (token) => {
          accumulated += token;
          setMessagesByModel((prev) => {
            const msgs = prev[activeConversationKey] ?? [];
            const last = msgs[msgs.length - 1];
            if (last?.id === assistantId) {
              return { ...prev, [activeConversationKey]: [...msgs.slice(0, -1), { ...last, content: accumulated }] };
            }
            return {
              ...prev,
              [activeConversationKey]: [
                ...msgs,
                { id: assistantId, role: "assistant", content: accumulated, ts: Date.now() },
              ],
            };
          });
        },
        ctrl.signal,
        {
          numCtx: activeContextLimit,
          onDone: ({ promptTokens, evalTokens }) => {
            if (promptTokens <= 0) return;
            setTokenMarkByKey((prev) => ({
              ...prev,
              [activeConversationKey]: {
                promptTokens,
                evalTokens,
                // The assistant message only exists if something was streamed.
                messageCount: updatedHistory.length + (accumulated ? 1 : 0),
              },
            }));
          },
        },
      );
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setMessagesByModel((prev) => ({
          ...prev,
          [activeConversationKey]: [
            ...(prev[activeConversationKey] ?? []),
            {
              id: genId(),
              role: "assistant",
              content: "Something went wrong. Is Ollama still running?",
              ts: Date.now(),
            },
          ],
        }));
      }
    } finally {
      setTypingModel(null);
      // A finished reply is the natural point to be durable. The coalescing
      // window is only there to survive the stream itself, and Tauri's own
      // close button does not reliably raise beforeunload.
      void writerRef.current?.flush();
    }
  }, [
    activeBuddy,
    activeContextLimit,
    activeConversationKey,
    activePersonality,
    draft,
    messagesByModel,
    settings.ollamaUrl,
    settings.systemPrompt,
    typingModel,
  ]);

  /**
   * Stop the reply in progress. The abort reaches Ollama now, so the GPU is
   * actually released rather than carrying on with a reply nobody will read.
   * Whatever has already been streamed stays — it is a real partial answer, and
   * often the reason for stopping is that it was already enough.
   */
  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTypingModel(null);
    void writerRef.current?.flush();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  // ── Settings ──────────────────────────────────────────────────────────────

  const openSettings = () => {
    setDraftSettings(settings);
    setSettingsOpen(true);
  };

  const applySettings = () => {
    const rawUrl = draftSettings.ollamaUrl.trim() || "http://localhost:11434";
    try {
      assertLocalhostUrl(rawUrl);
    } catch (err) {
      alert(`Invalid Ollama URL: ${(err as Error).message}`);
      return;
    }
    const hiddenModels = normalizeHiddenModels(draftSettings.hiddenModels);
    const next: AppSettings = {
      ollamaUrl: rawUrl,
      userName: draftSettings.userName.trim() || "You",
      systemPrompt: draftSettings.systemPrompt,
      activePersonalityId: draftSettings.activePersonalityId,
      personalityProfiles: draftSettings.personalityProfiles,
      theme: draftSettings.theme,
      muted: draftSettings.muted,
      hiddenModels,
      showSystemMonitor: draftSettings.showSystemMonitor,
      contextSize: draftSettings.contextSize,
    };
    saveSettings(next);
    setSettings(next);
    if (activeBuddy && hiddenModels.includes(activeBuddy)) {
      setActiveBuddy(buddies.find((b) => !hiddenModels.includes(b.modelName))?.modelName ?? null);
    }
    setSettingsOpen(false);
    void refresh();
  };

  const toggleHideModel = (modelName: string) => {
    setDraftSettings((s) => ({
      ...s,
      hiddenModels: s.hiddenModels.includes(modelName)
        ? s.hiddenModels.filter((m) => m !== modelName)
        : Array.from(new Set([...s.hiddenModels, modelName])),
    }));
  };

  const showAllModels = () => {
    setDraftSettings((s) => ({ ...s, hiddenModels: [] }));
  };

  const clearAllHistory = () => {
    setMessagesByModel({});
    setTokenMarkByKey({});
    // Straight to disk rather than through the coalescing window: "clear my
    // history" should not still be on disk if the app closes a moment later.
    writerRef.current?.schedule({});
    void writerRef.current?.flush();
  };

  // Hide a model immediately (outside settings flow — from profile popup)
  const hideModelNow = (modelName: string) => {
    const next = { ...settings, hiddenModels: normalizeHiddenModels([...settings.hiddenModels, modelName]) };
    saveSettings(next);
    setSettings(next);
    setDraftSettings(next);
    if (activeBuddy === modelName) setActiveBuddy(null);
    setProfileModal(null);
  };

  const applyPersonalitySettings = (nextSettings: AppSettings) => {
    saveSettings(nextSettings);
    setSettings(nextSettings);
    setDraftSettings(nextSettings);
  };

  const selectPersonality = (id: string) => {
    const next = { ...settings, activePersonalityId: id };
    applyPersonalitySettings(next);
  };

  const openNewPersonality = () => {
    setPersonalityEditor({
      id: null,
      name: "Custom Buddy",
      instructions: "Answer in a helpful, clear style.",
    });
  };

  const openEditPersonality = (profile: PersonalityProfile) => {
    setPersonalityEditor({
      id: profile.id,
      name: profile.name,
      instructions: profile.instructions,
      avatarDataUrl: profile.avatarDataUrl,
      builtIn: profile.builtIn,
    });
  };

  const savePersonality = () => {
    if (!personalityEditor) return;
    const name = personalityEditor.name.trim() || "Custom Buddy";
    const id = personalityEditor.id ?? `custom-${Date.now().toString(36)}`;
    const nextProfile: PersonalityProfile = {
      id,
      name: name.slice(0, 40),
      instructions: personalityEditor.instructions.trim(),
      avatarDataUrl: personalityEditor.avatarDataUrl,
      builtIn: personalityEditor.builtIn,
    };
    const profiles = settings.personalityProfiles.some((profile) => profile.id === id)
      ? settings.personalityProfiles.map((profile) => (profile.id === id ? nextProfile : profile))
      : [...settings.personalityProfiles, nextProfile];
    const next = {
      ...settings,
      activePersonalityId: id,
      personalityProfiles: profiles,
    };
    applyPersonalitySettings(next);
    setPersonalityEditor(null);
  };

  const deletePersonality = (id: string) => {
    const profile = settings.personalityProfiles.find((item) => item.id === id);
    if (!profile || profile.builtIn) return;
    if (!window.confirm(`Delete personality profile "${profile.name}"?`)) return;
    const profiles = settings.personalityProfiles.filter((item) => item.id !== id);
    const next = {
      ...settings,
      activePersonalityId: settings.activePersonalityId === id ? DEFAULT_PERSONALITY_ID : settings.activePersonalityId,
      personalityProfiles: profiles,
    };
    applyPersonalitySettings(next);
    setPersonalityEditor(null);
  };

  const handleAvatarUpload = (file: File | undefined) => {
    if (!file) return;
    if (!AVATAR_IMAGE_TYPES.has(file.type)) {
      alert("Use a PNG, JPEG, WebP, or GIF avatar image.");
      return;
    }
    if (file.size > 700_000) {
      alert("Avatar image is too large. Use an image under 700 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : undefined;
      if (result) {
        setPersonalityEditor((draftProfile) =>
          draftProfile ? { ...draftProfile, avatarDataUrl: result } : draftProfile,
        );
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const cpuClass = sysStats
    ? sysStats.cpuPercent > 85 ? "hot" : sysStats.cpuPercent > 60 ? "warm" : ""
    : "";
  const ramPct = sysStats ? sysStats.ramUsedGb / sysStats.ramTotalGb : 0;
  const ramClass = ramPct > 0.88 ? "hot" : ramPct > 0.70 ? "warm" : "";

  return (
    <div className="rm-app" data-theme={settings.theme}>

      {/* ── Custom Title Bar ───────────────────────────────────────── */}
      <div className="rm-titlebar" data-tauri-drag-region>
        <span className="rm-titlebar-title" data-tauri-drag-region>⚡ RigMatch Chat</span>
        <div className="rm-titlebar-controls">
          <button
            type="button"
            className="rm-titlebar-btn minimize"
            onClick={() => getCurrentWindow().minimize()}
            aria-label="Minimize"
          >−</button>
          <button
            type="button"
            className="rm-titlebar-btn close"
            // Land anything still inside the coalescing window before the
            // webview goes away.
            onClick={() => { void writerRef.current?.flush().finally(() => getCurrentWindow().close()); }}
            aria-label="Close"
          >×</button>
        </div>
      </div>

      {/* Saving failing is worth saying out loud — the alternative is a chat
          that looks fine and is gone at the next launch. It used to crash the
          app instead, which at least you noticed. */}
      {persistError && (
        <div className="rm-persist-warning" role="status">
          Your conversations are not being saved right now — {persistError}. Everything on screen is
          still here until you close the app.
        </div>
      )}

      {/* ── System Monitor Bar ─────────────────────────────────────── */}
      {settings.showSystemMonitor && sysStats && (
        <div className="rm-system-bar">
          <span className={`rm-sys-stat ${cpuClass}`}>
            CPU <strong>{Math.round(sysStats.cpuPercent)}%</strong>
          </span>
          <span className="rm-sys-divider" />
          <span className={`rm-sys-stat ${ramClass}`}>
            RAM <strong>{sysStats.ramUsedGb.toFixed(1)}</strong>
            <em>/ {Math.round(sysStats.ramTotalGb)} GB</em>
          </span>
          {vramUsedGb !== null && (
            <>
              <span className="rm-sys-divider" />
              <span className="rm-sys-stat" title="VRAM used by loaded Ollama models">
                VRAM <strong>{vramUsedGb.toFixed(1)} GB</strong>
              </span>
            </>
          )}
        </div>
      )}

      <div className="rm-content">
      {/* ── Buddy List ─────────────────────────────────────────────── */}
      <aside className="rm-buddy-panel">
        <div className="rm-buddy-panel-header">
          <div className="rm-logo">
            <span className="rm-logo-badge">⚡</span>
            <div>
              <strong>RigMatch Chat</strong>
              <em>{settings.userName}</em>
            </div>
          </div>
          <span className={`rm-conn-dot ${connectionStatus}`} title={connectionStatus} />
        </div>

        <div className="rm-status-bar">
          {connectionStatus === "connected"
            ? `Ollama ${ollamaVersion ? `v${ollamaVersion}` : ""} · ${buddies.length} model${buddies.length !== 1 ? "s" : ""} online`
            : connectionStatus === "checking"
              ? "Connecting to Ollama…"
              : "Ollama not found — retrying…"}
        </div>
        {(chosenModel || modelRankings.size > 0) && (
          <div className="rm-badge-legend">
            <span title="Your Top Pick from RigMatch">⭐ Top Pick</span>
            <span title="Ranked by RigMatch score">🥇 Rank 1–3</span>
            <span title="Low hardware fit — may be slow">⚠ Low fit</span>
          </div>
        )}

        <div className="rm-buddy-list">
          {visibleBuddies.length === 0 && connectionStatus === "connected" && (
            <div className="rm-buddy-empty">
              <p>No models visible.</p>
              <p>Check Settings to unhide models, or open <strong>RigMatch</strong> to download one.</p>
            </div>
          )}
          {visibleBuddies.map((buddy) => {
            const buddyConversationKey = `${buddy.modelName}::${activePersonality?.id ?? DEFAULT_PERSONALITY_ID}`;
            const msgs = messagesByModel[buddyConversationKey]
              ?? (activePersonality?.id === DEFAULT_PERSONALITY_ID ? (messagesByModel[buddy.modelName] ?? []) : []);
            const lastMsg = msgs[msgs.length - 1];
            const isActive = buddy.modelName === activeBuddy;
            const isTyping = typingModel === buddy.modelName;
            const score = rigScores[buddy.modelName];
            const isChosen = buddy.modelName === chosenModel;
            return (
              <button
                key={buddy.modelName}
                type="button"
                className={`rm-buddy-item${isActive ? " active" : ""}${isChosen ? " rm-buddy-chosen" : ""}`}
                onClick={() => setActiveBuddy(buddy.modelName)}
                onDoubleClick={() => setProfileModal(buddy)}
              >
                <div className="rm-buddy-avatar-wrap">
                  <BuddyAvatar family={buddy.avatarFamily} isTyping={isTyping} />
                  <span className={`rm-online-dot${connectionStatus === "connected" ? " online" : ""}`} />
                </div>
                <div className="rm-buddy-info">
                  <span className="rm-buddy-name">
                    {isChosen && (
                      <span className="rm-chosen-badge" title="Your Top Pick from RigMatch">⭐</span>
                    )}
                    {modelRankings.has(buddy.modelName) && (
                      <span className="rm-rank-medal" title={`Ranked #${modelRankings.get(buddy.modelName)} by RigMatch score`}>
                        {RANK_MEDALS[modelRankings.get(buddy.modelName)!]}
                      </span>
                    )}
                    {score && score.fit < 40 && (
                      <span className="rm-out-of-league" title="Low hardware fit score from RigMatch — may be slow on this rig">⚠</span>
                    )}
                    {buddy.displayName}
                  </span>
                  <span className="rm-buddy-score-line">
                    {score && score.grade != null
                      ? <><span className={`rm-score-inline rm-score-${String(score.grade).replace('+', 'plus').replace('-', 'minus')}`}>{score.total} · {score.grade}</span><span className="rm-response-time">{getResponseLabel(score, buddy.sizeGb)}</span></>
                      : <span className="rm-response-time">{buddy.sizeGb} GB · {getResponseLabel(undefined, buddy.sizeGb)}</span>
                    }
                  </span>
                  {(isTyping || lastMsg) && (
                    <span className="rm-buddy-last">
                      {isTyping
                        ? "typing…"
                        : lastMsg
                          ? (lastMsg.role === "user" ? `You: ${lastMsg.content}` : lastMsg.content).slice(0, 42)
                          : null}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="rm-buddy-panel-footer">
          <button
            type="button"
            className="rm-open-rigmatch-btn"
            title="Open RigMatch — benchmark and rank your models"
            onClick={() => void invoke("open_rigmatch_ai").catch(() => undefined)}
          >
            ⚡ RigMatch
          </button>
          <div className="rm-buddy-panel-footer-row">
            <button type="button" className="rm-settings-btn" onClick={openSettings}>
              ⚙ Settings
            </button>
            <button
              type="button"
              className="rm-donate-btn"
              title="Support RigMatch development"
              onClick={() => window.open("https://buymeacoffee.com/daveeuson", "_blank", "noopener,noreferrer")}
            >
              ☕
            </button>
            <button type="button" className="rm-refresh-btn" onClick={() => void refresh()}>↻</button>
          </div>
        </div>
      </aside>

      {/* ── Chat Panel ─────────────────────────────────────────────── */}
      <main className="rm-chat-panel">
        {activeBuddyObj ? (
          <>
            <div className="rm-chat-header">
              <BuddyAvatar
                family={activeBuddyObj.avatarFamily}
                customSrc={assistantAvatarSrc}
                alt={assistantDisplayName}
                isTyping={typingModel === activeBuddy}
                size="sm"
              />
              <div className="rm-chat-header-info">
                <strong>
                  {activeBuddy && modelRankings.has(activeBuddy) && (
                    <span className="rm-rank-medal" title={`Ranked #${modelRankings.get(activeBuddy)} by RigMatch score`}>{RANK_MEDALS[modelRankings.get(activeBuddy)!]}</span>
                  )}
                  {assistantDisplayName}
                </strong>
                <em>
                  {typingModel === activeBuddy
                    ? "typing…"
                    : connectionStatus === "connected"
                      ? `using ${activeBuddyObj.displayName} through Ollama`
                      : "Offline"}
                </em>
              </div>
              <ContextMeter usage={contextUsage} info={activeContextInfo} limit={activeContextLimit} />
              <span className="rm-chat-header-model" title="Actual local Ollama model">
                MODEL {activeBuddyObj.modelName}
              </span>
            </div>

            <div className="rm-personality-bar">
              <div className="rm-personality-select-wrap">
                <span>Personality</span>
                <select
                  className="rm-personality-select"
                  value={settings.activePersonalityId}
                  onChange={(event) => selectPersonality(event.target.value)}
                >
                  {settings.personalityProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="rm-profile-tool-btn"
                onClick={() => activePersonality && openEditPersonality(activePersonality)}
              >
                Edit
              </button>
              <button type="button" className="rm-profile-tool-btn" onClick={openNewPersonality}>
                New
              </button>
            </div>

            <div className="rm-transcript" ref={transcriptRef}>
              {activeMessages.length === 0 && (
                <div className="rm-transcript-empty">
                  <BuddyAvatar
                    family={activeBuddyObj.avatarFamily}
                    customSrc={assistantAvatarSrc}
                    alt={assistantDisplayName}
                    size="lg"
                  />
                  <p>
                    Start a conversation with <strong>{assistantDisplayName}</strong>.
                  </p>
                  <p className="rm-transcript-hint">
                    Personality profile on top of {activeBuddyObj.modelName} · No data leaves your computer
                  </p>
                </div>
              )}
              {activeMessages.map((msg) => (
                <div key={msg.id} className={`rm-message rm-message-${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="rm-message-avatar">
                      <BuddyAvatar
                        family={activeBuddyObj.avatarFamily}
                        customSrc={assistantAvatarSrc}
                        alt={assistantDisplayName}
                        size="sm"
                      />
                    </div>
                  )}
                  <div className="rm-message-bubble">
                    <div className="rm-message-sender">
                      {msg.role === "user" ? settings.userName : assistantDisplayName}
                    </div>
                    {msg.role === "assistant" ? (
                      <div
                        className="rm-message-text rm-message-md"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    ) : (
                      <div className="rm-message-text">{msg.content}</div>
                    )}
                    <div className="rm-message-time">
                      {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              {typingModel === activeBuddy && (
                <div className="rm-message rm-message-assistant">
                  <div className="rm-message-avatar">
                    <BuddyAvatar
                      family={activeBuddyObj.avatarFamily}
                      customSrc={assistantAvatarSrc}
                      alt={assistantDisplayName}
                      isTyping
                      size="sm"
                    />
                  </div>
                  <div className="rm-message-bubble">
                    <div className="rm-typing-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rm-compose">
              <textarea
                className="rm-compose-input"
                placeholder={`Message ${assistantDisplayName} using ${activeBuddyObj.modelName}...`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                /* Not disabled while a reply streams — there is no reason you
                   cannot write the next message while waiting for this one. */
              />
              {typingModel ? (
                <button
                  type="button"
                  className="rm-send-btn rm-stop-btn"
                  onClick={stopGenerating}
                  title="Stop this reply and free the graphics card"
                >
                  ■ Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="rm-send-btn"
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim()}
                >
                  Send
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="rm-chat-empty">
            <div className="rm-chat-empty-inner">
              <span className="rm-chat-empty-icon">⚡</span>
              <strong>RigMatch Chat</strong>
              {connectionStatus === "disconnected" ? (
                <p>Ollama is not running. Start it then click ↻ to reconnect.</p>
              ) : connectionStatus === "checking" ? (
                <p>Connecting to Ollama…</p>
              ) : buddies.length === 0 ? (
                <p>
                  No models installed. Open <strong>RigMatch</strong> to download your first model.
                </p>
              ) : (
                <p>Select a buddy from the list to start chatting.</p>
              )}
            </div>
          </div>
        )}
      </main>
      </div>

      {/* ── Buddy Profile Modal ─────────────────────────────────────── */}
      {profileModal && (() => {
        const pb = profileModal;
        const score = rigScores[pb.modelName];
        const rank = modelRankings.get(pb.modelName);
        const isChosen = pb.modelName === chosenModel;
        return (
          <div className="rm-modal-backdrop" onClick={() => setProfileModal(null)}>
            <div className="rm-profile-modal" onClick={(e) => e.stopPropagation()}>
              <div className="rm-profile-header">
                <span className="rm-profile-aim-bar">
                  <span className="rm-profile-aim-dot" />
                  <span className="rm-profile-aim-dot" />
                  <span className="rm-profile-aim-dot" />
                  buddy info
                </span>
                <button type="button" className="rm-settings-close" onClick={() => setProfileModal(null)}>✕</button>
              </div>
              <div className="rm-profile-body">
                <BuddyAvatar family={pb.avatarFamily} size="lg" />
                <div className="rm-profile-name-row">
                  {isChosen && <span className="rm-chosen-badge" title="Your Top Pick from RigMatch">⭐</span>}
                  {rank !== undefined && <span className="rm-rank-medal" title={`Ranked #${rank} by RigMatch score`}>{RANK_MEDALS[rank]}</span>}
                  <strong className="rm-profile-name">{pb.displayName}</strong>
                </div>
                <div className="rm-profile-model-id">{pb.modelName}</div>
                <div className="rm-profile-stats">
                  {score ? (
                    <>
                      <div className="rm-profile-stat">
                        <span>Match Score</span>
                        <strong className={`rm-score-inline rm-score-${String(score.grade ?? '').replace('+','plus').replace('-','minus')}`}>{score.total} · {score.grade}</strong>
                      </div>
                      <div className="rm-profile-stat">
                        <span>Speed</span>
                        <strong>{speedToToks(score.speed)}</strong>
                      </div>
                      <div className="rm-profile-stat">
                        <span>Sobriety</span>
                        <strong>{score.sobriety}</strong>
                      </div>
                      <div className="rm-profile-stat">
                        <span>Fit</span>
                        <strong>{score.fit}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="rm-profile-stat rm-profile-untested">Not tested yet in RigMatch</div>
                  )}
                  <div className="rm-profile-stat">
                    <span>Response Time</span>
                    <strong>{getResponseLabel(score, pb.sizeGb)}</strong>
                  </div>
                  <div className="rm-profile-stat">
                    <span>Size</span>
                    <strong>{pb.sizeGb > 0 ? `${pb.sizeGb} GB` : "—"}</strong>
                  </div>
                </div>
                <div className="rm-profile-actions">
                  <button
                    type="button"
                    className="rm-btn-primary"
                    onClick={() => { setActiveBuddy(pb.modelName); setProfileModal(null); }}
                  >
                    💬 Chat Now
                  </button>
                  <button
                    type="button"
                    className="rm-btn-danger rm-btn-sm"
                    onClick={() => hideModelNow(pb.modelName)}
                  >
                    Hide from list
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Personality Editor Modal ──────────────────────────────── */}
      {personalityEditor && (
        <div className="rm-modal-backdrop" onClick={() => setPersonalityEditor(null)}>
          <div className="rm-personality-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rm-settings-header">
              <strong>{personalityEditor.id ? "Edit Personality" : "New Personality"}</strong>
              <button type="button" className="rm-settings-close" onClick={() => setPersonalityEditor(null)}>
                x
              </button>
            </div>

            <div className="rm-personality-body">
              <div className="rm-personality-preview">
                <BuddyAvatar
                  family={activeBuddyObj?.avatarFamily ?? "generic"}
                  customSrc={personalityEditor.avatarDataUrl}
                  alt={personalityEditor.name}
                  size="lg"
                />
                <div>
                  <strong>{personalityEditor.name || "Custom Buddy"}</strong>
                  <span>
                    Uses actual model: <b>{activeBuddyObj?.modelName ?? "selected Ollama model"}</b>
                  </span>
                </div>
              </div>

              <label className="rm-settings-field">
                <span>Profile name</span>
                <input
                  type="text"
                  value={personalityEditor.name}
                  onChange={(event) =>
                    setPersonalityEditor((profile) =>
                      profile ? { ...profile, name: event.target.value } : profile,
                    )
                  }
                  placeholder="Helpful Coder"
                />
              </label>

              <label className="rm-settings-field">
                <span>Personality instructions</span>
                <textarea
                  className="rm-settings-textarea"
                  value={personalityEditor.instructions}
                  onChange={(event) =>
                    setPersonalityEditor((profile) =>
                      profile ? { ...profile, instructions: event.target.value } : profile,
                    )
                  }
                  placeholder="Describe tone, role, formatting preferences, and boundaries for this chat personality."
                  rows={5}
                />
                <em>These instructions are sent as a system message before the chat history.</em>
              </label>

              <div className="rm-avatar-tools">
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(event) => {
                    handleAvatarUpload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="rm-btn-secondary"
                  onClick={() => avatarFileRef.current?.click()}
                >
                  Upload avatar
                </button>
                <button
                  type="button"
                  className="rm-btn-secondary"
                  disabled={!personalityEditor.avatarDataUrl}
                  onClick={() =>
                    setPersonalityEditor((profile) =>
                      profile ? { ...profile, avatarDataUrl: undefined } : profile,
                    )
                  }
                >
                  Clear avatar
                </button>
              </div>

              <div className="rm-model-truth-card">
                <strong>Model stays visible</strong>
                <span>
                  This profile changes name, avatar, and behavior only. Responses still come from the selected
                  local Ollama model shown in the chat header.
                </span>
              </div>
            </div>

            <div className="rm-settings-footer">
              {personalityEditor.id && !personalityEditor.builtIn && (
                <button
                  type="button"
                  className="rm-btn-danger"
                  onClick={() => personalityEditor.id && deletePersonality(personalityEditor.id)}
                >
                  Delete
                </button>
              )}
              <button type="button" className="rm-btn-secondary" onClick={() => setPersonalityEditor(null)}>
                Cancel
              </button>
              <button type="button" className="rm-btn-primary" onClick={savePersonality}>
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal ──────────────────────────────────────────── */}
      {settingsOpen && (
        <div className="rm-modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="rm-settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rm-settings-header">
              <strong>RigMatch Chat Settings</strong>
              <button type="button" className="rm-settings-close" onClick={() => setSettingsOpen(false)}>
                ✕
              </button>
            </div>

            <div className="rm-settings-body">

              {/* ── Appearance ── */}
              <div className="rm-settings-section-label">Appearance</div>
              <div className="rm-settings-row">
                <button
                  type="button"
                  className={`rm-theme-btn${draftSettings.theme === "dark" ? " active" : ""}`}
                  onClick={() => setDraftSettings((s) => ({ ...s, theme: "dark" }))}
                >
                  🌙 Dark
                </button>
                <button
                  type="button"
                  className={`rm-theme-btn${draftSettings.theme === "light" ? " active" : ""}`}
                  onClick={() => setDraftSettings((s) => ({ ...s, theme: "light" }))}
                >
                  ☀️ Light
                </button>
              </div>

              {/* ── Sound ── */}
              <div className="rm-settings-section-label">Sound</div>
              <label className="rm-settings-toggle">
                <input
                  type="checkbox"
                  checked={draftSettings.muted}
                  onChange={(e) => setDraftSettings((s) => ({ ...s, muted: e.target.checked }))}
                />
                <span>Mute all sounds</span>
              </label>

              {/* ── Memory ── */}
              <div className="rm-settings-section-label">Memory</div>
              <label className="rm-settings-field">
                <span>How much each chat can remember</span>
                <select
                  value={String(draftSettings.contextSize)}
                  onChange={(e) => setDraftSettings((s) => ({
                    ...s,
                    contextSize: e.target.value === "auto" ? "auto" : Number(e.target.value),
                  }))}
                >
                  <option value="auto">
                    Auto — as much as fits comfortably{activeContextInfo ? ` (${formatContextSize(chooseContextSize(activeContextInfo))} for ${activeBuddyObj?.displayName ?? "this model"})` : ""}
                  </option>
                  {CONTEXT_STEPS.map((size) => (
                    <option key={size} value={size}>
                      {formatContextSize(size)} tokens
                      {activeContextInfo ? ` — about ${formatGib(kvCacheBytes(activeContextInfo, size))} of video memory` : ""}
                      {activeContextInfo && size > activeContextInfo.maxContext ? " (beyond this model's limit)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="rm-settings-hint">
                A bigger window remembers more of the conversation but reserves more video memory and
                makes each reply take longer to start. Past the limit the oldest messages drop out of
                the model's memory, even though they stay on screen.
              </p>

              {/* ── System Monitor ── */}
              <div className="rm-settings-section-label">System</div>
              <label className="rm-settings-toggle">
                <input
                  type="checkbox"
                  checked={draftSettings.showSystemMonitor}
                  onChange={(e) => setDraftSettings((s) => ({ ...s, showSystemMonitor: e.target.checked }))}
                />
                <span>Show CPU &amp; RAM monitor bar</span>
              </label>

              {/* ── Profile ── */}
              <div className="rm-settings-section-label">Profile</div>
              <label className="rm-settings-field">
                <span>Your name</span>
                <input
                  type="text"
                  value={draftSettings.userName}
                  onChange={(e) => setDraftSettings((s) => ({ ...s, userName: e.target.value }))}
                  placeholder="You"
                />
              </label>

              {/* ── Connection ── */}
              <div className="rm-settings-section-label">Connection</div>
              <label className="rm-settings-field">
                <span>Ollama URL</span>
                <input
                  type="text"
                  value={draftSettings.ollamaUrl}
                  onChange={(e) => setDraftSettings((s) => ({ ...s, ollamaUrl: e.target.value }))}
                  placeholder="http://localhost:11434"
                />
                <em>Default: http://localhost:11434</em>
              </label>

              {/* ── System Prompt ── */}
              <div className="rm-settings-section-label">Default System Prompt</div>
              <label className="rm-settings-field">
                <span>
                  Sent at the start of every conversation. Paste context from another AI that already knows you to
                  personalize every chat.
                </span>
                <textarea
                  className="rm-settings-textarea"
                  value={draftSettings.systemPrompt}
                  onChange={(e) => setDraftSettings((s) => ({ ...s, systemPrompt: e.target.value }))}
                  placeholder="e.g. You are a helpful assistant. Keep responses concise and practical…"
                  rows={4}
                />
              </label>

              {/* ── Hidden Models ── */}
              {buddies.length > 0 && (
                <>
                  <div className="rm-settings-section-label">Visible Models</div>
                  <div className="rm-visible-models-tools">
                    <span>{buddies.length - normalizeHiddenModels(draftSettings.hiddenModels).length} of {buddies.length} shown</span>
                    <button type="button" className="rm-settings-mini-btn" onClick={showAllModels} disabled={draftSettings.hiddenModels.length === 0}>
                      Show all
                    </button>
                  </div>
                  <p className="rm-settings-help">Click a buddy to show or hide it. Save applies the visible roster immediately.</p>
                  <div className="rm-hide-model-list">
                    {buddies.map((b) => {
                      const isVisible = !draftSettings.hiddenModels.includes(b.modelName);
                      const rank = modelRankings.get(b.modelName);
                      return (
                        <div
                          key={b.modelName}
                          role="switch"
                          aria-checked={isVisible}
                          className={`rm-hide-model-item${isVisible ? " rm-model-visible" : " rm-model-hidden"}`}
                          onClick={() => toggleHideModel(b.modelName)}
                          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") toggleHideModel(b.modelName); }}
                          tabIndex={0}
                        >
                          <span className="rm-model-toggle" aria-hidden="true">{isVisible ? "✓" : ""}</span>
                          <span className="rm-hide-model-name">
                            {rank !== undefined && <span className="rm-rank-medal" title={`Ranked #${rank} by RigMatch score`}>{RANK_MEDALS[rank]}</span>}
                            {b.displayName}
                          </span>
                          <em className="rm-hide-model-size">{b.sizeGb > 0 ? `${b.sizeGb} GB` : ""}</em>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── Danger Zone ── */}
              <div className="rm-settings-section-label rm-settings-danger-label">Data</div>
              <button
                type="button"
                className="rm-btn-danger"
                onClick={() => {
                  if (window.confirm("Delete all chat history? This cannot be undone.")) {
                    clearAllHistory();
                    setSettingsOpen(false);
                  }
                }}
              >
                🗑 Delete All Chat History
              </button>
            </div>

            <div className="rm-settings-footer">
              <button type="button" className="rm-btn-secondary" onClick={() => setSettingsOpen(false)}>
                Cancel
              </button>
              <button type="button" className="rm-btn-primary" onClick={applySettings}>
                Save &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
