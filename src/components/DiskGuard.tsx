import { getDiskGuard } from '../lib/modelCatalog';

export function DiskGuard({ guard }: { guard: ReturnType<typeof getDiskGuard> }) {
  return (
    <div className={`disk-guard ${guard.tone}`}>
      <div>
        <span>Storage</span>
        <strong>{guard.summary}</strong>
      </div>
      <div className="disk-bar" aria-label={guard.summary}>
        <i style={{ width: `${guard.percent}%` }} />
      </div>
      <em>{guard.message}</em>
    </div>
  );
}
