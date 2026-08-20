// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getEmptyModelNewsState,
  getNotificationPermission,
  getSavedModelNewsNotificationsEnabled,
  getSavedModelNewsState,
  MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY,
  notifyNewModelDrops,
  reconcileModelNews,
  saveModelNewsState,
  type ModelNewsState,
  type ModelNotificationPermission,
} from '../lib/modelNews';
import { writeLocal } from '../lib/safeStorage';
import type { CatalogModel } from '../types';

/**
 * Which Ollama models are new since the user last looked, and whether to say so
 * out loud.
 *
 * The two refs are the point of this hook. The rig scan is a stable callback
 * that must not be rebuilt every time the news changes, so it reads current
 * values through refs instead of closing over state — and because a ref written
 * by an effect updates too late for code that has only just called its setter,
 * every writer also had to poke `.current` by hand. Four places were doing that:
 * the scan, the notifications toggle, "clear all data", and the sync effects
 * below. Miss one and the next scan reconciles against a stale snapshot, which
 * shows up as new models silently never being announced.
 *
 * So the refs stay private and the two callers get methods instead.
 */
export function useModelNews({ setActivity }: { setActivity: (message: string) => void }) {
  const [modelNews, setModelNews] = useState<ModelNewsState>(() => getSavedModelNewsState());
  const [modelNewsNotificationsEnabled, setModelNewsNotificationsEnabled] = useState(() => getSavedModelNewsNotificationsEnabled());
  const [notificationPermission, setNotificationPermission] = useState<ModelNotificationPermission>(() => getNotificationPermission());

  const modelNewsRef = useRef(modelNews);
  const modelNewsNotificationsEnabledRef = useRef(modelNewsNotificationsEnabled);

  useEffect(() => {
    modelNewsRef.current = modelNews;
  }, [modelNews]);

  useEffect(() => {
    modelNewsNotificationsEnabledRef.current = modelNewsNotificationsEnabled;
  }, [modelNewsNotificationsEnabled]);

  /**
   * Fold a fresh catalogue into the news, notifying if that is wanted and
   * allowed. Returns the state it settled on so the caller can word its own
   * "N new models found" note.
   */
  const applyCatalogNews = useCallback((models: CatalogModel[]): ModelNewsState => {
    const newsUpdate = reconcileModelNews(models, modelNewsRef.current);
    const shouldNotify = newsUpdate.state.latestNewModelIds.length > 0
      && modelNewsNotificationsEnabledRef.current
      && getNotificationPermission() === 'granted';
    const nextNewsState = shouldNotify
      ? { ...newsUpdate.state, lastNotifiedAt: new Date().toISOString() }
      : newsUpdate.state;

    modelNewsRef.current = nextNewsState;
    setModelNews(nextNewsState);
    saveModelNewsState(nextNewsState);

    if (shouldNotify) {
      notifyNewModelDrops(models, nextNewsState.latestNewModelIds);
    }

    return nextNewsState;
  }, []);

  /**
   * The in-memory half of "clear all data". Storage is not touched here.
   *
   * This did remove its own two keys, which read as good cohesion until the
   * wipe was audited: the app writes twenty-four keys and the wipe removed
   * eight, precisely because each owner was trusted to remember its own. One
   * namespace sweep in clearAppStorage() is the only version of this that can
   * be complete, so ownership of storage moved there and this resets state.
   */
  const resetModelNews = useCallback(() => {
    const nextModelNews = getEmptyModelNewsState();
    modelNewsRef.current = nextModelNews;
    setModelNews(nextModelNews);
    modelNewsNotificationsEnabledRef.current = false;
    setModelNewsNotificationsEnabled(false);
  }, []);

  const toggleModelNewsNotifications = useCallback(async () => {
    const permission = getNotificationPermission();
    setNotificationPermission(permission);

    if (modelNewsNotificationsEnabled) {
      setModelNewsNotificationsEnabled(false);
      modelNewsNotificationsEnabledRef.current = false;
      writeLocal(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY, 'false');
      setActivity('Model drop notifications are off. What\'s New will still update when RigMatch scans.');
      return;
    }

    if (permission === 'unsupported') {
      setActivity('This runtime does not support desktop notifications, but What\'s New will still track model drops.');
      return;
    }

    let nextPermission = permission;
    if (permission === 'default') {
      nextPermission = await Notification.requestPermission();
      setNotificationPermission(nextPermission);
    }

    if (nextPermission !== 'granted') {
      setActivity('Notifications were not enabled. You can still check What\'s New inside RigMatch.');
      return;
    }

    setModelNewsNotificationsEnabled(true);
    modelNewsNotificationsEnabledRef.current = true;
    writeLocal(MODEL_NEWS_NOTIFICATIONS_STORAGE_KEY, 'true');
    setActivity('Model drop notifications are on. RigMatch will alert you when a scan finds new Ollama models.');
  }, [modelNewsNotificationsEnabled, setActivity]);

  return {
    modelNews,
    modelNewsNotificationsEnabled,
    notificationPermission,
    applyCatalogNews,
    resetModelNews,
    toggleModelNewsNotifications,
  };
}
