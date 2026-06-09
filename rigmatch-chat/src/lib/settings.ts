const SETTINGS_KEY = "rigmatch-chat-settings";

export type AppSettings = {
  ollamaUrl: string;
  userName: string;
  systemPrompt: string;
  theme: "dark" | "light";
  muted: boolean;
  hiddenModels: string[];
};

const DEFAULTS: AppSettings = {
  ollamaUrl: "http://localhost:11434",
  userName: "You",
  systemPrompt: "",
  theme: "dark",
  muted: false,
  hiddenModels: [],
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
