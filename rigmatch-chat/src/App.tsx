import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listModels, streamChat, getVersion, assertLocalhostUrl, type OllamaModel, type ChatMessage } from "./lib/ollamaApi";
import { loadSettings, saveSettings, type AppSettings } from "./lib/settings";
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

// ─── Persistence ─────────────────────────────────────────────────────────────

const CONVERSATIONS_KEY = "rigmatch-chat:conversations:v1";
const RIG_SCORES_KEY = "rigmatch-chat:rig-scores:v1";

type BridgePayload = { scores: Record<string, ModelScore>; chosen: string | null };

function loadConversations(): Record<string, AppMessage[]> {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AppMessage[]>) : {};
  } catch {
    return {};
  }
}

function saveConversations(data: Record<string, AppMessage[]>): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(data));
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
  size = "normal",
  isTyping = false,
}: {
  family: AvatarFamily;
  size?: "sm" | "normal" | "lg";
  isTyping?: boolean;
}) {
  const sizeClass =
    size === "lg" ? "rm-avatar rm-avatar-lg" : size === "sm" ? "rm-avatar rm-avatar-sm" : "rm-avatar";
  return (
    <img
      src={FAMILY_AVATAR[family]}
      alt={family}
      className={`${sizeClass}${isTyping ? " rm-avatar-typing" : ""}`}
    />
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [activeBuddy, setActiveBuddy] = useState<string | null>(null);
  const [messagesByModel, setMessagesByModel] = useState<Record<string, AppMessage[]>>(() => loadConversations());
  const [typingModel, setTypingModel] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<AppSettings>(settings);
  const [rigScores, setRigScores] = useState<Record<string, ModelScore>>(() => loadCachedBridge().scores);
  const [chosenModel, setChosenModel] = useState<string | null>(() => loadCachedBridge().chosen);
  const [profileModal, setProfileModal] = useState<Buddy | null>(null);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
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

  const topPickModel = useMemo(() => {
    const entries = Object.entries(rigScores);
    if (entries.length === 0) return null;
    return entries.reduce(
      (best, [model, score]) => (score.total > (rigScores[best]?.total ?? 0) ? model : best),
      entries[0][0],
    );
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

  const activeMessages = activeBuddy ? (messagesByModel[activeBuddy] ?? []) : [];
  const activeBuddyObj = visibleBuddies.find((b) => b.modelName === activeBuddy) ?? null;

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
      setBuddies(models.map(modelToBuddy));
      setOllamaVersion(version);
      setConnectionStatus("connected");
      if (models.length > 0 && activeBuddy === null) {
        const bridge = loadCachedBridge();
        const modelNames = models.map((m) => m.name);
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
        setActiveBuddy(preferred ?? models[0].name);
      }
    } catch {
      setBuddies([]);
      setOllamaVersion(null);
      setConnectionStatus("disconnected");
    }
  }, [settings.ollamaUrl, activeBuddy]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (connectionStatus !== "disconnected") return;
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [connectionStatus, refresh]);

  // ── RigMatch.AI scores bridge ──────────────────────────────────────────────

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
        // RigMatch.AI not running — use cached scores from last session
      }
    };
    void fetchScores();
    const id = setInterval(() => void fetchScores(), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!settings.showSystemMonitor) { setSysStats(null); return; }
    const poll = async () => {
      try {
        const stats = await invoke<SystemStats>("get_system_stats");
        setSysStats(stats);
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [settings.showSystemMonitor]);

  // ── Persist conversations ────────────────────────────────────────────────

  useEffect(() => {
    saveConversations(messagesByModel);
  }, [messagesByModel]);

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
    if (!activeBuddy || !draft.trim() || typingModel) return;

    const userMsg: AppMessage = { id: genId(), role: "user", content: draft.trim(), ts: Date.now() };
    const history = messagesByModel[activeBuddy] ?? [];
    const updatedHistory = [...history, userMsg];

    setMessagesByModel((prev) => ({ ...prev, [activeBuddy]: updatedHistory }));
    setDraft("");
    setTypingModel(activeBuddy);

    const ollamaHistory: ChatMessage[] = [
      ...(settings.systemPrompt.trim()
        ? [{ role: "system" as const, content: settings.systemPrompt.trim() }]
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
            const msgs = prev[activeBuddy] ?? [];
            const last = msgs[msgs.length - 1];
            if (last?.id === assistantId) {
              return { ...prev, [activeBuddy]: [...msgs.slice(0, -1), { ...last, content: accumulated }] };
            }
            return {
              ...prev,
              [activeBuddy]: [
                ...msgs,
                { id: assistantId, role: "assistant", content: accumulated, ts: Date.now() },
              ],
            };
          });
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setMessagesByModel((prev) => ({
          ...prev,
          [activeBuddy]: [
            ...(prev[activeBuddy] ?? []),
            {
              id: genId(),
              role: "assistant",
              content: "⚠️ Something went wrong. Is Ollama still running?",
              ts: Date.now(),
            },
          ],
        }));
      }
    } finally {
      setTypingModel(null);
    }
  }, [activeBuddy, draft, messagesByModel, settings.ollamaUrl, settings.systemPrompt, typingModel]);

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
    const next: AppSettings = {
      ollamaUrl: rawUrl,
      userName: draftSettings.userName.trim() || "You",
      systemPrompt: draftSettings.systemPrompt,
      theme: draftSettings.theme,
      muted: draftSettings.muted,
      hiddenModels: draftSettings.hiddenModels,
      showSystemMonitor: draftSettings.showSystemMonitor,
    };
    saveSettings(next);
    setSettings(next);
    setSettingsOpen(false);
    void refresh();
  };

  const toggleHideModel = (modelName: string) => {
    setDraftSettings((s) => ({
      ...s,
      hiddenModels: s.hiddenModels.includes(modelName)
        ? s.hiddenModels.filter((m) => m !== modelName)
        : [...s.hiddenModels, modelName],
    }));
  };

  const clearAllHistory = () => {
    setMessagesByModel({});
    saveConversations({});
  };

  // Hide a model immediately (outside settings flow — from profile popup)
  const hideModelNow = (modelName: string) => {
    const next = { ...settings, hiddenModels: [...settings.hiddenModels, modelName] };
    saveSettings(next);
    setSettings(next);
    setDraftSettings(next);
    if (activeBuddy === modelName) setActiveBuddy(null);
    setProfileModal(null);
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
            onClick={() => getCurrentWindow().close()}
            aria-label="Close"
          >×</button>
        </div>
      </div>

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

        <div className="rm-buddy-list">
          {visibleBuddies.length === 0 && connectionStatus === "connected" && (
            <div className="rm-buddy-empty">
              <p>No models visible.</p>
              <p>Check Settings to unhide models, or open <strong>RigMatch.AI</strong> to download one.</p>
            </div>
          )}
          {visibleBuddies.map((buddy) => {
            const msgs = messagesByModel[buddy.modelName] ?? [];
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
                      <span className="rm-chosen-badge" title="Your Top Pick from RigMatch.AI">⭐</span>
                    )}
                    {modelRankings.has(buddy.modelName) && (
                      <span className="rm-rank-medal" title={`Ranked #${modelRankings.get(buddy.modelName)} by RigMatch score`}>
                        {RANK_MEDALS[modelRankings.get(buddy.modelName)!]}
                      </span>
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
            title="Open RigMatch.AI — benchmark and rank your models"
            onClick={() => void invoke("open_rigmatch_ai").catch(() => undefined)}
          >
            ⚡ RigMatch.AI
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
              <BuddyAvatar family={activeBuddyObj.avatarFamily} isTyping={typingModel === activeBuddy} size="sm" />
              <div className="rm-chat-header-info">
                <strong>
                  {activeBuddy && modelRankings.has(activeBuddy) && (
                    <span className="rm-rank-medal">{RANK_MEDALS[modelRankings.get(activeBuddy)!]}</span>
                  )}
                  {activeBuddyObj.displayName}
                </strong>
                <em>
                  {typingModel === activeBuddy
                    ? "typing…"
                    : connectionStatus === "connected"
                      ? "Online · via Ollama"
                      : "Offline"}
                </em>
              </div>
              <span className="rm-chat-header-model">{activeBuddyObj.modelName}</span>
            </div>

            <div className="rm-transcript" ref={transcriptRef}>
              {activeMessages.length === 0 && (
                <div className="rm-transcript-empty">
                  <BuddyAvatar family={activeBuddyObj.avatarFamily} size="lg" />
                  <p>
                    Start a conversation with <strong>{activeBuddyObj.displayName}</strong>.
                  </p>
                  <p className="rm-transcript-hint">Running locally · No data leaves your computer</p>
                </div>
              )}
              {activeMessages.map((msg) => (
                <div key={msg.id} className={`rm-message rm-message-${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="rm-message-avatar">
                      <BuddyAvatar family={activeBuddyObj.avatarFamily} size="sm" />
                    </div>
                  )}
                  <div className="rm-message-bubble">
                    <div className="rm-message-sender">
                      {msg.role === "user" ? settings.userName : activeBuddyObj.displayName}
                    </div>
                    <div className="rm-message-text">{msg.content}</div>
                    <div className="rm-message-time">
                      {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              {typingModel === activeBuddy && (
                <div className="rm-message rm-message-assistant">
                  <div className="rm-message-avatar">
                    <BuddyAvatar family={activeBuddyObj.avatarFamily} isTyping size="sm" />
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
                placeholder={`Message ${activeBuddyObj.displayName}…`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                disabled={!!typingModel}
              />
              <button
                type="button"
                className="rm-send-btn"
                onClick={() => void sendMessage()}
                disabled={!draft.trim() || !!typingModel}
              >
                Send
              </button>
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
                  No models installed. Open <strong>RigMatch.AI</strong> to download your first model.
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
                  {isChosen && <span className="rm-chosen-badge">⭐</span>}
                  {rank !== undefined && <span className="rm-rank-medal">{RANK_MEDALS[rank]}</span>}
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
                        <strong>{score.speed}</strong>
                      </div>
                      <div className="rm-profile-stat">
                        <span>Trust</span>
                        <strong>{score.sobriety}</strong>
                      </div>
                      <div className="rm-profile-stat">
                        <span>Fit</span>
                        <strong>{score.fit}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="rm-profile-stat rm-profile-untested">Not tested yet in RigMatch.AI</div>
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
                    Hide Buddy
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                  placeholder="e.g. You are a helpful assistant. The user is a maker and developer working on Electron and Tauri apps…"
                  rows={4}
                />
              </label>

              {/* ── Hidden Models ── */}
              {buddies.length > 0 && (
                <>
                  <div className="rm-settings-section-label">Visible Models</div>
                  <div className="rm-hide-model-list">
                    {buddies.map((b) => {
                      const isVisible = !draftSettings.hiddenModels.includes(b.modelName);
                      const rank = modelRankings.get(b.modelName);
                      return (
                        <div
                          key={b.modelName}
                          className={`rm-hide-model-item${isVisible ? " rm-model-visible" : " rm-model-hidden"}`}
                          onClick={() => toggleHideModel(b.modelName)}
                          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") toggleHideModel(b.modelName); }}
                          tabIndex={0}
                        >
                          <span className="rm-model-toggle" aria-hidden="true">{isVisible ? "✓" : ""}</span>
                          <span className="rm-hide-model-name">
                            {rank !== undefined && <span className="rm-rank-medal">{RANK_MEDALS[rank]}</span>}
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
