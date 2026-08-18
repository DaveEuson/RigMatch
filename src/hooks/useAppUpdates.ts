import { useCallback, useEffect, useState } from 'react';

import { agentArcadeApi } from '../api';
import { getErrorMessage } from '../lib/format';
import { getUpdateChannelLabel } from '../lib/updateLabels';
import type { AutoUpdateStatus, UpdateChannel, UpdateCheckResponse } from '../types';

// The app version whose update nudge the user dismissed — so the gentle popup
// shows once per new release, never nags for a version they've already seen.
const UPDATE_PROMPT_DISMISSED_KEY = 'rigmatch:update-prompt-dismissed:v1';

/**
 * Everything about shipping a newer RigMatch to the person running this one:
 * which channel they follow, what the last check found, the auto-updater's
 * progress, and the six actions the UI offers.
 *
 * Both effects stay inside, in their original order relative to each other and
 * to every other effect in App(). That is deliberate — the hook is called where
 * the effects were, not where the state was, so nothing about mount or cleanup
 * ordering changes. Only the five useState calls moved, and the compiler
 * rejects a read before its declaration.
 *
 * `setActivity` is a parameter: it writes the status line every screen shares,
 * which is not this hook's to own.
 */
export function useAppUpdates({ setActivity }: { setActivity: (message: string) => void }) {
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>('release');
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResponse | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<AutoUpdateStatus>({ phase: 'idle' });
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(UPDATE_PROMPT_DISMISSED_KEY); } catch { return null; }
  });

  useEffect(() => {
    return agentArcadeApi.onUpdaterStatus?.((status) => setAutoUpdateStatus(status));
  }, []);

  const downloadUpdate = useCallback(async () => {
    setAutoUpdateStatus({ phase: 'downloading', percent: 0 });
    try { await agentArcadeApi.downloadUpdate(); } catch { /* events handle feedback */ }
  }, []);

  const installUpdate = useCallback(() => {
    void agentArcadeApi.installUpdate();
  }, []);

  const selectUpdateChannel = useCallback((channel: UpdateChannel) => {
    setUpdateChannel(channel);
    setUpdateCheck(null);
    setActivity(`${getUpdateChannelLabel(channel)} channel selected.`);
  }, [setActivity]);

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    setActivity(`Checking ${getUpdateChannelLabel(updateChannel).toLowerCase()} upgrades...`);
    if (updateChannel === 'release') void agentArcadeApi.checkAutoUpdate();

    try {
      const result = await agentArcadeApi.checkForUpdates(updateChannel);
      setUpdateCheck(result);

      if (result.error) {
        setActivity(`Update check finished with a note: ${result.error}`);
      } else if (result.hasUpdate) {
        setActivity(`${result.latestName ?? 'A newer RigMatch build'} is available on the ${getUpdateChannelLabel(result.channel)} channel.`);
      } else {
        setActivity(`You are on the latest ${getUpdateChannelLabel(result.channel).toLowerCase()} build RigMatch found.`);
      }
    } catch (error) {
      setActivity(`Could not check for RigMatch upgrades: ${getErrorMessage(error)}`);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [updateChannel, setActivity]);

  const openUpdatePage = useCallback(async () => {
    try {
      const preferredUrl = updateCheck?.downloadKind === 'installer' ? updateCheck.downloadUrl : updateCheck?.releaseUrl;
      const opened = await agentArcadeApi.openUpdatePage(updateChannel, preferredUrl);
      const openedDirectInstaller = updateCheck?.downloadKind === 'installer' && opened.url === updateCheck.downloadUrl;
      setActivity(
        openedDirectInstaller
          ? `Opened ${updateCheck.downloadName ?? 'the matching RigMatch installer'} for download.`
          : `Opened RigMatch ${getUpdateChannelLabel(updateChannel).toLowerCase()} downloads.`,
      );
    } catch (error) {
      setActivity(`Could not open RigMatch downloads: ${getErrorMessage(error)}`);
    }
  }, [updateChannel, updateCheck, setActivity]);

  // Quietly check for a newer release once on launch so the gentle update nudge
  // can appear. Silent — no activity spam; if it fails, the popup just won't show.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await agentArcadeApi.checkForUpdates(updateChannel);
        if (!cancelled) setUpdateCheck(result);
      } catch { /* ignore — the popup just won't show */ }
    })();
    return () => { cancelled = true; };
    // Once on mount; the default release channel is the right nudge at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissUpdatePrompt = useCallback(() => {
    const version = updateCheck?.latestVersion;
    if (!version) return;
    setDismissedUpdateVersion(version);
    try { localStorage.setItem(UPDATE_PROMPT_DISMISSED_KEY, version); } catch { /* ignore */ }
  }, [updateCheck]);

  return {
    updateChannel,
    updateCheck,
    isCheckingUpdates,
    autoUpdateStatus,
    dismissedUpdateVersion,
    downloadUpdate,
    installUpdate,
    selectUpdateChannel,
    checkForUpdates,
    openUpdatePage,
    dismissUpdatePrompt,
  };
}
