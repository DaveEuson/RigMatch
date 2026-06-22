import { RefreshCw, type LucideIcon } from 'lucide-react';
import rigmatchBrandIcon from '../assets/rigmatch-brand-icon.svg';

export function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <img src={rigmatchBrandIcon} alt="" draggable={false} />
    </div>
  );
}

export function PanelHeader({
  icon: Icon,
  title,
  actionLabel,
  onAction,
  busy = false,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  meta?: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <Icon aria-hidden="true" />
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
      <button type="button" className="mini-button" onClick={onAction} disabled={busy}>
        <RefreshCw className={busy ? 'spin' : ''} aria-hidden="true" />
        {actionLabel}
      </button>
    </div>
  );
}

export function MetricTile({ label, value, level }: { label: string; value: string; level: number }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="mini-bars" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <i key={index} className={index < Math.round((level / 100) * 18) ? 'lit' : ''} />
        ))}
      </div>
    </div>
  );
}
