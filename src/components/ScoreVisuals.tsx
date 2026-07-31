import { ShieldCheck, Download } from 'lucide-react';
import type { BenchmarkPromptResult, BenchmarkResult, TestedModelScore } from '../types';
import { formatPullCount, getPopularityPercent, getScoreTone, getScoreTooltip } from '../lib/format';

/** Small presentational score/status widgets shared across panels. Extracted from App.tsx. */

export function RomanceArtBanner({
  image,
  className = '',
  kicker,
  title,
  body,
}: {
  image: string;
  className?: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <section
      className={`romance-art-banner ${className}`}
      style={{ backgroundImage: `url(${image})` }}
      aria-label={title}
    >
      <div>
        <span>{kicker}</span>
        <strong>{title}</strong>
        <em>{body}</em>
      </div>
    </section>
  );
}

export function ScoreRadar({ speed, sobriety, fit }: { speed: number; sobriety: number; fit: number }) {
  const size = 84;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.36;
  const axes = [
    { label: 'Speed', angle: -90, value: speed },
    { label: 'Accuracy', angle: 30, value: sobriety },
    { label: 'Fit', angle: 150, value: fit },
  ];
  const toXY = (angle: number, scale: number) => ({
    x: cx + r * scale * Math.cos((angle * Math.PI) / 180),
    y: cy + r * scale * Math.sin((angle * Math.PI) / 180),
  });
  const polygon = axes.map((a) => { const p = toXY(a.angle, a.value / 100); return `${p.x},${p.y}`; }).join(' ');
  const gridPoly = (s: number) => axes.map((a) => { const p = toXY(a.angle, s); return `${p.x},${p.y}`; }).join(' ');
  return (
    <svg className="score-radar" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {[0.33, 0.66, 1.0].map((s) => <polygon key={s} points={gridPoly(s)} className="radar-grid" />)}
      {axes.map((a) => { const p = toXY(a.angle, 1); return <line key={a.label} x1={cx} y1={cy} x2={p.x} y2={p.y} className="radar-axis" />; })}
      <polygon points={polygon} className="radar-fill" />
      {axes.map((a) => {
        const p = toXY(a.angle, 1.28);
        return <text key={a.label} x={p.x} y={p.y} className="radar-label" textAnchor="middle" dominantBaseline="middle">{a.label}</text>;
      })}
    </svg>
  );
}

export function ScoreSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 72, h = 24;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="score-sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} className="sparkline-line" fill="none" />
      {(() => { const last = values[values.length - 1]; const lx = w; const ly = h - ((last - min) / range) * (h - 4) - 2; return <circle cx={lx} cy={ly} r="2.5" className="sparkline-dot" />; })()}
    </svg>
  );
}

