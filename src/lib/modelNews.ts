import type { CatalogModel } from '../types';
import { writeLocalJson } from './safeStorage.ts';

export const MODEL_NEWS_STORAGE_KEY = 'rigmatch:model-news:v1';
export const MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY = 'rigmatch:model-news-notifications:v1';

export type ModelNotificationPermission = NotificationPermission | 'unsupported';

export type ModelNewsState = {
  knownModelIds: string[];
  firstSeenById: Record<string, string>;
  latestNewModelIds: string[];
  lastCheckedAt: string | null;
  lastNotifiedAt: string | null;
};

export type ModelNewsItem = {
  id: string;
  displayName: string;
  model: CatalogModel;
  firstSeenAt: string;
  installed: boolean;
};

export function getEmptyModelNewsState(): ModelNewsState {
  return {
    knownModelIds: [],
    firstSeenById: {},
    latestNewModelIds: [],
    lastCheckedAt: null,
    lastNotifiedAt: null,
  };
}

export function getSavedModelNewsState(): ModelNewsState {
  try {
    const raw = window.localStorage.getItem(MODEL_NEWS_STORAGE_KEY);
    if (!raw) return getEmptyModelNewsState();

    const parsed = JSON.parse(raw) as Partial<ModelNewsState>;
    return {
      knownModelIds: Array.isArray(parsed.knownModelIds) ? parsed.knownModelIds.filter((id): id is string => typeof id === 'string') : [],
      firstSeenById: parsed.firstSeenById && typeof parsed.firstSeenById === 'object' ? parsed.firstSeenById as Record<string, string> : {},
      latestNewModelIds: Array.isArray(parsed.latestNewModelIds) ? parsed.latestNewModelIds.filter((id): id is string => typeof id === 'string') : [],
      lastCheckedAt: typeof parsed.lastCheckedAt === 'string' ? parsed.lastCheckedAt : null,
      lastNotifiedAt: typeof parsed.lastNotifiedAt === 'string' ? parsed.lastNotifiedAt : null,
    };
  } catch {
    return getEmptyModelNewsState();
  }
}

export function saveModelNewsState(state: ModelNewsState) {
  writeLocalJson(MODEL_NEWS_STORAGE_KEY, state);
}

export function reconcileModelNews(models: CatalogModel[], current: ModelNewsState) {
  const now = new Date().toISOString();
  const previousIds = new Set(current.knownModelIds);
  const isBootstrap = previousIds.size === 0 && Object.keys(current.firstSeenById).length === 0;
  const modelIds = models.map(getModelNewsId).filter(Boolean);
  const nextFirstSeenById = { ...current.firstSeenById };
  const newModelIds: string[] = [];

  modelIds.forEach((id) => {
    if (!previousIds.has(id)) {
      if (!isBootstrap) newModelIds.push(id);
      nextFirstSeenById[id] = nextFirstSeenById[id] ?? now;
    } else {
      nextFirstSeenById[id] = nextFirstSeenById[id] ?? current.lastCheckedAt ?? now;
    }
  });

  return {
    isBootstrap,
    state: {
      knownModelIds: Array.from(new Set([...current.knownModelIds, ...modelIds])).sort(),
      firstSeenById: nextFirstSeenById,
      latestNewModelIds: newModelIds,
      lastCheckedAt: now,
      lastNotifiedAt: current.lastNotifiedAt,
    },
  };
}

export function getModelNewsItems(catalog: CatalogModel[], modelNews: ModelNewsState, installedNames: Set<string>): ModelNewsItem[] {
  return catalog
    .map((model) => {
      const id = getModelNewsId(model);
      const displayName = getCatalogModelDisplayName(model);
      return {
        id,
        displayName,
        model,
        firstSeenAt: modelNews.firstSeenById[id] ?? modelNews.lastCheckedAt ?? new Date().toISOString(),
        installed: installedNames.has(normalizeModelKey(displayName)),
      };
    })
    .sort((left, right) => {
      const dateDelta = Date.parse(right.firstSeenAt) - Date.parse(left.firstSeenAt);
      if (dateDelta !== 0) return dateDelta;
      return (right.model.pulls ?? 0) - (left.model.pulls ?? 0);
    });
}

export function getModelNewsId(model: Pick<CatalogModel, 'id' | 'name' | 'tag'>) {
  return model.id || normalizeModelKey(`${model.name}:${model.tag}`);
}

export function getCatalogModelDisplayName(model: Pick<CatalogModel, 'name' | 'tag'>) {
  return `${model.name}:${model.tag || 'latest'}`;
}

export function getSavedModelNewsNotificationsEnabled() {
  return window.localStorage.getItem(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY) === 'true';
}

export function getNotificationPermission(): ModelNotificationPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export function getNotificationDetail(enabled: boolean, permission: ModelNotificationPermission) {
  if (permission === 'unsupported') return 'Desktop notifications are not available in this runtime.';
  if (permission === 'denied') return 'Notifications are blocked by the operating system or browser.';
  if (enabled) return 'RigMatch will alert when a scan finds unseen catalog entries.';
  return 'Alerts are optional. What\'s New still updates locally when RigMatch scans.';
}

export function notifyNewModelDrops(catalog: CatalogModel[], modelIds: string[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || modelIds.length === 0) return;

  const names = modelIds
    .map((id) => catalog.find((model) => getModelNewsId(model) === id))
    .filter((model): model is CatalogModel => Boolean(model))
    .map(getCatalogModelDisplayName)
    .slice(0, 3);
  const body = modelIds.length === 1
    ? `${names[0] ?? 'A new model'} is now in the RigMatch catalog.`
    : `${modelIds.length} new models found${names.length ? `: ${names.join(', ')}` : ''}.`;

  try {
    const notification = new Notification('New Ollama models in RigMatch', {
      body,
      tag: 'rigmatch-model-drops',
    });
    notification.onclick = () => window.focus();
  } catch {
    // Notification construction can fail in restricted runtimes.
  }
}

function normalizeModelKey(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}
