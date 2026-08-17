import { formatLogDetails, formatLogTime } from '../lib/modelCatalog';
import type { AppLogEntry } from '../types';

export function LogEntry({ entry }: { entry: AppLogEntry }) {
  const details = formatLogDetails(entry.details);

  return (
    <article className={`log-entry ${entry.level}`}>
      <div className="log-entry-meta">
        <span>{formatLogTime(entry.timestamp)}</span>
        <strong>{entry.level}</strong>
        <em>{entry.source}</em>
      </div>
      <p>{entry.message}</p>
      {details && (
        <details>
          <summary>Details</summary>
          <pre>{details}</pre>
        </details>
      )}
    </article>
  );
}
