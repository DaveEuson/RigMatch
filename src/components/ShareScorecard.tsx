import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import type { SystemProfile, TestedModelScore } from '../types';
import { getShortModelName } from '../lib/modelCatalog';

// Where a shared scorecard sends people — the marketing landing page, which then
// funnels to the live demo or a download.
const SHARE_URL = 'https://daveeuson.github.io/RigMatch/';
const CARD_W = 1200;
const CARD_H = 675;

type CardStyle = 'datingshow' | 'scorecard';

// Card palette (canvas can't read CSS vars). Mirrors the app's dark + gold look.
const COLORS = {
  bgTop: '#0d1117',
  bgBottom: '#161b22',
  datingBg: '#0e0b12',
  panel: '#1d2533',
  panel2: '#151c28',
  line: '#2c3b4d',
  gold: '#ffc957',
  coral: '#ff6f86',
  text: '#f7f0df',
  muted: '#b9b1a3',
  quiet: '#7d8793',
  speed: '#69d1c8',
  quality: '#ffc957',
  fit: '#9bc278',
};

function gradeColor(grade: string): string {
  const g = grade.charAt(0).toUpperCase();
  if (g === 'S' || g === 'A') return COLORS.gold;
  if (g === 'B') return COLORS.speed;
  if (g === 'C') return COLORS.fit;
  return COLORS.quiet;
}

// Deterministic confetti (no Math.random, so the card renders identically every
// time) scattered in the margins, clear of the center content.
const CONFETTI: Array<{ x: number; y: number; s: number; r: number; c: keyof typeof COLORS }> = [
  { x: 120, y: 40, s: 16, r: 0.3, c: 'gold' }, { x: 300, y: 26, s: 12, r: 0.8, c: 'coral' },
  { x: 520, y: 46, s: 13, r: 0.5, c: 'speed' }, { x: 700, y: 24, s: 12, r: 1.1, c: 'fit' },
  { x: 900, y: 42, s: 16, r: 0.2, c: 'coral' }, { x: 1064, y: 30, s: 12, r: 0.7, c: 'gold' },
  { x: 66, y: 180, s: 14, r: 0.6, c: 'coral' }, { x: 128, y: 300, s: 12, r: 1.0, c: 'speed' },
  { x: 58, y: 432, s: 16, r: 0.4, c: 'gold' }, { x: 150, y: 528, s: 12, r: 0.9, c: 'fit' },
  { x: 1132, y: 190, s: 14, r: 0.5, c: 'fit' }, { x: 1078, y: 312, s: 12, r: 1.2, c: 'gold' },
  { x: 1142, y: 442, s: 16, r: 0.3, c: 'coral' }, { x: 1052, y: 536, s: 12, r: 0.8, c: 'speed' },
  { x: 210, y: 612, s: 12, r: 0.6, c: 'gold' }, { x: 992, y: 616, s: 14, r: 0.4, c: 'coral' },
];

function drawConfetti(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const p of CONFETTI) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = COLORS[p.c];
    ctx.beginPath();
    ctx.roundRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62, 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// A filled heart centered at (cx, cy); `size` is roughly the half-width.
function fillHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, alpha = 1) {
  const s = size;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx, cy, cx - s, cy, cx - s, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s, cy + s * 0.7, cx, cy + s * 0.95, cx, cy + s * 1.15);
  ctx.bezierCurveTo(cx, cy + s * 0.95, cx + s, cy + s * 0.7, cx + s, cy + s * 0.35);
  ctx.bezierCurveTo(cx + s, cy, cx, cy, cx, cy + s * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Rounded inner border for a "framed card" feel.
function drawFrame(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(18, 18, CARD_W - 36, CARD_H - 36, 20);
  ctx.stroke();
  ctx.restore();
}

// A graphic stat chip: colored value + label in a bordered pill.
function drawStatChip(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, w: number, h: number,
  emoji: string, label: string, value: number, color: string,
) {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '800 30px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(`${emoji} ${Math.round(value)}`, cx, cy + 2);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, cx, cy + 24);
}

function rigParts(system: SystemProfile, showHostname: boolean): string[] {
  return [
    system.gpu.model && system.gpu.model !== 'Unknown GPU' ? system.gpu.model : null,
    system.gpu.vramGb > 0 ? `${Math.round(system.gpu.vramGb)} GB VRAM` : null,
    system.memory.totalGb > 0 ? `${Math.round(system.memory.totalGb)} GB RAM` : null,
    system.cpu.brand || null,
    showHostname && system.hostname ? system.hostname : null,
  ].filter(Boolean) as string[];
}

// Stats-forward card: grade badge, sub-score bars, rig strip. The "just the numbers"
// look for people who want to show the measurement.
function drawScorecard(
  ctx: CanvasRenderingContext2D,
  opts: { modelName: string; score: TestedModelScore; system: SystemProfile; showHostname: boolean },
) {
  const { modelName, score, system, showHostname } = opts;
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  drawFrame(ctx, COLORS.line);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(0, 0, CARD_W, 6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('RigMatch', 60, 82);
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('The AI dating game show for your PC', 62, 108);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 130);
  ctx.lineTo(CARD_W - 60, 130);
  ctx.stroke();

  const bx = 60, by = 165, bs = 175;
  ctx.fillStyle = COLORS.panel;
  ctx.beginPath();
  ctx.roundRect(bx, by, bs, bs, 22);
  ctx.fill();
  ctx.strokeStyle = gradeColor(score.grade);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(bx, by, bs, bs, 22);
  ctx.stroke();
  ctx.fillStyle = gradeColor(score.grade);
  ctx.font = '800 104px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(score.grade, bx + bs / 2, by + bs / 2 + 38);
  ctx.textAlign = 'left';

  const tx = bx + bs + 44;
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('TOP MATCH ON THIS PC', tx, by + 30);
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(modelName, tx, by + 96);
  ctx.font = '400 27px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${score.total} / 100 Match Score`, tx, by + 142);

  const bars: Array<{ label: string; value: number; color: string }> = [
    { label: 'Speed', value: score.speed, color: COLORS.speed },
    { label: 'Quality', value: score.sobriety, color: COLORS.quality },
    { label: 'Fit', value: score.fit, color: COLORS.fit },
  ];
  const barX = 200, barW = 820, barTop = 400, barGap = 54, barH = 20;
  bars.forEach((bar, i) => {
    const y = barTop + i * barGap;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(bar.label, 60, y + barH - 2);
    ctx.fillStyle = COLORS.panel;
    ctx.beginPath();
    ctx.roundRect(barX, y, barW, barH, 10);
    ctx.fill();
    const pct = Math.max(0, Math.min(100, bar.value)) / 100;
    ctx.fillStyle = bar.color;
    ctx.beginPath();
    ctx.roundRect(barX, y, Math.max(barH, barW * pct), barH, 10);
    ctx.fill();
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(bar.value)), CARD_W - 60, y + barH - 2);
    ctx.textAlign = 'left';
  });

  const rigY = 580, rigH = 60;
  ctx.fillStyle = COLORS.panel;
  ctx.beginPath();
  ctx.roundRect(60, rigY, CARD_W - 120, rigH, 12);
  ctx.fill();
  ctx.font = '500 21px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(rigParts(system, showHostname).join('   ·   '), 82, rigY + 38);

  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillStyle = COLORS.quiet;
  ctx.fillText('100% local · no cloud · no account', 60, CARD_H - 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('daveeuson.github.io/RigMatch', CARD_W - 60, CARD_H - 22);
  ctx.textAlign = 'left';
}

// On-brand "It's a Match!" card: the dating-show reveal. Same real data, playful
// framing — the model that won this PC's heart.
function drawDatingCard(
  ctx: CanvasRenderingContext2D,
  opts: { modelName: string; score: TestedModelScore; system: SystemProfile; showHostname: boolean },
) {
  const { modelName, score, system, showHostname } = opts;
  ctx.fillStyle = COLORS.datingBg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, -40, 60, CARD_W / 2, 300, 760);
  glow.addColorStop(0, 'rgba(255, 111, 134, 0.20)');
  glow.addColorStop(0.5, 'rgba(255, 201, 87, 0.08)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Decorative layer (behind the content): confetti, floating hearts, frame.
  drawConfetti(ctx);
  fillHeart(ctx, 158, 156, 20, COLORS.coral, 0.5);
  fillHeart(ctx, 1052, 150, 16, COLORS.gold, 0.45);
  fillHeart(ctx, 1092, 470, 14, COLORS.coral, 0.4);
  fillHeart(ctx, 96, 470, 13, COLORS.gold, 0.4);
  drawFrame(ctx, COLORS.gold);

  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(0, 0, CARD_W, 6);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = '800 38px system-ui, sans-serif';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('✨  IT’S A MATCH!  ✨', CARD_W / 2, 96);

  ctx.font = '84px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillText('\u{1F49B}', CARD_W / 2, 210);

  ctx.font = '800 62px system-ui, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(modelName, CARD_W / 2, 300);

  const whose = showHostname && system.hostname ? `${system.hostname}’s` : 'your PC’s';
  ctx.font = '400 27px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`won ${whose} heart on RigMatch`, CARD_W / 2, 344);

  // Grade + score pill.
  const pillText = `GRADE ${score.grade}    ·    ${score.total} / 100 MATCH`;
  ctx.font = '800 26px system-ui, sans-serif';
  const pw = ctx.measureText(pillText).width + 56;
  const px = (CARD_W - pw) / 2, py = 388, ph = 56;
  ctx.fillStyle = 'rgba(255, 201, 87, 0.12)';
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 28);
  ctx.fill();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 28);
  ctx.stroke();
  ctx.fillStyle = COLORS.gold;
  ctx.fillText(pillText, CARD_W / 2, py + 37);

  // Graphic stat chips — Speed / Quality / Fit, three across and centered.
  const chipW = 220, chipH = 66, chipGap = 26, chipY = 486;
  const groupW = chipW * 3 + chipGap * 2;
  const firstCx = (CARD_W - groupW) / 2 + chipW / 2;
  drawStatChip(ctx, firstCx, chipY, chipW, chipH, '⚡', 'SPEED', score.speed, COLORS.speed);
  drawStatChip(ctx, firstCx + chipW + chipGap, chipY, chipW, chipH, '\u{1F3AF}', 'QUALITY', score.sobriety, COLORS.quality);
  drawStatChip(ctx, firstCx + (chipW + chipGap) * 2, chipY, chipW, chipH, '\u{1F9E9}', 'FIT', score.fit, COLORS.fit);

  // Rig line.
  const rig = rigParts(system, showHostname).slice(0, 3).join('   ·   ');
  if (rig) {
    ctx.font = '500 21px system-ui, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`on ${rig}`, CARD_W / 2, 556);
  }

  // Footer.
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillStyle = COLORS.quiet;
  ctx.fillText('RigMatch · the AI dating game show for your PC · 100% local', CARD_W / 2, CARD_H - 34);
  ctx.textAlign = 'left';
}

