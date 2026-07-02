import {
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
  { id: 'settings', label: 'Settings', description: 'Prefs, updates, support', icon: Settings },
];

export const SIMPLE_NAV_ORDER: NavId[] = ['lan', 'models', 'speedDate', 'history', 'agent', 'settings'];
export const NAV_ITEM_BY_ID = new Map<NavId, NavItem>(navItems.map((item) => [item.id, item]));

export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/daveeuson';
export const AMAZON_AFFILIATE_TAG = 'daveeuson01-20';
export const APP_VERSION = '0.2.6';
export { CURRENT_SCORE_SCHEMA_VERSION } from './scoring';
export const GITHUB_ISSUES_URL = 'https://github.com/DaveEuson/RigMatch.AI/issues/new';
export const TEST_SUITE_STORAGE_KEY = 'rigmatch:test-suite:v1';
export const HISTORY_STORAGE_KEY = 'rigmatch:history:v1';
export const THEME_STORAGE_KEY = 'agentArcadeTheme';
export const TUTORIAL_STORAGE_KEY = 'rigmatch:first-run-tutorial:v1';
export const UI_MODE_STORAGE_KEY = 'rigmatch:ui-mode:v1';
export const ADVANCED_LAB_STORAGE_KEY = 'rigmatch:advanced-lab:v1';
export const CLEARED_TOP_MATCHES_STORAGE_KEY = 'rigmatch:cleared-top-matches:v1';

export const DEFAULT_SHORTLIST_IDS = ['qwen2.5:7b', 'llama3.2:3b', 'mistral:7b', 'gemma3:4b', 'phi3:mini'];

export const themeOptions: Array<{
  id: ThemeId;
  label: string;
  description: string;
  swatches: [string, string, string];
}> = [
  { id: 'orange', label: 'Studio Orange', description: 'Classic burnt orange', swatches: ['#d95a27', '#e8a838', '#5b7c53'] },
  { id: 'avocado', label: 'Avocado Green', description: 'Earthy 70s green', swatches: ['#5b7c53', '#e8a838', '#386377'] },
  { id: 'mustard', label: 'Mustard Yellow', description: 'Warm studio yellow', swatches: ['#e8a838', '#d95a27', '#4a3f35'] },
  { id: 'teal', label: 'Retro Teal', description: 'Groovy cool teal', swatches: ['#386377', '#d95a27', '#e8a838'] },
  { id: 'chocolate', label: 'Velvet Chocolate', description: 'Deep rich brown', swatches: ['#4a3f35', '#e8a838', '#d95a27'] },
];

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
