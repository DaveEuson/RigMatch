// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { listModels, streamChat, getVersion, getModelContextInfo, getVramInfo, readConversationsFile, writeConversationsFile, readMemoriesFile, writeMemoriesFile, assertLocalhostUrl, type OllamaModel, type ChatMessage } from "./lib/ollamaApi";
import { createWriteScheduler } from "./lib/writeScheduler";
import {
  KEEP_RECENT_MESSAGES,
  buildContextMessages,
  buildSummaryRequest,
  compactionSplit,
  continuationTitle,
  pickSummarizer,
  type SummarizerChoice,
} from "./lib/compaction";
import { buildSessionNote } from "./lib/sessionNote";
import {
  addMemory,
  buildMemoryNote,
  parseMemories,
  removeMemory,
  serializeMemories,
  setMemoryEnabled,
  updateMemory,
  type Memory,
} from "./lib/memory";
import {
  conversationsForModel,
  createConversation,
  deriveTitle,
  migrateV1,
  parseStore,
  serializeStore,
  withMessages,
  type Conversation,
} from "./lib/conversationStore";
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
  kvBudgetFromVram,
  kvCacheBytes,
  type ModelContextInfo,
  type VramInfo,
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

/**
 * A generated picture in the transcript.
 *
 * The bytes are asked for once and remembered in memory for the session; the
 * conversation on disk holds only the path. That means a picture made last week
 * shows as its filename rather than as an image, which is the honest trade for
 * a history that does not grow by a quarter-megabyte per picture — and the file
 * is still there, where the caption says it is.
 */
function GeneratedImage({
  path,
  jobId,
  bytes,
  onLoaded,
}: {
  path: string;
  jobId?: string;
  bytes?: string;
  onLoaded: (jobId: string, dataUrl: string) => void;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!jobId || bytes || failed) return;
    void (async () => {
      try {
        const result = await invoke<{ dataUrl?: string }>("get_rig_generation_image", { id: jobId });
        if (result?.dataUrl) onLoaded(jobId, result.dataUrl);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    })();
  }, [jobId, bytes, failed, onLoaded]);

  return (
    <div className="rm-generated-image">
      {bytes ? <img src={bytes} alt={path} /> : null}
      <span className="rm-generated-path" title={path}>
        {failed && !bytes ? "Saved to " : bytes ? "Saved to " : "Saving to "}
        {path}
      </span>
    </div>
  );
}

type AppMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  /**
   * Where a generated picture was saved, never the picture itself.
   *
   * Conversations are written to a file on every change; putting a
   * quarter-megabyte image in one would grow history without limit, and this
   * app has filled its storage once already. The bytes are fetched from
   * RigMatch when the message is shown and kept only in memory.
   */
  imagePath?: string;
  /** The job the picture came from, for asking RigMatch to hand the bytes over. */
  imageJobId?: string;
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

/** Stable empty list, so "no conversation open" does not remount the transcript. */
const EMPTY_MESSAGES: AppMessage[] = [];

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
async function loadConversations(): Promise<Conversation[]> {
  const options = {
    makeId: (index: number) => `${Date.now().toString(36)}-migrated-${index}`,
    now: Date.now(),
    defaultPersonalityId: DEFAULT_PERSONALITY_ID,
  };

  try {
    // Handles both the v1 map and the v2 list, so a file written by any
    // previous build is carried forward rather than replaced.
    const fromFile = parseStore(await readConversationsFile(), options);
    if (fromFile) return fromFile;
  } catch {
    // Fall through to the legacy store; an unreadable file must not lose it.
  }

  // Older still: the original localStorage map, from before history moved to
  // a file at all.
  let migrated: Conversation[];
  try {
    const legacyRaw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!legacyRaw) return [];
    migrated = migrateV1(JSON.parse(legacyRaw) as Record<string, unknown>, options.makeId, options.now, DEFAULT_PERSONALITY_ID);
  } catch {
    return [];
  }
  if (migrated.length === 0) return [];

  try {
    await writeConversationsFile(serializeStore(migrated));
    localStorage.removeItem(CONVERSATIONS_KEY);
  } catch {
    // Keep the legacy copy and try again next launch.
  }
  return migrated;
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

