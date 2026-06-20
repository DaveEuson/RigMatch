const SETTINGS_KEY = "rigmatch-chat-settings";

export type AppSettings = {
  ollamaUrl: string;
  userName: string;
  systemPrompt: string;
  activePersonalityId: string;
  personalityProfiles: PersonalityProfile[];
  theme: "dark" | "light";
  muted: boolean;
  hiddenModels: string[];
  showSystemMonitor: boolean;
};

export type PersonalityProfile = {
  id: string;
  name: string;
  instructions: string;
  avatarDataUrl?: string;
  builtIn?: boolean;
};

export const DEFAULT_PERSONALITY_ID = "default";

export const DEFAULT_PERSONALITY_PROFILES: PersonalityProfile[] = [
  {
    id: DEFAULT_PERSONALITY_ID,
    name: "RigMatch Buddy",
    instructions: "Be helpful, practical, and clear. Keep answers grounded in what the selected local model can actually do.",
    builtIn: true,
  },
  {
    id: "direct-helper",
    name: "Direct Helper",
    instructions: "Be concise and direct. Prioritize concrete steps, short answers, and practical tradeoffs.",
    builtIn: true,
  },
  {
    id: "creative-copilot",
    name: "Creative Copilot",
    instructions: "Be imaginative and collaborative while staying useful. Offer options, examples, and creative angles when they help.",
    builtIn: true,
  },
];

const DEFAULTS: AppSettings = {
  ollamaUrl: "http://localhost:11434",
  userName: "You",
  systemPrompt: "",
  activePersonalityId: DEFAULT_PERSONALITY_ID,
  personalityProfiles: DEFAULT_PERSONALITY_PROFILES,
  theme: "dark",
  muted: false,
  hiddenModels: [],
  showSystemMonitor: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return normalizeSettings({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) });
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const profileMap = new Map<string, PersonalityProfile>();
  for (const profile of DEFAULT_PERSONALITY_PROFILES) {
    profileMap.set(profile.id, profile);
  }
  for (const profile of settings.personalityProfiles ?? []) {
    const id = String(profile.id || "").trim();
    const name = String(profile.name || "").trim();
    if (!id || !name) continue;
    profileMap.set(id, {
      id,
      name: name.slice(0, 40),
      instructions: String(profile.instructions || "").slice(0, 4000),
      avatarDataUrl: typeof profile.avatarDataUrl === "string" ? profile.avatarDataUrl : undefined,
      builtIn: profile.builtIn === true || DEFAULT_PERSONALITY_PROFILES.some((p) => p.id === id),
    });
  }

  const personalityProfiles = Array.from(profileMap.values());
  const activePersonalityId = personalityProfiles.some((profile) => profile.id === settings.activePersonalityId)
    ? settings.activePersonalityId
    : DEFAULT_PERSONALITY_ID;

  return {
    ...settings,
    activePersonalityId,
    personalityProfiles,
  };
}