export function PopularityMeter({ pulls }: { pulls?: number | null }) {
  const hasPulls = pulls != null && Number.isFinite(pulls) && pulls > 0;
  const pullCount = hasPulls ? Number(pulls) : 0;
  const percent = getPopularityPercent(pulls);
  const label = hasPulls ? `${formatPullCount(pullCount)} pulls` : 'No pull data';

  return (
    <div
      className={hasPulls ? 'popularity-meter' : 'popularity-meter empty'}
      title={hasPulls ? `${pullCount.toLocaleString()} pulls from the Ollama library catalog` : 'Ollama local API does not expose public pull counts for this model'}
    >
      <span>{label}</span>
      <div className="popularity-track" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ModelScorePill({ score }: { score?: TestedModelScore }) {
  if (!score) {
    return (
      <span className="score-pill empty" title="Not tested yet. Run a test to score this model on this computer.">
        <strong>--</strong>
        <em>Test</em>
      </span>
    );
  }

  return (
    <span
      className={`score-pill ${getScoreTone(score.total)}`}
      title={`Match ${score.total} · ${score.grade}; speed ${score.speed}, accuracy ${score.sobriety}`}
    >
      <strong>{score.total}</strong>
      <em>{score.grade}</em>
    </span>
  );
}

export function ScoreLegend() {
  return (
    <div className="score-legend-strip" aria-label="Match score legend">
      <span>Match score</span>
      <strong>Answer quality + speed + finish rate + computer fit.</strong>
      <em>S is best, then A/B/C. Scores are local to this computer.</em>
    </div>
  );
}

export function ModelStatusPill({
  installed,
  queued,
  label,
}: {
  installed: boolean;
  queued: boolean;
  label: string;
}) {
  const Icon = installed ? ShieldCheck : queued ? Download : Download;
  const tone = installed ? 'installed' : queued ? 'queued' : 'available';

  return (
    <span className={`model-status-pill ${tone}`}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

export function PromptStatusPill({ status }: { status?: BenchmarkPromptResult['status'] }) {
  if (!status || status === 'ok') return null;

  const label = status === 'no-response'
    ? 'No response'
    : status === 'truncated'
      ? 'Truncated'
      : 'Failed';

  return <span className={`prompt-status-pill ${status}`}>{label}</span>;
}

export function ScoreBars({
  benchmark,
  score,
  active,
}: {
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  active: boolean;
}) {
  const avgTps = benchmark?.avgTokensPerSecond ?? benchmark?.prompts[0]?.tokensPerSecond;
  const firstTokenMs = benchmark?.avgFirstTokenMs ?? benchmark?.prompts[0]?.elapsedMs;
  const avgResponseMs = benchmark?.avgLatencyMs;
  const rows = [
    { label: 'Speed (tok/s)', value: avgTps, max: 140, unit: ' tok/s', raw: avgTps },
    { label: 'Generation Speed', value: score?.speed ?? benchmark?.scores.speed, max: 100, unit: '%' },
    {
      label: 'Avg Response Time',
      value: avgResponseMs,
      max: 30000,
      unit: 'ms',
      display: avgResponseMs != null ? (avgResponseMs >= 1000 ? `${(avgResponseMs / 1000).toFixed(1)}s` : `${avgResponseMs}ms`) : undefined,
    },
    {
      label: 'First Token',
      value: firstTokenMs,
      max: 10000,
      unit: 'ms',
      display: firstTokenMs != null ? (firstTokenMs >= 1000 ? `${(firstTokenMs / 1000).toFixed(1)}s` : `${firstTokenMs}ms`) : undefined,
      invertBar: true,
    },
    { label: 'Answer Quality', value: score?.sobriety ?? benchmark?.scores.sobriety, max: 100, unit: '%' },
  ];
  const hasScore = Boolean(score || benchmark);

  return (
    <div className="score-bars">
      <div className="overall-progress">
        <span>Overall Progress</span>
        <strong>{active ? '42%' : hasScore ? '100%' : 'N/A'}</strong>
        <i style={{ width: active ? '42%' : hasScore ? '100%' : '0%' }} />
      </div>
      {rows.map((row) => {
        const pct = Number.isFinite(row.value) ? Math.min(100, ((row.value ?? 0) / row.max) * 100) : 0;
        const barPct = row.invertBar ? Math.max(0, 100 - pct) : pct;
        const displayVal = row.display ?? (Number.isFinite(row.value) ? `${Math.round(row.value ?? 0)}${row.unit}` : 'N/A');
        return (
          <div className={Number.isFinite(row.value) ? 'bar-row' : 'bar-row empty'} key={row.label}>
            <span>{row.label}</span>
            <div>
              <i style={{ width: `${barPct}%` }} />
            </div>
            <strong>{displayVal}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreTile({
  label,
  value,
  grade,
  tone,
}: {
  label: string;
  value?: number;
  grade?: string;
  tone: 'pink' | 'gold' | 'green';
}) {
  const tooltip = getScoreTooltip(label);
  const hasValue = Number.isFinite(value);

  return (
    <div
      className={`score-tile ${tone}${hasValue ? '' : ' empty'}`}
      title={hasValue ? tooltip : `No ${label.toLowerCase()} score yet. Run a test for this model.`}
      aria-label={hasValue ? `${label}: ${value}, ${grade}. ${tooltip}` : `${label}: not scored yet.`}
    >
      <span>{label}</span>
      <strong>{hasValue ? value : 'N/A'}</strong>
      <em>{grade ?? 'N/A'}</em>
    </div>
  );
}