/** Relative for anything recent, then a date — how you look for an old thread. */
function formatWhen(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

/**
 * The line in the transcript where the model's memory begins.
 *
 * Everything above it was said, is still on screen, and is no longer in front
 * of the model — these notes stand in for it. Marking the boundary is the whole
 * difference between compacting and what Ollama was doing silently.
 */
function SummaryMarker({ conversation }: { conversation: Conversation }) {
  const [open, setOpen] = useState(false);
  const count = conversation.summarizedCount ?? 0;
  return (
    <div className="rm-summary-marker">
      <button type="button" className="rm-summary-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="rm-summary-rule" aria-hidden="true" />
        <span className="rm-summary-label">
          {count > 0
            ? `${count} earlier message${count === 1 ? "" : "s"} summarised`
            : "Continued from an earlier chat"}
          {conversation.summaryBy ? ` · by ${getDisplayName(conversation.summaryBy)}` : ""}
          {open ? " ▴" : " ▾"}
        </span>
        <span className="rm-summary-rule" aria-hidden="true" />
      </button>
      {open && <div className="rm-summary-body">{conversation.summary}</div>}
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  /** Models whose thread list is unfolded in the sidebar. */
  const [expandedModels, setExpandedModels] = useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Conversation | null>(null);
  // Standing memory: facts the user asked to be carried across conversations.
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [compacting, setCompacting] = useState(false);
  const [compactError, setCompactError] = useState<string | null>(null);
  // A summary waiting to be accepted. Held rather than applied, because a bad
  // summary quietly poisons every later reply and only the user can tell.
  const [compactPlan, setCompactPlan] = useState<{
    conversationId: string;
    upTo: number;
    summary: string;
    by: SummarizerChoice;
  } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [typingModel, setTypingModel] = useState<string | null>(null);
  // Each model's declared memory, read once per model from /api/show.
  const [contextInfo, setContextInfo] = useState<Record<string, ModelContextInfo | null>>({});
  // What the machine has, read once. Null when it cannot be determined, which
  // keeps the fixed budget rather than sizing against a guess.
  const [vram, setVram] = useState<VramInfo | null>(null);
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
  const [generatingImage, setGeneratingImage] = useState(false);
  const [rigCapabilities, setRigCapabilities] = useState<Record<string, string[]>>({});
  /** What RigMatch would actually make a picture with, if asked right now. */
  const [imageMaker, setImageMaker] = useState<{ ready: boolean; checkpoint: string | null }>(
    { ready: false, checkpoint: null },
  );
  /** Narrow the list to one ability. 'all' is the resting state. */
  const [capabilityFilter, setCapabilityFilter] = useState<"all" | "text" | "vision" | "audio" | "image">("all");
  /** Fetched bytes, keyed by job — memory only, never written to history. */
  const [imageBytes, setImageBytes] = useState<Record<string, string>>({});
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
    const filtered = buddies
      .filter((b) => !settings.hiddenModels.includes(b.modelName))
      // Narrowed by ability, when asked. Hiding a model the user chose to keep
      // visible is only acceptable while a filter is plainly switched on, which
      // is why the control sits directly above the list rather than in Settings.
      // "Make a picture" is not something any model here does, so that filter
      // empties the list on purpose and the maker card takes its place.
      .filter((b) => capabilityFilter !== "image"
        && (capabilityFilter === "all"
          || (rigCapabilities[b.modelName] ?? []).includes(capabilityFilter)));
    return [...filtered].sort((a, b) => {
      const aChosen = a.modelName === chosenModel ? 0 : 1;
      const bChosen = b.modelName === chosenModel ? 0 : 1;
      if (aChosen !== bChosen) return aChosen - bChosen;
      const rankA = modelRankings.get(a.modelName) ?? 999;
      const rankB = modelRankings.get(b.modelName) ?? 999;
      return rankA - rankB;
    });
  }, [buddies, settings.hiddenModels, modelRankings, chosenModel, capabilityFilter, rigCapabilities]);

  const activeBuddyObj = visibleBuddies.find((b) => b.modelName === activeBuddy) ?? null;
  // The open thread's own personality wins, falling back to the app default for
  // a model with nothing open yet. A thread started as Creative Copilot stays
  // that way when you come back to it a week later.
  const conversationPersonalityId = conversations.find((c) => c.id === activeConversationId)?.personalityId;
  const activePersonality = useMemo(
    () =>
      settings.personalityProfiles.find((profile) => profile.id === (conversationPersonalityId ?? settings.activePersonalityId))
      ?? settings.personalityProfiles.find((profile) => profile.id === DEFAULT_PERSONALITY_ID)
      ?? settings.personalityProfiles[0],
    [conversationPersonalityId, settings.activePersonalityId, settings.personalityProfiles],
  );
  /**
   * The thread on screen: the one explicitly chosen, otherwise the model's most
   * recent.
   *
   * Derived rather than assigned by an effect, because two things arrive
   * independently — the model comes from the refresh (top pick, or best score)
   * and the history comes from disk — so neither could select a thread on its
   * own without a round of cascading renders. The fallback also covers deleting
   * the open thread: the id stops matching and the next one down takes over,
   * with nothing left holding a reference to something that no longer exists.
   */
  const activeConversation = useMemo(() => {
    const chosen = conversations.find((c) => c.id === activeConversationId);
    if (chosen) return chosen;
    return activeBuddy ? conversationsForModel(conversations, activeBuddy)[0] ?? null : null;
  }, [conversations, activeConversationId, activeBuddy]);
  const activeConversationKey = activeConversation?.id ?? null;
  const activeMessages = activeConversation?.messages ?? EMPTY_MESSAGES;
  // How much memory the active model is actually being given. "auto" sizes it
  // from the model's own limit against a KV budget; a pinned number is still
  // clamped to what the model declares, since asking beyond that does nothing.
  const activeContextInfo = activeBuddy ? contextInfo[activeBuddy] ?? null : null;
  // The weights share the pool with the KV cache, so a 7B leaves far less room
  // for context than a 3B on the same card. `sizeGb` is the download size,
  // which is what gets loaded.
  const activeKvBudget = useMemo(
    () => kvBudgetFromVram(vram, (activeBuddyObj?.sizeGb ?? 0) * 1e9),
    [vram, activeBuddyObj?.sizeGb],
  );
  const activeContextLimit = useMemo(() => {
    if (settings.contextSize === "auto") return chooseContextSize(activeContextInfo, activeKvBudget);
    if (!activeContextInfo) return settings.contextSize;
    return Math.min(settings.contextSize, activeContextInfo.maxContext);
  }, [settings.contextSize, activeContextInfo, activeKvBudget]);

  // Exact where Ollama has told us, estimated only for what it has not seen yet.
  //
  // A completed turn gives both halves: prompt_eval_count covers the system
  // prompt and every message up to that point, eval_count covers the reply. So
  // the only guesswork is whatever has been typed or added since — which is why
  // the mark is recorded against the message count it was measured at.
  /** What memory contributes to every request, or null when there is nothing. */
  const memoryNote = useMemo(() => buildMemoryNote(memories), [memories]);

  const contextUsage = useMemo(() => {
    const measured = activeConversationKey ? tokenMarkByKey[activeConversationKey] : undefined;
    const estimateFrom = (index: number) => activeMessages
      .slice(index)
      .reduce((sum, message) => sum + estimateTokens(message.content), 0);

    // Only what is actually sent counts. On a compacted thread that is the
    // summary plus the turns it does not cover, not the whole transcript —
    // which is the point of compacting, and has to show in the gauge or the
    // warning would never go away.
    const summarized = activeConversation?.summarizedCount ?? 0;
    const summaryTokens = estimateTokens(activeConversation?.summary ?? "");

    const used = measured
      ? measured.promptTokens + measured.evalTokens + estimateFrom(measured.messageCount)
      // Before the first measured reply, memory is part of what will be sent
      // and would otherwise be invisible in the gauge. Ollama's own count
      // covers it once there is one.
      : summaryTokens + (memoryNote?.tokens ?? 0) + estimateFrom(summarized);

    return getContextUsage(used + estimateTokens(draft), activeContextLimit);
  }, [activeConversationKey, tokenMarkByKey, activeMessages, activeConversation, draft, activeContextLimit, memoryNote]);

  /** Enough conversation to be worth summarising, and not already done. */
  const canCompact = activeConversation !== null
    && compactionSplit(activeConversation.messages, activeConversation.summarizedCount ?? 0) !== null;

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
        const opening = preferred ?? chatModels[0].name;
        setActiveBuddy(opening);
        // Unfold it so the thread being shown is visible in the list. Done here
        // rather than in an effect: this is already a callback, so it costs no
        // extra render.
        setExpandedModels((prev) => (prev.has(opening) ? prev : new Set(prev).add(opening)));
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
        // What each model can do, as RigMatch read it from Ollama. Absent on an
        // older RigMatch, which the chips below simply do not render.
        setRigCapabilities((raw.capabilities as Record<string, string[]> | undefined) ?? {});
        const maker = raw.imageMaker as { ready?: boolean; checkpoint?: string | null } | undefined;
        setImageMaker({ ready: maker?.ready === true, checkpoint: maker?.checkpoint ?? null });
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
    void getVramInfo().then(setVram);
  }, []);


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
      setConversations(loaded);
      setHistoryLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // One writer for the life of the app. Updates arrive once per streamed token;
  // this turns a burst of them into an occasional write, and keeps a failure
  // from reaching React — an unguarded write here used to trip the error
  // boundary on mount once localStorage was full, on every launch.
  const writerRef = useRef<ReturnType<typeof createWriteScheduler<Conversation[]>> | null>(null);
  if (writerRef.current == null) {
    writerRef.current = createWriteScheduler<Conversation[]>({
      write: async (value) => {
        await writeConversationsFile(serializeStore(value));
        setPersistError(null);
      },
      onError: (error) => setPersistError(String((error as Error)?.message ?? error)),
    });
  }

  useEffect(() => {
    if (!historyLoaded) return;
    writerRef.current?.schedule(conversations);
  }, [conversations, historyLoaded]);

  // Memory is loaded and written separately from conversations, so clearing
  // chat history does not silently take it with it.
  useEffect(() => {
    let cancelled = false;
    void readMemoriesFile()
      .then((raw) => parseMemories(raw) ?? [])
      .catch(() => [])
      .then((loaded) => {
        if (cancelled) return;
        setMemories(loaded);
        setMemoriesLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const memoryWriterRef = useRef<ReturnType<typeof createWriteScheduler<Memory[]>> | null>(null);
  if (memoryWriterRef.current == null) {
    memoryWriterRef.current = createWriteScheduler<Memory[]>({
      write: async (value) => { await writeMemoriesFile(serializeMemories(value)); },
      onError: (error) => setPersistError(String((error as Error)?.message ?? error)),
      // A handful of edits, not a token stream — no reason to sit on them.
      delayMs: 200,
      maxDelayMs: 1000,
    });
  }

  useEffect(() => {
    // Gated the same way as conversations: an ungated first write would save
    // the empty initial state over the file the load is about to fill.
    if (!memoriesLoaded) return;
    memoryWriterRef.current?.schedule(memories);
  }, [memories, memoriesLoaded]);

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

  /**
   * Make a picture from what is in the box.
   *
   * Deliberately a button rather than something inferred from the words. This
   * window is a tool for making images, so asking for one should be an act, not
   * a guess that occasionally fires on "draw me a diagram in text".
   *
   * RigMatch does the generating. It owns ComfyUI, the graph and the
   * checkpoints; the companion asks over the same loopback bridge it already
   * reads scores from, and would have to be a second implementation otherwise.
   */
  const generateImage = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || generatingImage) return;

    const target = activeConversation ?? createConversation({
      id: genId(),
      modelName: activeBuddy ?? "",
      personalityId: activePersonality?.id ?? DEFAULT_PERSONALITY_ID,
      now: Date.now(),
    });
    const conversationId = target.id;
    const askId = genId();
    const replyId = genId();

    const withReply = (content: string, extra: Partial<AppMessage> = {}) => {
      setConversations((prev) => {
        const now = Date.now();
        const list = prev.some((c) => c.id === conversationId) ? prev : [...prev, target];
        return list.map((c) => {
          if (c.id !== conversationId) return c;
          const seen = c.messages.some((m) => m.id === replyId);
          const reply: AppMessage = { id: replyId, role: "assistant", content, ts: Date.now(), ...extra };
          const messages = seen
            ? c.messages.map((m) => (m.id === replyId ? reply : m))
            : [...c.messages, { id: askId, role: "user" as const, content: prompt, ts: Date.now() }, reply];
          return withMessages(c, messages, now);
        });
      });
    };

    setActiveConversationId(conversationId);
    setDraft("");
    setGeneratingImage(true);
    // Names the thing that will actually do it. The button sits under a
    // composer that says "using qwen2.5:7b", and no Ollama model here makes
    // pictures — leaving that implication standing is the same untruth the
    // main app spends its time refusing.
    withReply("Asking RigMatch to make this with ComfyUI. The chat model is not involved.");

    try {
      const started = await invoke<{ id: string }>("start_rig_generation", { prompt });
      const startedAt = Date.now();
      // Elapsed seconds, not a bar: ComfyUI reports nothing between starting and
      // finishing, so a percentage would be invented.
      for (let i = 0; i < 200; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const job = await invoke<{ status: string; file?: string; error?: string }>(
          "get_rig_generation", { id: started.id },
        );
        if (job.status === "done" && job.file) {
          withReply(prompt, { imagePath: job.file, imageJobId: started.id });
          return;
        }
        if (job.status === "failed") {
          withReply(`That picture could not be made: ${job.error ?? "RigMatch did not say why."}`);
          return;
        }
        withReply(`Making "${prompt}"... ${Math.round((Date.now() - startedAt) / 1000)}s`);
      }
      withReply("RigMatch is still working on that picture. It will be in your Pictures folder when it lands.");
    } catch (error) {
      // RigMatch's own words where it gave any: it knows whether ComfyUI is
      // missing, busy, or simply has no checkpoint that can draw.
      withReply(String(error));
    } finally {
      setGeneratingImage(false);
    }
  }, [draft, generatingImage, activeConversation, activeBuddy, activePersonality]);

  const sendMessage = useCallback(async () => {
    if (!activeBuddy || !draft.trim() || typingModel) return;

    // Typing into a model that has no thread open starts one, rather than
    // refusing — the empty state is a chat waiting to happen, not an error.
    const target = activeConversation
      ?? createConversation({
        id: genId(),
        modelName: activeBuddy,
        personalityId: activePersonality?.id ?? DEFAULT_PERSONALITY_ID,
        now: Date.now(),
      });
    const conversationId = target.id;

    const userMsg: AppMessage = { id: genId(), role: "user", content: draft.trim(), ts: Date.now() };
    const updatedHistory = [...target.messages, userMsg];

    setConversations((prev) => {
      const now = Date.now();
      const existing = prev.some((c) => c.id === conversationId);
      const next = existing ? prev : [...prev, target];
      return next.map((c) => (c.id === conversationId ? withMessages(c, updatedHistory, now) : c));
    });
    setActiveConversationId(conversationId);
    setDraft("");
    setTypingModel(activeBuddy);

    const profilePrompt = [
      settings.systemPrompt.trim(),
      activePersonality?.instructions.trim()
        ? `Personality profile: ${activePersonality.name}\n${activePersonality.instructions.trim()}`
        : "",
      `You are currently powered by the local Ollama model "${activeBuddy}". Do not claim to be a different model.`,
      // Questions like "how many chats have we had?" are about the app, not the
      // conversation. Without these facts the model has no way to know and
      // invents an answer — it claimed to be in its first chat while sitting in
      // the second of two. Told rather than intercepted, so a genuine question
      // that merely mentions chats is still answered by the model.
      // Standing memory rides ahead of the session facts: it is about the user,
      // not about this conversation. Budgeted inside buildMemoryNote so it
      // cannot quietly eat the window it sits next to.
      memoryNote?.text ?? "",
      buildSessionNote({
        // A thread being started by this very message is not in `conversations`
        // yet — that update is queued below — so it has to count itself.
        threadCount: conversationsForModel(conversations, activeBuddy).length
          + (conversations.some((c) => c.id === target.id) ? 0 : 1),
        startedAt: target.createdAt,
        now: Date.now(),
      }),
    ].filter(Boolean).join("\n\n");
    const ollamaHistory: ChatMessage[] = [
      ...(profilePrompt
        ? [{ role: "system" as const, content: profilePrompt }]
        : []),
      // Compacted threads send their summary in place of the turns it covers.
      // The transcript above still shows all of them.
      ...buildContextMessages(updatedHistory, target.summary, target.summarizedCount ?? 0),
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
          setConversations((prev) => prev.map((c) => {
            if (c.id !== conversationId) return c;
            const last = c.messages[c.messages.length - 1];
            const messages = last?.id === assistantId
              ? [...c.messages.slice(0, -1), { ...last, content: accumulated }]
              : [...c.messages, { id: assistantId, role: "assistant" as const, content: accumulated, ts: Date.now() }];
            // Not withMessages: the title is already settled by the user's
            // message, and updatedAt would reshuffle the sidebar on every token.
            return { ...c, messages };
          }));
        },
        ctrl.signal,
        {
          numCtx: activeContextLimit,
          onDone: ({ promptTokens, evalTokens }) => {
            if (promptTokens <= 0) return;
            setTokenMarkByKey((prev) => ({
              ...prev,
              [conversationId]: {
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
        setConversations((prev) => prev.map((c) => (c.id === conversationId
          ? {
              ...c,
              messages: [...c.messages, {
                id: genId(),
                role: "assistant" as const,
                content: "Something went wrong. Is Ollama still running?",
                ts: Date.now(),
              }],
            }
          : c)));
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
    activeConversation,
    activePersonality,
    conversations,
    draft,
    memoryNote,
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
    setConversations([]);
    setActiveConversationId(null);
    setTokenMarkByKey({});
    // Straight to disk rather than through the coalescing window: "clear my
    // history" should not still be on disk if the app closes a moment later.
    writerRef.current?.schedule([]);
    void writerRef.current?.flush();
  };

  /**
   * Open a model: unfold its threads and show the most recent one.
   *
   * Clicking the model a second time folds it away again, so a long model list
   * stays scannable. Selecting a model with no history at all leaves nothing
   * active — the empty state invites the first message, and sendMessage creates
   * the thread then.
   */
  const openModel = useCallback((modelName: string) => {
    setActiveBuddy(modelName);
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelName) && modelName === activeBuddy) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
    setActiveConversationId((current) => {
      const threads = conversationsForModel(conversations, modelName);
      // Keep the current thread if it belongs to this model, so re-clicking to
      // fold does not also jump you somewhere else.
      if (threads.some((c) => c.id === current)) return current;
      return threads[0]?.id ?? null;
    });
  }, [conversations, activeBuddy]);

  const rememberText = useCallback((text: string) => {
    setMemories((prev) => addMemory(prev, text, { id: genId(), now: Date.now() }));
    void memoryWriterRef.current?.flush();
  }, []);

  /** Start a thread on a model. The sidebar unfolds so it is visible. */
  const startNewConversation = useCallback((modelName: string) => {
    // Reuse an empty thread on this model rather than stacking up identical
    // "New chat" rows for someone who clicks it twice.
    const spare = conversations.find((c) => c.modelName === modelName && c.messages.length === 0);
    const conversation = spare ?? createConversation({
      id: genId(),
      modelName,
      personalityId: settings.activePersonalityId,
      now: Date.now(),
    });
    if (!spare) setConversations((prev) => [...prev, conversation]);
    setActiveBuddy(modelName);
    setActiveConversationId(conversation.id);
    setExpandedModels((prev) => new Set(prev).add(modelName));
    setDraft("");
  }, [conversations, settings.activePersonalityId]);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setTokenMarkByKey(({ [id]: _removed, ...rest }) => rest);
    // Land it immediately: a deletion still sitting in the coalescing window
    // when the app closes would come back on the next launch.
    setActiveConversationId((current) => (current === id ? null : current));
    void writerRef.current?.flush();
  }, []);

  /**
   * Summarise the older turns of the open thread.
   *
   * Nothing is applied here — the summary is shown first, because a bad one
   * quietly poisons every later reply and the user is the only one who can
   * tell. `compactPlan` holds it until Compact or Continue is pressed.
   */
  const runCompaction = useCallback(async () => {
    if (!activeConversation || !activeBuddy || compacting) return;
    const upTo = compactionSplit(activeConversation.messages, activeConversation.summarizedCount ?? 0);
    if (upTo === null) return;

    const summarizer = pickSummarizer(
      activeBuddy,
      buddies.map((b) => b.modelName),
      rigScores,
    );

    setCompacting(true);
    setCompactPlan(null);
    try {
      let text = "";
      await streamChat(
        settings.ollamaUrl,
        summarizer.model,
        buildSummaryRequest(activeConversation.messages, upTo, activeConversation.summary),
        (token) => { text += token; },
        undefined,
        // Summarising is the one call that must not be truncated: it is reading
        // the whole of the history that no longer fits.
        { numCtx: activeContextLimit },
      );
      const summary = text.trim();
      if (!summary) throw new Error("The model returned an empty summary.");
      setCompactPlan({ conversationId: activeConversation.id, upTo, summary, by: summarizer });
    } catch (error) {
      setCompactError(String((error as Error)?.message ?? error));
    } finally {
      setCompacting(false);
    }
  }, [activeConversation, activeBuddy, buddies, rigScores, settings.ollamaUrl, activeContextLimit, compacting]);

  /** Fold the summary into the open thread and carry on in it. */
  const applyCompaction = useCallback(() => {
    if (!compactPlan) return;
    setConversations((prev) => prev.map((c) => (c.id === compactPlan.conversationId
      ? { ...c, summary: compactPlan.summary, summarizedCount: compactPlan.upTo, summaryBy: compactPlan.by.model, updatedAt: Date.now() }
      : c)));
    // The prompt is a different length now, so the measured token count no
    // longer describes what will be sent.
    setTokenMarkByKey(({ [compactPlan.conversationId]: _stale, ...rest }) => rest);
    setCompactPlan(null);
    void writerRef.current?.flush();
  }, [compactPlan]);

  /**
   * Start a fresh thread carrying the summary, leaving this one as it stands.
   *
   * The difference from Compact: the original keeps its full history and its
   * own memory, and the new thread starts nearly empty. Better when the subject
   * has moved on; Compact is better when it has not.
   */
  const branchFromCompaction = useCallback(() => {
    if (!compactPlan || !activeConversation || !activeBuddy) return;
    const branched: Conversation = {
      ...createConversation({
        id: genId(),
        modelName: activeBuddy,
        personalityId: activeConversation.personalityId,
        now: Date.now(),
      }),
      title: continuationTitle(activeConversation.title),
      titleIsAuto: false,
      summary: compactPlan.summary,
      // Nothing of its own yet, so the summary stands in for all of it.
      summarizedCount: 0,
      summaryBy: compactPlan.by.model,
    };
    setConversations((prev) => [...prev, branched]);
    setActiveConversationId(branched.id);
    setExpandedModels((prev) => new Set(prev).add(activeBuddy));
    setCompactPlan(null);
    void writerRef.current?.flush();
  }, [compactPlan, activeConversation, activeBuddy]);

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    setConversations((prev) => prev.map((c) => (c.id === id
      // An empty box means "go back to naming it automatically", rather than
      // leaving a blank row in the sidebar.
      ? trimmed
        ? { ...c, title: trimmed, titleIsAuto: false }
        : { ...c, title: deriveTitle(c.messages), titleIsAuto: true }
      : c)));
    setRenamingId(null);
  }, []);

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

  /**
   * The personality belongs to the conversation, not to the app.
   *
   * It used to be half of the storage key, so changing the dropdown swapped you
   * to a different — usually empty — thread and your conversation looked
   * deleted. Nothing on screen said so. Now it changes the open thread's
   * personality in place and becomes the default for new ones.
   */
  const selectPersonality = (id: string) => {
    applyPersonalitySettings({ ...settings, activePersonalityId: id });
    if (activeConversationId) {
      setConversations((prev) => prev.map((c) => (c.id === activeConversationId
        ? { ...c, personalityId: id }
        : c)));
    }
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

      {/* The summary is shown before it is used. A poor one quietly degrades
          every later reply, and the person who had the conversation is the only
          one who can judge it. */}
      {compactPlan && (
        <div className="rm-modal-backdrop" role="presentation" onClick={() => setCompactPlan(null)}>
          <div
            className="rm-modal rm-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Free up room"
            onClick={(e) => e.stopPropagation()}
          >
            <strong>Here is what it kept</strong>
            <p>
              The first {compactPlan.upTo} message{compactPlan.upTo === 1 ? "" : "s"} summarised into these notes
              {compactPlan.by.borrowed
                ? ` by ${getDisplayName(compactPlan.by.model)}, which scores higher on your rig than the model you are chatting with`
                : ""}
              . The last {KEEP_RECENT_MESSAGES} stay exactly as they are, and nothing is deleted — the whole
              conversation stays on screen either way.
            </p>
            <textarea
              className="rm-compact-summary"
              value={compactPlan.summary}
              onChange={(e) => setCompactPlan((plan) => (plan ? { ...plan, summary: e.target.value } : plan))}
              rows={9}
            />
            <div className="rm-modal-actions">
              <button type="button" className="rm-btn-sm" onClick={() => setCompactPlan(null)}>Cancel</button>
              <button type="button" className="rm-btn-sm" onClick={branchFromCompaction}>
                Continue in a new chat
              </button>
              <button type="button" className="rm-btn-sm rm-btn-primary" onClick={applyCompaction}>
                Compact this chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deleting a conversation cannot be undone and there is no bin to
          recover it from, so it gets asked about by name. */}
      {confirmDelete && (
        <div className="rm-modal-backdrop" role="presentation" onClick={() => setConfirmDelete(null)}>
          <div
            className="rm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete conversation"
            onClick={(e) => e.stopPropagation()}
          >
            <strong>Delete “{confirmDelete.title}”?</strong>
            <p>
              {confirmDelete.messages.length} message{confirmDelete.messages.length === 1 ? "" : "s"} with{" "}
              {getDisplayName(confirmDelete.modelName)}. This cannot be undone.
            </p>
            <div className="rm-modal-actions">
              <button type="button" className="rm-btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                type="button"
                className="rm-btn-sm rm-btn-danger"
                onClick={() => { deleteConversation(confirmDelete.id); setConfirmDelete(null); }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/*
          Someone opening this window and wanting a picture had no way to learn
          that no model in the list below can make one — the only clue was a
          tooltip on a button by the message box, and a tooltip nobody hovers
          teaches nobody. Making pictures is ComfyUI's job, reached through
          RigMatch; the models here write, and some of them look and listen.
          Said once, in the open, rather than left to be discovered.
        */}
        {/*
          A question with buttons, not a paragraph.

          This started as a written explanation of what the chat could do, which
          was accurate, ignored, and — in the words of the person who asked for
          it — super ugly. Nobody reads a wall of text in a sidebar; they arrive
          wanting to do a thing. So the capabilities became the filter, and the
          filter asks the question directly.

          "Make a picture" is the reason this exists. It is the one answer that
          is not an Ollama model, and the list below says so in its own words
          rather than leaving the absence to be puzzled over.
        */}
        <div className="rm-doing">
          <strong id="rm-doing-label">What do you want to do?</strong>
          <div className="rm-doing-chips" role="group" aria-labelledby="rm-doing-label">
            {([
              ["all", "Anything"],
              ["text", "Write"],
              ["vision", "Read a picture"],
              ["audio", "Hear audio"],
              ["image", "Make a picture"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={capabilityFilter === id}
                className={capabilityFilter === id ? "active" : ""}
                onClick={() => setCapabilityFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rm-buddy-list">
          {/*
            The picture-maker, listed where someone looks for it.

            It is not an Ollama model and cannot be chatted with, so it is not a
            buddy — but "not a buddy" was being expressed by simply not being
            anywhere, and a person with SDXL Turbo installed read that absence as
            the app failing to see it. Twice. It belongs in the list, saying what
            it is.
          */}
          {capabilityFilter === "image" && (
            <div className={imageMaker.ready ? "rm-maker ready" : "rm-maker"}>
              <div className="rm-maker-head">
                <span className="rm-maker-kind">Image maker</span>
                <span className={imageMaker.ready ? "rm-maker-state on" : "rm-maker-state off"}>
                  {imageMaker.ready ? "Ready" : "Not ready"}
                </span>
              </div>
              <strong>
                {imageMaker.ready && imageMaker.checkpoint
                  ? imageMaker.checkpoint.replace(/\.(safetensors|ckpt|sft)$/i, "")
                  : "No checkpoint that can draw"}
              </strong>
              <p>
                {imageMaker.ready
                  ? "Not a chat model. Type what you want and press Make image — RigMatch runs it through ComfyUI."
                  : "ComfyUI has no still-image checkpoint loaded, so Make image cannot work yet. Load one in ComfyUI, or check RigMatch is running."}
              </p>
            </div>
          )}
          {capabilityFilter !== "image" && visibleBuddies.length === 0 && connectionStatus === "connected" && (
            <div className="rm-buddy-empty">
              <p>No models visible.</p>
              <p>Check Settings to unhide models, or open <strong>RigMatch</strong> to download one.</p>
            </div>
          )}
          {visibleBuddies.map((buddy) => {
            const threads = conversationsForModel(conversations, buddy.modelName);
            const lastMsg = threads[0]?.messages[threads[0].messages.length - 1];
            const isActive = buddy.modelName === activeBuddy;
            const isTyping = typingModel === buddy.modelName;
            const score = rigScores[buddy.modelName];
            const isChosen = buddy.modelName === chosenModel;
            const isExpanded = expandedModels.has(buddy.modelName);
            return (
              <div key={buddy.modelName} className="rm-buddy-group">
              <button
                type="button"
                className={`rm-buddy-item${isActive ? " active" : ""}${isChosen ? " rm-buddy-chosen" : ""}`}
                aria-expanded={isExpanded}
                onClick={() => openModel(buddy.modelName)}
                onDoubleClick={() => setProfileModal(buddy)}
              >
                <span className={`rm-buddy-caret${isExpanded ? " open" : ""}`} aria-hidden="true">▸</span>
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
                  {(rigCapabilities[buddy.modelName] ?? []).filter((c) => c !== "text").length > 0 && (
                    <span className="rm-buddy-caps">
                      {(rigCapabilities[buddy.modelName] ?? []).includes("vision") && (
                        <span className="rm-cap" title="Can look at pictures you send it">sees</span>
                      )}
                      {(rigCapabilities[buddy.modelName] ?? []).includes("audio") && (
                        <span className="rm-cap" title="Can listen to a recording you send it">hears</span>
                      )}
                    </span>
                  )}
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
                {threads.length > 1 && (
                  <span className="rm-thread-count" title={`${threads.length} conversations`}>{threads.length}</span>
                )}
              </button>

              {/* The subjects under this model. Folded away until the model is
                  opened, so a long list of models stays scannable. */}
              {isExpanded && (
                <div className="rm-thread-list">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className={`rm-thread-item${thread.id === activeConversation?.id ? " active" : ""}`}
                    >
                      {renamingId === thread.id ? (
                        <input
                          className="rm-thread-rename"
                          defaultValue={thread.title}
                          autoFocus
                          onBlur={(e) => renameConversation(thread.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameConversation(thread.id, e.currentTarget.value);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rm-thread-open"
                            onClick={() => { setActiveBuddy(buddy.modelName); setActiveConversationId(thread.id); }}
                            onDoubleClick={() => setRenamingId(thread.id)}
                            title={`${thread.title} — double-click to rename`}
                          >
                            <span className="rm-thread-title">{thread.title}</span>
                            <span className="rm-thread-meta">{formatWhen(thread.updatedAt)}</span>
                          </button>
                          <button
                            type="button"
                            className="rm-thread-delete"
                            title="Delete this conversation"
                            aria-label={`Delete conversation ${thread.title}`}
                            onClick={() => setConfirmDelete(thread)}
                          >×</button>
                        </>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rm-thread-new"
                    onClick={() => startNewConversation(buddy.modelName)}
                  >
                    + New chat
                  </button>
                </div>
              )}
              </div>
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
                    : connectionStatus !== "connected"
                      ? "Offline"
                      : activeConversation && activeConversation.messages.length > 0
                        // Which subject you are in matters more than which model,
                        // once a model can hold several.
                        ? `${activeConversation.title} · ${activeBuddyObj.displayName}`
                        : `using ${activeBuddyObj.displayName} through Ollama`}
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
                  value={activePersonality?.id ?? settings.activePersonalityId}
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

            {/* Offered before the limit, not after: past it Ollama has already
                started dropping the oldest turns on its own. */}
            {contextUsage.nearLimit && canCompact && !compactPlan && (
              <div className={`rm-compact-bar${contextUsage.willTruncate ? " urgent" : ""}`}>
                <span>
                  {contextUsage.willTruncate
                    ? "This chat has outgrown what the model can hold. The oldest messages are being left out of its memory."
                    : "This chat is filling up the model's memory."}
                </span>
                <button type="button" className="rm-btn-sm" onClick={() => void runCompaction()} disabled={compacting}>
                  {compacting ? "Summarising…" : "Free up room"}
                </button>
              </div>
            )}
            {compactError && (
              <div className="rm-compact-bar urgent">
                <span>Could not summarise: {compactError}</span>
                <button type="button" className="rm-btn-sm" onClick={() => setCompactError(null)}>Dismiss</button>
              </div>
            )}

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
              {/* A branched thread starts with everything it knows in the
                  summary and nothing above the line. */}
              {activeConversation?.summary && (activeConversation.summarizedCount ?? 0) === 0 && (
                <SummaryMarker conversation={activeConversation} />
              )}
              {activeMessages.map((msg, index) => (
                <Fragment key={msg.id}>
                  {/* Where the model's memory actually begins. Without this the
                      transcript shows turns the model cannot see and gives no
                      sign of it — the original complaint, in a milder form. */}
                  {activeConversation?.summary && index === activeConversation.summarizedCount && (
                    <SummaryMarker conversation={activeConversation} />
                  )}
                <div className={`rm-message rm-message-${msg.role}${activeConversation?.summary && index < (activeConversation.summarizedCount ?? 0) ? " rm-message-folded" : ""}`}>
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
                    {msg.imagePath && (
                      <GeneratedImage
                        path={msg.imagePath}
                        jobId={msg.imageJobId}
                        bytes={msg.imageJobId ? imageBytes[msg.imageJobId] : undefined}
                        onLoaded={(id, dataUrl) => setImageBytes((prev) => ({ ...prev, [id]: dataUrl }))}
                      />
                    )}
                    <div className="rm-message-time">
                      {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {/* Nothing is remembered unless it is asked for. Shown on
                          hover so it does not clutter every message. */}
                      <button
                        type="button"
                        className="rm-remember-btn"
                        title="Remember this across all conversations"
                        onClick={() => rememberText(msg.content)}
                      >
                        ✦ Remember
                      </button>
                    </div>
                  </div>
                </div>
                </Fragment>
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
                <>
                  <button
                    type="button"
                    className="rm-send-btn rm-image-btn"
                    onClick={() => void generateImage()}
                    disabled={!draft.trim() || generatingImage}
                    title="Sends this to ComfyUI through RigMatch — not to the model above, which cannot make pictures"
                  >
                    {generatingImage ? "Making..." : "Make image ↗"}
                  </button>
                  <button
                    type="button"
                    className="rm-send-btn"
                    onClick={() => void sendMessage()}
                    disabled={!draft.trim()}
                  >
                    Send
                  </button>
                </>
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

              {/* ── What it remembers about you ── */}
              <div className="rm-settings-section-label">What it remembers about you</div>
              <p className="rm-settings-hint">
                Sent at the start of every conversation, with every model. Nothing is added here unless
                you ask for it — use <strong>Remember</strong> on any message, or write your own below.
                {memoryNote && memoryNote.omitted > 0 && (
                  <> Only the {memoryNote.used} most recent fit; {memoryNote.omitted} are not being sent.</>
                )}
              </p>
              <div className="rm-memory-list">
                {memories.length === 0 && (
                  <p className="rm-memory-empty">Nothing yet.</p>
                )}
                {memories.map((memory) => (
                  <div key={memory.id} className={`rm-memory-row${memory.enabled ? "" : " off"}`}>
                    <input
                      type="checkbox"
                      checked={memory.enabled}
                      title={memory.enabled ? "Being sent — click to silence it" : "Kept, but not sent"}
                      onChange={(e) => setMemories((prev) => setMemoryEnabled(prev, memory.id, e.target.checked))}
                    />
                    <input
                      type="text"
                      className="rm-memory-text"
                      defaultValue={memory.text}
                      onBlur={(e) => setMemories((prev) => updateMemory(prev, memory.id, e.target.value))}
                    />
                    <button
                      type="button"
                      className="rm-memory-remove"
                      aria-label={`Forget: ${memory.text}`}
                      title="Forget this"
                      onClick={() => setMemories((prev) => removeMemory(prev, memory.id))}
                    >×</button>
                  </div>
                ))}
              </div>
              <div className="rm-memory-add">
                <input
                  type="text"
                  placeholder="Something it should always know about you…"
                  value={memoryDraft}
                  onChange={(e) => setMemoryDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !memoryDraft.trim()) return;
                    rememberText(memoryDraft);
                    setMemoryDraft("");
                  }}
                />
                <button
                  type="button"
                  className="rm-btn-sm"
                  disabled={!memoryDraft.trim()}
                  onClick={() => { rememberText(memoryDraft); setMemoryDraft(""); }}
                >Add</button>
              </div>
              {memories.length > 0 && (
                <button
                  type="button"
                  className="rm-memory-forget-all"
                  onClick={() => setMemories([])}
                >Forget everything</button>
              )}

              {/* ── Memory ── */}
              <div className="rm-settings-section-label">Conversation memory</div>
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
                    Auto — as much as fits comfortably{activeContextInfo ? ` (${formatContextSize(chooseContextSize(activeContextInfo, activeKvBudget))} for ${activeBuddyObj?.displayName ?? "this model"})` : ""}
                  </option>
                  {CONTEXT_STEPS.map((size) => {
                    const cost = activeContextInfo ? kvCacheBytes(activeContextInfo, size) : 0;
                    const overModel = !!activeContextInfo && size > activeContextInfo.maxContext;
                    // Beyond what the card can hold, Ollama moves layers onto
                    // the CPU — it still works, just slowly, so say so rather
                    // than hiding the option.
                    const overCard = activeKvBudget !== null && cost > activeKvBudget;
                    return (
                      <option key={size} value={size}>
                        {formatContextSize(size)} tokens
                        {cost > 0 ? ` — about ${formatGib(cost)} of video memory` : ""}
                        {overModel ? " (beyond this model's limit)" : overCard ? " (too big for your card — would run on the CPU)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <p className="rm-settings-hint">
                A bigger window remembers more of the conversation but reserves more video memory and
                makes each reply take longer to start. Past the limit the oldest messages drop out of
                the model's memory, even though they stay on screen.
                {vram
                  ? ` Auto is sizing against the ${formatGib(vram.totalBytes)} ${vram.unified ? "of shared memory" : "of video memory"} it found on this machine.`
                  : " Auto is using a conservative default — no graphics card could be read on this machine."}
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
