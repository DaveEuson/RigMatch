// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { CatalogModel } from '../types';
import { groupRowsByFamily, type GroupedRow } from './modelGroups.ts';
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

/**
 * One row per family. A family can land as fourteen tags in one scan
 * (phonon:de, phonon:en, phonon:40m-es, ...), and as fourteen rows it filled
 * the screen with one maker, one size and one "seen" time.
 *
 * Unlike Models (MIN_VARIANTS_TO_GROUP), a family of one stays a plain row:
 * here every row has the same shape either way, and a lone model should open
 * in one click rather than behind a "1 version" toggle.
 */
export function groupModelNews(items: ModelNewsItem[]): Array<GroupedRow<ModelNewsItem>> {
  return groupRowsByFamily(items, { familyOf: (item) => getModelNewsFamily(item.model), minToGroup: 2 });
}

function getModelNewsFamily(model: Pick<CatalogModel, 'name' | 'tag'>) {
  return model.name || getCatalogModelDisplayName(model);
}

/**
 * How many models these ids are, counted as What's New lists them: a family is
 * one model however many tags it has. The tab counts, the pager, the top-bar
 * badge and the "N new models found" notes all count this way. The tabs
 * counted tags while the pager counted rows, so "Recently seen 312" sat over
 * "Showing 1–20 of 140".
 */
export function countModelNews(catalog: CatalogModel[], ids: string[]) {
  const wanted = new Set(ids);
  return new Set(catalog.filter((model) => wanted.has(getModelNewsId(model))).map(getModelNewsFamily)).size;
}

/** Rows per page of What's New. A family counts as one row however many tags it has. */
export const MODEL_NEWS_PAGE_SIZE = 20;

/**
 * One page of a list, with the page clamped to the ones that exist: the list
 * shrinks under a remembered page when a scan finds less than the last one.
 * `first` and `last` are 1-based, for "Showing 21–40 of 63"; both are 0 for an
 * empty list.
 */
export function getModelNewsPage<T>(entries: T[], page: number, pageSize = MODEL_NEWS_PAGE_SIZE) {
  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const shown = entries.slice(start, start + pageSize);
  return { entries: shown, page: current, pageCount, total, first: shown.length ? start + 1 : 0, last: start + shown.length };
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

  const found = modelIds
    .map((id) => catalog.find((model) => getModelNewsId(model) === id))
    .filter((model): model is CatalogModel => Boolean(model));
  const count = countModelNews(catalog, modelIds);
  const families = [...new Set(found.map(getModelNewsFamily))].slice(0, 3);
  const body = modelIds.length === 1
    ? `${found[0] ? getCatalogModelDisplayName(found[0]) : 'A new model'} is now in the RigMatch catalog.`
    : `${count} new model${count === 1 ? '' : 's'} found${families.length ? `: ${families.join(', ')}` : ''}.`;

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
