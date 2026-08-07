import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Code2,
  History,
  Lightbulb,
  Network,
  PenLine,
  Settings,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { NavId, NavItem } from '../components/SideMenu';

export type ThemeId = 'orange' | 'avocado' | 'mustard' | 'teal' | 'chocolate';
export type UiMode = 'beginner' | 'advanced';

export const navItems: NavItem[] = [
  { id: 'models', label: 'Models', description: 'Browse, test, compare', icon: Boxes },
  { id: 'whatsNew', label: "What's New", description: 'New model drops', icon: Bell },
  { id: 'speedDate', label: 'Comparison', description: 'Ranked results & details', icon: Trophy },
  { id: 'history', label: 'Scorecards', description: 'Test rankings', icon: History },
  { id: 'agent', label: 'Top Pick', description: 'Best match profile', icon: Bot },
  { id: 'lan', label: 'Your Rig', description: 'Hardware & Local AI', icon: Network },
  { id: 'activity', label: 'Activity', description: 'Running tests & downloads', icon: Activity },
  { id: 'settings', label: 'Settings', description: 'Prefs, updates, support', icon: Settings },
];

export const SIMPLE_NAV_ORDER: NavId[] = ['lan', 'models', 'speedDate', 'history', 'agent', 'activity', 'settings'];
export const NAV_ITEM_BY_ID = new Map<NavId, NavItem>(navItems.map((item) => [item.id, item]));

export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/daveeuson';
export const AMAZON_AFFILIATE_TAG = 'daveeuson01-20';

