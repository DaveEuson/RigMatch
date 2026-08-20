// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useState } from 'react';

import { agentArcadeApi } from '../api';
import { getErrorMessage } from '../lib/format';
import { formatLogsForClipboard } from '../lib/modelCatalog';
import type { AppLogEntry } from '../types';

/**
 * The run log: what it holds, and every way the UI touches it.
 *
 * In App() the three pieces of state sat six hundred lines above the five
 * callbacks that own them, which is the actual cost of a 3,796-line component —
 * not the length, but that nothing related is near anything else related.
 *
 * The two setters come in as arguments rather than being pulled in here.
 * `setActivity` writes the status line every screen shares, and
 * `setActiveNavId` moves the whole app to another panel; neither belongs to
 * logging, and taking them as parameters keeps the direction of ownership
 * honest — this hook reports what it did, it does not decide where the user is.
 */
export function useAppLogs({
  setActivity,
  setActiveNavId,
}: {
  setActivity: (message: string) => void;
  setActiveNavId: (id: 'history') => void;
}) {
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [logPath, setLogPath] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);

    try {
      const result = await agentArcadeApi.getLogs(200);
      setAppLogs(result.entries);
      setLogPath(result.logPath);
      setActivity(`Loaded ${result.entries.length} log entr${result.entries.length === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
      setActivity(`Log load failed: ${getErrorMessage(error)}`);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [setActivity]);

  const openLogsPanel = useCallback(() => {
    setActiveNavId('history');
    void loadLogs();
  }, [loadLogs, setActiveNavId]);

  const clearLogs = useCallback(async () => {
    try {
      const result = await agentArcadeApi.clearLogs();
      setAppLogs(result.entries);
      setLogPath(result.logPath);
      setActivity('Run logs cleared.');
    } catch (error) {
      setActivity(`Could not clear logs: ${getErrorMessage(error)}`);
    }
  }, [setActivity]);

  const openLogsFolder = useCallback(async () => {
    try {
      const result = await agentArcadeApi.openLogsFolder();
      setLogPath(result.logPath);
      setActivity('Log folder opened.');
    } catch (error) {
      setActivity(`Could not open log folder: ${getErrorMessage(error)}`);
    }
  }, [setActivity]);

  const copyLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatLogsForClipboard(appLogs));
      setActivity(`Copied ${appLogs.length} log entr${appLogs.length === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
      setActivity(`Could not copy logs: ${getErrorMessage(error)}`);
    }
  }, [appLogs, setActivity]);

  /**
   * Adopt whatever the backend reports after a wipe.
   *
   * "Clear all data" resets far more than logging, so it cannot go through
   * clearLogs() — but handing that flow the raw setters would let anything
   * write arbitrary entries. One named entry point says what it is for.
   */
  const adoptClearedLogs = useCallback((result: { entries: AppLogEntry[]; logPath: string }) => {
    setAppLogs(result.entries);
    setLogPath(result.logPath);
  }, []);

  return {
    appLogs,
    logPath,
    isLoadingLogs,
    loadLogs,
    openLogsPanel,
    clearLogs,
    openLogsFolder,
    copyLogs,
    adoptClearedLogs,
  };
}
