import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import type { SystemProfile, TestedModelScore } from '../types';
import { getShortModelName } from '../lib/modelCatalog';

// Where a shared scorecard sends people — the marketing landing page, which then
// funnels to the live demo or a download.
const SHARE_URL = 'https://daveeuson.github.io/RigMatch.AI/';
const CARD_W = 1200;
const CARD_H = 675;

// Card palette (canvas can't read CSS vars). Mirrors the app's dark + gold look.
const COLORS = {
  bgTop: '#0d1117',
  bgBottom: '#161b22',
  panel: '#1d2533',
  line: '#2c3b4d',
  gold: '#ffc957',
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

// Draws the whole scorecard onto a 1200×675 canvas. Pure given its inputs, so the
// preview and the exported PNG are byte-identical.
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

  // Gold top rule + wordmark.
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(0, 0, CARD_W, 6);
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('RigMatch.AI', 60, 82);
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('The AI dating game show for your PC', 62, 108);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 130);
  ctx.lineTo(CARD_W - 60, 130);
  ctx.stroke();

  // Grade badge.
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

  // Title block.
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

  // Score bars.
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

  // Rig strip.
  const rigY = 580, rigH = 60;
  ctx.fillStyle = COLORS.panel;
  ctx.beginPath();
  ctx.roundRect(60, rigY, CARD_W - 120, rigH, 12);
  ctx.fill();
  const rigParts = [
    system.gpu.model && system.gpu.model !== 'Unknown GPU' ? system.gpu.model : null,
    system.gpu.vramGb > 0 ? `${Math.round(system.gpu.vramGb)} GB VRAM` : null,
    system.memory.totalGb > 0 ? `${Math.round(system.memory.totalGb)} GB RAM` : null,
    system.cpu.brand || null,
    showHostname && system.hostname ? system.hostname : null,
  ].filter(Boolean);
  ctx.font = '500 21px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(rigParts.join('   ·   '), 82, rigY + 38);

  // Footer.
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillStyle = COLORS.quiet;
  ctx.fillText('100% local · no cloud · no account', 60, CARD_H - 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('daveeuson.github.io/RigMatch.AI', CARD_W - 60, CARD_H - 22);
  ctx.textAlign = 'left';
}

export function ShareScorecard({ model, score, system, onClose }: {
  model: string;
  score: TestedModelScore;
  system: SystemProfile;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showHostname, setShowHostname] = useState(false);
  const [copied, setCopied] = useState(false);
  const modelName = useMemo(() => getShortModelName(model), [model]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) drawScorecard(ctx, { modelName, score, system, showHostname });
  }, [modelName, score, system, showHostname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shareText = `My PC's top local AI match is ${modelName} — grade ${score.grade}, ${score.total}/100 Match Score. Found with RigMatch.AI, a 100% local model tester 🤖`;

  const saveImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rigmatch-${modelName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [modelName]);

  const shareTargets: Array<{ id: string; label: string; href: string }> = [
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

        <canvas
          ref={canvasRef}
          width={CARD_W}
          height={CARD_H}
          className="share-scorecard-canvas"
          aria-label={`Scorecard: ${modelName} scored ${score.total} Match, grade ${score.grade}`}
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
          Save the image, then attach it to your post — social sites can't pre-load the picture for you, so the buttons open a post with the text and link ready to go.
        </p>
      </section>
    </div>
  );
}