/** Affiliate Amazon search URL for hardware-upgrade links. */
export function amazonUrl(query: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${AMAZON_AFFILIATE_TAG}`;
}
export const APP_VERSION = '0.4.3';
export { CURRENT_SCORE_SCHEMA_VERSION } from './scoring';
export const GITHUB_ISSUES_URL = 'https://github.com/DaveEuson/RigMatch/issues/new';
export const TEST_SUITE_STORAGE_KEY = 'rigmatch:test-suite:v1';
export const HISTORY_STORAGE_KEY = 'rigmatch:history:v1';
// Append-only benchmark timeline. Separate from HISTORY_STORAGE_KEY (a snapshot
// of current state) so a quota failure on one cannot take the other down.
// Declared in runHistory.ts to keep that module Node-testable; re-exported here
// so every storage key remains discoverable in one place.
export { RUN_HISTORY_STORAGE_KEY } from './runHistory';
export const THEME_STORAGE_KEY = 'agentArcadeTheme';
export const TUTORIAL_STORAGE_KEY = 'rigmatch:first-run-tutorial:v1';
export const UI_MODE_STORAGE_KEY = 'rigmatch:ui-mode:v1';
// Set once the user has picked Simple/Advanced on the first-launch splash. Kept
// separate from UI_MODE_STORAGE_KEY (which is auto-written with the default) so
// the splash shows exactly once, even for users upgrading from older builds.
export const MODE_SPLASH_STORAGE_KEY = 'rigmatch:mode-splash:v1';
export const ADVANCED_LAB_STORAGE_KEY = 'rigmatch:advanced-lab:v1';
export const CLEARED_TOP_MATCHES_STORAGE_KEY = 'rigmatch:cleared-top-matches:v1';
// Answer-grading preference: 'heuristic' (default) vs 'judge', plus the chosen
// local judge model. See judgeScoring.cjs for how the judge grades answers.
export const QUALITY_MODE_STORAGE_KEY = 'rigmatch:quality-mode:v1';
export const JUDGE_MODEL_STORAGE_KEY = 'rigmatch:judge-model:v1';
// Cloud judge (OpenRouter): strictly opt-in — sends graded content to the cloud
// and costs API credits, so it is never a default. The key stays on this computer.
export const JUDGE_SOURCE_STORAGE_KEY = 'rigmatch:judge-source:v1';
export const CLOUD_JUDGE_MODEL_STORAGE_KEY = 'rigmatch:cloud-judge-model:v1';
export const OPENROUTER_KEY_STORAGE_KEY = 'rigmatch:openrouter-key:v1';
export const DEFAULT_CLOUD_JUDGE_MODEL = 'anthropic/claude-haiku-4.5';
// Curated cloud judges: strong graders at low per-verdict cost. Judging sends a
// short rubric + answer (or app code) and reads back ~50 tokens of JSON, so even
// the pricier picks cost well under a cent per question. "Custom" stays available
// for any other OpenRouter model id.
export const CLOUD_JUDGE_PRESETS: Array<{ id: string; label: string }> = [
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 — fast & cheap, great grader (recommended)' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5 — strongest judgment' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini — cheap all-rounder' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast & cheap' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek — budget pick' },
];

export const DEFAULT_SHORTLIST_IDS = ['qwen2.5:7b', 'llama3.2:3b', 'mistral:7b', 'gemma3:4b', 'phi3:mini'];

export const themeOptions: Array<{
  id: ThemeId;
  label: string;
  description: string;
}> = [
  // id stays 'orange' so saved preferences survive; the palette itself is the
  // plum/pink :root block, which is what the label now describes.
  { id: 'orange', label: 'Stage Plum', description: 'Deep plum, heartbeat pink' },
  { id: 'avocado', label: 'Avocado Green', description: 'Earthy 70s green' },
  { id: 'mustard', label: 'Mustard Yellow', description: 'Warm studio yellow' },
  { id: 'teal', label: 'Retro Teal', description: 'Groovy cool teal' },
  { id: 'chocolate', label: 'Velvet Chocolate', description: 'Deep rich brown' },
];

export type ThemeSwatches = [string, string, string];

/**
 * The three tokens that actually differ between themes: the accent, the raised
 * surface, and the lit seam. `--gold` is deliberately absent — it is identical
 * in every theme, so it tells you nothing about the one you are picking.
 */
const THEME_SWATCH_TOKENS = ['--primary-rgb', '--panel-2', '--line-bright'] as const;

let themeSwatchCache: Map<ThemeId, ThemeSwatches> | null = null;

/**
 * Swatches are read from the custom properties each theme really applies rather
 * than kept as a second copy in this file. The copy drifted: it advertised
 * colors (#d95a27 and friends) that no theme in index.css has ever painted.
 */
function readThemeSwatches(): Map<ThemeId, ThemeSwatches> {
  const swatches = new Map<ThemeId, ThemeSwatches>();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  try {
    for (const theme of themeOptions) {
      probe.dataset.theme = theme.id;
      const style = getComputedStyle(probe);
      swatches.set(
        theme.id,
        THEME_SWATCH_TOKENS.map((token) => {
          const value = style.getPropertyValue(token).trim();
          if (!value) return 'transparent';
          // --primary-rgb is a bare "r, g, b" triplet so themes can composite it at any alpha.
          return token === '--primary-rgb' ? `rgb(${value})` : value;
        }) as ThemeSwatches,
      );
    }
  } finally {
    probe.remove();
  }
  return swatches;
}

export function getThemeSwatches(id: ThemeId): ThemeSwatches {
  if (!themeSwatchCache) {
    themeSwatchCache = readThemeSwatches();
  }
  return themeSwatchCache.get(id) ?? ['transparent', 'transparent', 'transparent'];
}

export const USE_CASE_CARDS: Array<{ icon: LucideIcon; title: string; description: string; prompt: string }> = [
  {
    icon: PenLine,
    title: 'Writing',
    description: 'Draft emails, letters, summaries, and blog posts',
    prompt: 'Help me write a short professional email to a client explaining that their project delivery will be delayed by one week.',
  },
  {
    icon: Code2,
    title: 'Coding',
    description: 'Explain code, fix bugs, write functions',
    prompt: 'Explain what this Python function does, then suggest how to make it faster:\n\ndef find_dupes(items):\n    seen = []\n    dupes = []\n    for item in items:\n        if item in seen:\n            dupes.append(item)\n        else:\n            seen.append(item)\n    return dupes',
  },
  {
    icon: BookOpen,
    title: 'Research',
    description: 'Summarize topics, explain concepts, answer questions',
    prompt: "Explain how large language models work in plain English, as if you're talking to someone who has never studied AI.",
  },
  {
    icon: ShieldCheck,
    title: 'Privacy',
    description: "Ask anything you wouldn't want searched online",
    prompt: "I'd like to understand my options for dealing with a difficult situation at work where my manager takes credit for my ideas. What are some approaches I could consider?",
  },
  {
    icon: Lightbulb,
    title: 'Brainstorm',
    description: 'Generate ideas, names, plans, and creative options',
    prompt: "I'm starting a small side project and need a name. It's a tool that helps people track their daily habits and reflect on their progress. Give me 10 name ideas, from professional to playful.",
  },
];