export function ShareScorecard({ model, score, system, onClose }: {
  model: string;
  score: TestedModelScore;
  system: SystemProfile;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<CardStyle>('datingshow');
  const [showHostname, setShowHostname] = useState(false);
  const [copied, setCopied] = useState(false);
  const modelName = useMemo(() => getShortModelName(model), [model]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const opts = { modelName, score, system, showHostname };
    if (style === 'datingshow') drawDatingCard(ctx, opts);
    else drawScorecard(ctx, opts);
  }, [style, modelName, score, system, showHostname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shareText = style === 'datingshow'
    ? `It's a match! ${modelName} won my PC's heart on RigMatch 💛 — grade ${score.grade}, ${score.total}/100. Which local AI is your top match?`
    : `My PC's top local AI match is ${modelName} — grade ${score.grade}, ${score.total}/100 Match Score. Found with RigMatch, a 100% local model tester 🤖`;

  const saveImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rigmatch-${style}-${modelName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Defer the revoke so the browser finishes reading the blob before it's freed.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }, 'image/png');
  }, [modelName, style]);

  const shareTargets: Array<{ id: string; label: string; href: string }> = [
    // LinkedIn's feed composer opens pre-filled with the text + link; the user
    // attaches the saved PNG (LinkedIn can't pre-load an image from a URL).
    { id: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`${shareText} ${SHARE_URL}`)}` },
    { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SHARE_URL)}` },
    { id: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${encodeURIComponent(SHARE_URL)}&title=${encodeURIComponent(shareText)}` },
    { id: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${shareText} ${SHARE_URL}`)}` },
  ];

  const copyLink = useCallback(() => {
    void navigator.clipboard?.writeText(SHARE_URL).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="run-warning-modal share-scorecard-modal" role="dialog" aria-modal="true" aria-label="Share your scorecard">
        <div className="modal-title">
          <div>
            <span>Share your Top Match</span>
            <strong>{modelName} · {score.grade}</strong>
          </div>
          <button type="button" className="mini-button outline" onClick={onClose}>
            <X aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="share-style-tabs run-question-options" role="group" aria-label="Card style">
          <button type="button" className={style === 'datingshow' ? 'active' : ''} onClick={() => setStyle('datingshow')} aria-pressed={style === 'datingshow'}>
            💛 It's a Match!
          </button>
          <button type="button" className={style === 'scorecard' ? 'active' : ''} onClick={() => setStyle('scorecard')} aria-pressed={style === 'scorecard'}>
            📊 Scorecard
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={CARD_W}
          height={CARD_H}
          className="share-scorecard-canvas"
          aria-label={`${style === 'datingshow' ? 'Dating-show' : 'Scorecard'} card: ${modelName} scored ${score.total} Match, grade ${score.grade}`}
        />

        <label className="share-scorecard-toggle">
          <input type="checkbox" checked={showHostname} onChange={(e) => setShowHostname(e.target.checked)} />
          <span>Include my computer's name{system.hostname ? ` (${system.hostname})` : ''} on the card</span>
        </label>

        <div className="share-scorecard-actions">
          <button type="button" className="pick-this-one-btn" onClick={saveImage}>
            <Download aria-hidden="true" />
            Save image
          </button>
          {shareTargets.map((target) => (
            <a key={target.id} className="mini-button share-target" href={target.href} target="_blank" rel="noopener noreferrer">
              {target.label}
            </a>
          ))}
          <button type="button" className="mini-button outline" onClick={copyLink}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="share-scorecard-hint">
          This card shows <strong>your</strong> real result. Save it, then attach it to your post — social sites can't pre-load the picture for you, so the buttons open a post with the text and link ready to go.
        </p>
      </section>
    </div>
  );
}
