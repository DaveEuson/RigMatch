// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useMemo, useState } from 'react';
import type { AppLogEntry, AppLogLevel } from '../types';
import { formatLogDetails, formatLogTime } from '../lib/modelCatalog';

const LEVELS: Array<{ id: AppLogLevel; label: string }> = [
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

/**
 * My PC › Logs: everything RigMatch wrote down, filterable.
 *
 * It replaced a twelve-line console at the bottom of Results, which showed the
 * latest entries with no way to narrow them. Sources and levels come from the
 * entries themselves, so a source nobody planned for still gets its own tab.
 * Following live re-reads the log every five seconds while the window is in
 * front; pausing keeps the list still while you read it.
 */
export function LogsView({
  entries,
  logPath,
  loading,
  onRefresh,
  onCopy,
  onOpenFolder,
  onClear,
}: {
  entries: AppLogEntry[];
  logPath: string;
  loading: boolean;
  onRefresh: () => void;
  onCopy: () => void;
  onOpenFolder: () => void;
  onClear: () => void;
}) {
  const [source, setSource] = useState<string>('all');
  const [levels, setLevels] = useState<Set<AppLogLevel>>(() => new Set(['info', 'warn', 'error']));
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (!following) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') onRefresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [following, onRefresh]);

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const needle = query.trim().toLowerCase();
  const shown = entries.filter((entry) => (source === 'all' || entry.source === source)
    && levels.has(entry.level)
    && (!needle || entry.message.toLowerCase().includes(needle) || entry.source.toLowerCase().includes(needle)));

  const toggleLevel = (level: AppLogLevel) => {
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  };

  return (
    <section className="logs-view" aria-label="Logs">
      <div className="logs-toolbar">
        <div className="logs-sources" role="group" aria-label="Source">
          <button type="button" className="chip" aria-pressed={source === 'all'} onClick={() => setSource('all')}>
            All <span className="logs-count">{entries.length}</span>
          </button>
          {sources.map(([name, count]) => (
            <button key={name} type="button" className="chip" aria-pressed={source === name} onClick={() => setSource(name)}>
              {name} <span className="logs-count">{count}</span>
            </button>
          ))}
        </div>
        <label className="logs-search">
          <span className="sr-only">Search logs</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search logs" />
        </label>
      </div>

      <div className="logs-toolbar">
        <div className="logs-levels" role="group" aria-label="Levels">
          <span>Show</span>
          {LEVELS.map((level) => (
            <label key={level.id} className={`logs-level ${level.id}`}>
              <input type="checkbox" checked={levels.has(level.id)} onChange={() => toggleLevel(level.id)} />
              <i aria-hidden="true" />
              {level.label}
            </label>
          ))}
        </div>
        <div className="logs-actions">
          <button
            type="button"
            className={following ? 'btn btn-line btn-sm logs-following' : 'btn btn-line btn-sm'}
            aria-pressed={following}
            onClick={() => setFollowing((on) => !on)}
          >
            {following ? 'Following live' : 'Paused'}
          </button>
          <button type="button" className="btn btn-line btn-sm" onClick={onRefresh} disabled={loading}>
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-line btn-sm" onClick={onCopy} disabled={entries.length === 0}>Copy</button>
          <button type="button" className="btn btn-line btn-sm" onClick={onOpenFolder}>Open folder</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onClear} disabled={entries.length === 0}>Clear</button>
        </div>
      </div>

      <div className="logs-pane" role="log" aria-live="off" aria-label="Log entries">
        {shown.length === 0 ? (
          <p className="logs-empty">
            {entries.length === 0
              ? 'Nothing logged yet. Failed tests, downloads and connection errors are written here.'
              : 'No entries match these filters.'}
          </p>
        ) : shown.map((entry) => {
          const details = formatLogDetails(entry.details);
          return (
            <div key={entry.id} className={`logs-row ${entry.level}`}>
              <span className="logs-time">{formatLogTime(entry.timestamp)}</span>
              <span className="logs-source">{entry.source}</span>
              <span className="logs-level-tag">{entry.level}</span>
              <span className="logs-message">
                {entry.message}
                {details && (
                  <details>
                    <summary>Details</summary>
                    <pre>{details}</pre>
                  </details>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="logs-path">{shown.length} of {entries.length} shown · {logPath || 'The log file is created with the first entry.'}</p>
    </section>
  );
}
