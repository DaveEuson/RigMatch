// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyText, type CopyState } from '../lib/clipboard';
import { Check, Copy, Download, X } from 'lucide-react';
import type { SystemProfile, TestedModelScore } from '../types';
import { getShortModelName } from '../lib/modelCatalog';
import { getModelAvatarSrc } from '../lib/modelAvatars';
import { formatThroughputValue } from '../lib/format';
import { buildShareTexts, strongestSkill, SHARE_URL } from '../lib/shareCopy';
import { useDialog } from '../lib/useDialog';

const CARD_W = 1200;
const CARD_H = 675;

type CardStyle = 'datingshow' | 'scorecard';

// Card palette (canvas can't read CSS vars). Mirrors the app's dark + gold look.
//
// The surfaces are warm on purpose. The Scorecard style used to be built on
// #0d1117 / #1d2533 / #2c3b4d — a cold blue-black the palette allows in no
// theme — so the card that went out to strangers was the one thing about
// RigMatch that did not look like RigMatch. These are the plum end of
// index.css: --bg #171523, --panel #211b2b, --line #5b4e62.
const COLORS = {
  bgTop: '#17121f',
  bgBottom: '#221b2b',
  datingBg: '#0e0b12',
  panel: '#2a2233',
  panel2: '#1e1826',
  line: '#53465c',
  gold: '#ffc957',
  coral: '#ff6f86',
  text: '#f7f0df',
  muted: '#b9b1a3',
  quiet: '#8d8393',
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

/**
 * A stat chip: the value large in its accent colour, the label small beneath.
 *
 * No emoji. The old chips led each value with ⚡🎯🧩, which rendered in the
 * platform's emoji font next to the numerals' text font — two typefaces
 * fighting inside a 66px box was a good part of why the card read as rough.
 * The accent colour already distinguishes the three; the label names them.
 */
function drawStatChip(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, w: number, h: number,
  label: string, value: string, color: string,
) {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '800 32px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(value, cx, cy + 4);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, cx, cy + 25);
}

/** A four-point sparkle — drawn, so it matches the type instead of the emoji font. */
function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 0.12, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.12, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.12, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.12, cy - r * 0.12, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * A row of marquee bulbs under the gold strip — the one decorative idea the
 * card commits to, instead of scattered rectangles and smudged hearts. Evenly
 * spaced, alternating bright and dim like a theatre sign.
 */
function drawMarqueeBulbs(ctx: CanvasRenderingContext2D) {
  const count = 33;
  const inset = 48;
  const step = (CARD_W - inset * 2) / (count - 1);
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = i % 2 === 0 ? 0.85 : 0.3;
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.arc(inset + i * step, 34, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  opts: {
    modelName: string;
    score: TestedModelScore;
    system: SystemProfile;
    showHostname: boolean;
    avatar?: HTMLImageElement | null;
  },
) {
  const { modelName, score, system, showHostname, avatar } = opts;
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

  // The contestant, then the grade sitting on their shoulder. A 175px slate
  // square holding one enormous letter told a reader nothing about which model
  // this is — the portrait says that in the moment before any of the numbers
  // are read, and the badge keeps the grade as the loudest thing on it.
  const bx = 60, by = 165, bs = 175;
  const pcx = bx + bs / 2, pcy = by + bs / 2;
  drawPortrait(ctx, avatar, pcx, pcy, 78);

  const grade = score.grade;
  const gcx = pcx + 60, gcy = pcy + 60, gr = 34;
  ctx.fillStyle = COLORS.panel2;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = gradeColor(grade);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = gradeColor(grade);
  // "B+" is two glyphs where "A" is one; size it to the badge rather than
  // letting the plus hang over the ring.
  ctx.font = `800 ${grade.length > 1 ? 32 : 40}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(grade, gcx, gcy + (grade.length > 1 ? 11 : 14));
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

  // The bar length has to stay on the 0-100 sub-score -- a rate has no upper
  // bound to fill against. The figure beside it can be the real measurement,
  // which is the part worth reading once every fast model's bar is full.
  const speedRate = formatThroughputValue(score.tokensPerSecond);
  const bars: Array<{ label: string; value: number; shown: string; color: string }> = [
    { label: 'Speed', value: score.speed, shown: speedRate === null ? String(Math.round(score.speed)) : `${speedRate} tok/s`, color: COLORS.speed },
    { label: 'Quality', value: score.sobriety, shown: String(Math.round(score.sobriety)), color: COLORS.quality },
    { label: 'Fit', value: score.fit, shown: String(Math.round(score.fit)), color: COLORS.fit },
  ];
  const barX = 200, barW = 820, barTop = 382, barGap = 54, barH = 20;
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
    ctx.fillText(bar.shown, CARD_W - 60, y + barH - 2);
    ctx.textAlign = 'left';
  });

  // The bottom third was two crowded edges and one hole: the rig strip sat at
  // 580..640 with the footer's baseline at 653 — 13px apart, the footer's
  // descenders ran into the frame at 657, and 52px of nothing sat above the
  // strip. Bars end 510, strip 542..602, footer 624..642, frame 657.
  const rigY = 542, rigH = 60;
  ctx.fillStyle = COLORS.panel;
  ctx.beginPath();
  ctx.roundRect(60, rigY, CARD_W - 120, rigH, 12);
  ctx.fill();
  ctx.font = '500 21px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(rigParts(system, showHostname).join('   ·   '), 82, rigY + 38);

  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillStyle = COLORS.quiet;
  ctx.fillText('100% local · no cloud · no account', 60, CARD_H - 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('daveeuson.github.io/RigMatch', CARD_W - 60, CARD_H - 38);
  ctx.textAlign = 'left';
}

// On-brand "It's a Match!" card: the dating-show reveal. Same real data, playful
// framing — the model that won this PC's heart.
/**
 * A contestant's portrait, round, in the gold hairline.
 *
 * Falls back to a drawn heart rather than an emoji one: the card is a single
 * image shared onto other people's screens, and an emoji glyph renders in
 * whatever font the sharing platform has, which was never the card's.
 */
function drawPortrait(
  ctx: CanvasRenderingContext2D,
  avatar: HTMLImageElement | null | undefined,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.save();
  if (avatar && avatar.naturalWidth > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    // Square source, drawn to cover: the avatars are square, and letting one
    // stretch would distort a face that people recognise.
    const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);
    ctx.drawImage(
      avatar,
      (avatar.naturalWidth - side) / 2,
      (avatar.naturalHeight - side) / 2,
      side,
      side,
      cx - radius,
      cy - radius,
      radius * 2,
      radius * 2,
    );
  } else {
    ctx.fillStyle = 'rgba(255, 111, 134, 0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    drawHeart(ctx, cx, cy + 4, radius * 0.62, COLORS.coral);
  }
  ctx.restore();

  // The hairline, and a second ring further out for the stage-light feel.
  ctx.save();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A heart, drawn rather than typed. */
function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const top = cy - size * 0.5;
  ctx.moveTo(cx, cy + size * 0.62);
  ctx.bezierCurveTo(cx - size * 1.1, cy - size * 0.2, cx - size * 0.55, top - size * 0.62, cx, top + size * 0.1);
  ctx.bezierCurveTo(cx + size * 0.55, top - size * 0.62, cx + size * 1.1, cy - size * 0.2, cx, cy + size * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDatingCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    modelName: string;
    score: TestedModelScore;
    system: SystemProfile;
    showHostname: boolean;
    /** The winner's own portrait, when it loaded. */
    avatar?: HTMLImageElement | null;
  },
) {
  const { modelName, score, system, showHostname, avatar } = opts;
  ctx.fillStyle = COLORS.datingBg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, -40, 60, CARD_W / 2, 300, 760);
  glow.addColorStop(0, 'rgba(255, 111, 134, 0.20)');
  glow.addColorStop(0.5, 'rgba(255, 201, 87, 0.08)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Decorative layer, behind the content. One committed idea — a theatre
  // marquee — instead of the previous scatter: random rectangles that read as
  // accidents and bezier hearts that rendered as dark smudges. The corners
  // keep two drawn sparkles each, small and dim, so the frame isn't sterile.
  drawMarqueeBulbs(ctx);
  drawSparkle(ctx, 92, 132, 9, COLORS.gold, 0.5);
  drawSparkle(ctx, 124, 168, 5, COLORS.coral, 0.4);
  drawSparkle(ctx, 1108, 132, 9, COLORS.gold, 0.5);
  drawSparkle(ctx, 1076, 168, 5, COLORS.coral, 0.4);
  drawSparkle(ctx, 108, 540, 7, COLORS.coral, 0.35);
  drawSparkle(ctx, 1092, 540, 7, COLORS.coral, 0.35);
  drawFrame(ctx, COLORS.gold);

  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(0, 0, CARD_W, 6);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Drawn sparkles flank the headline; the ✨ emoji set its own typeface next
  // to the display type and was part of the roughness.
  ctx.font = '800 38px system-ui, sans-serif';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('IT’S A MATCH!', CARD_W / 2, 96);
  const titleHalf = ctx.measureText('IT’S A MATCH!').width / 2;
  drawSparkle(ctx, CARD_W / 2 - titleHalf - 42, 84, 12, COLORS.gold);
  drawSparkle(ctx, CARD_W / 2 + titleHalf + 42, 84, 12, COLORS.gold);

  // A soft spotlight behind the heart, so the centrepiece sits in light
  // rather than floating on flat brown.
  const spot = ctx.createRadialGradient(CARD_W / 2, 185, 10, CARD_W / 2, 185, 170);
  spot.addColorStop(0, 'rgba(255, 201, 87, 0.18)');
  spot.addColorStop(1, 'rgba(255, 201, 87, 0)');
  ctx.fillStyle = spot;
  ctx.fillRect(CARD_W / 2 - 180, 15, 360, 360);

  // The contestant's own portrait, in the gold hairline that makes a model
  // read as a publicity still from the show. The centrepiece was a yellow
  // heart drawn from the platform's emoji font: another typeface, another era,
  // and nothing whatever about which model won.
  drawPortrait(ctx, avatar, CARD_W / 2, 196, 78);

  ctx.font = '800 58px system-ui, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(modelName, CARD_W / 2, 340);

  // Say what the match is FOR. "won your PC's heart" was charming and empty —
  // a stranger seeing this card learned nothing about what the model is good
  // at. The strongest graded skill comes from the score itself, so the card
  // never claims more than the run measured.
  const whose = showHostname && system.hostname ? `${system.hostname}’s` : 'your PC’s';
  const strongest = strongestSkill(score);
  ctx.font = '400 27px system-ui, sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(
    strongest ? `won ${whose} heart · best at ${strongest.purpose}` : `won ${whose} heart on RigMatch`,
    CARD_W / 2,
    376,
  );

  // Grade + score pill.
  const pillText = `GRADE ${score.grade}  ·  ${score.total}/100 MATCH`;
  ctx.font = '800 26px system-ui, sans-serif';
  const pw = ctx.measureText(pillText).width + 56;
  const px = (CARD_W - pw) / 2, py = 402, ph = 56;
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
  //
  // The vertical rhythm here is deliberate; it was previously accidental.
  // Chips once ended at y=552 with the rig line's baseline at 556 — a 4px gap
  // — while 85px of dead space sat between the rig line and the footer. The
  // column, measured from the portrait down: ring ends 285, name cap 299,
  // sub-line 376, pill 402..458, chips 484..550, rig baseline 592, footer 641.
  // Every gap is 24px or more, and they grow gently toward the frame.
  const chipW = 220, chipH = 66, chipGap = 26, chipY = 517;
  const groupW = chipW * 3 + chipGap * 2;
  const firstCx = (CARD_W - groupW) / 2 + chipW / 2;
  // The speed sub-score tops out at 100 tok/s, so on a capable machine almost
  // every model shows "100" and the chip says nothing. Show the rate actually
  // measured instead -- "109 TOK/S" is a real number a reader can compare.
  // Scores saved before the rate was persisted fall back to the sub-score.
  const rate = formatThroughputValue(score.tokensPerSecond);
  drawStatChip(ctx, firstCx, chipY, chipW, chipH,
    rate === null ? 'SPEED' : 'TOKENS / SEC',
    rate ?? String(Math.round(score.speed)), COLORS.speed);
  drawStatChip(ctx, firstCx + chipW + chipGap, chipY, chipW, chipH, 'QUALITY', String(Math.round(score.sobriety)), COLORS.quality);
  drawStatChip(ctx, firstCx + (chipW + chipGap) * 2, chipY, chipW, chipH, 'FIT', String(Math.round(score.fit)), COLORS.fit);

  // Rig line.
  const rig = rigParts(system, showHostname).slice(0, 3).join('   ·   ');
  if (rig) {
    ctx.font = '500 21px system-ui, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`on ${rig}`, CARD_W / 2, 592);
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
  const [copied, setCopied] = useState<CopyState>('idle');
  const modelName = useMemo(() => getShortModelName(model), [model]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    let stale = false;
    // Drawn twice: once immediately so the card is never blank, and again when
    // the portrait has decoded. Waiting for the image before the first draw
    // would leave an empty canvas on a cold cache, and the file is local.
    const paint = (avatar?: HTMLImageElement | null) => {
      if (stale) return;
      const opts = { modelName, score, system, showHostname, avatar };
      if (style === 'datingshow') drawDatingCard(ctx, opts);
      else drawScorecard(ctx, opts);
    };
    paint(null);
    const portrait = new Image();
    portrait.src = getModelAvatarSrc(model);
    portrait.decode().then(() => paint(portrait)).catch(() => {
      // No portrait: the card keeps the drawn heart rather than a hole.
    });
    return () => { stale = true; };
  }, [style, model, modelName, score, system, showHostname]);

  const dialogRef = useDialog<HTMLElement>(onClose);

  // Built in shareCopy.ts under tested rules: no question marks (LinkedIn's
  // composer truncated Dave's real post at one, eating the link), the link
  // phrased as "Get it:", a sentence saying what RigMatch is, and the purpose
  // the match is best for. See tests/shareCopy.test.mjs.
  const shareTexts = useMemo(() => buildShareTexts(style, modelName, score), [style, modelName, score]);

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
    // The full text already ends in the link, so the pointer to the app
    // travels with the words wherever they land.
    { id: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareTexts.full)}` },
    { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTexts.short)}&url=${encodeURIComponent(SHARE_URL)}` },
    { id: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${encodeURIComponent(SHARE_URL)}&title=${encodeURIComponent(shareTexts.short)}` },
    { id: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(shareTexts.full)}` },
  ];

  /**
   * Put the card itself on the clipboard the moment a share button is used.
   *
   * No social site can pre-load an image from a share URL, so Dave's post went
   * out with the text and nothing to look at. Copying the PNG turns the manual
   * step from save-locate-attach into paste. Fire-and-forget: if the clipboard
   * refuses, the hint keeps describing the save-and-attach path instead.
   */
  const [cardCopied, setCardCopied] = useState(false);
  const copyCardToClipboard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ClipboardItem === 'undefined') return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => setCardCopied(true))
        .catch(() => setCardCopied(false));
    }, 'image/png');
  }, []);

  const copyLink = useCallback(() => {
    void copyText(SHARE_URL).then((ok) => {
      setCopied(ok ? 'copied' : 'failed');
      window.setTimeout(() => setCopied('idle'), 1500);
    });
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="run-warning-modal share-scorecard-modal" role="dialog" aria-modal="true" aria-label="Share your scorecard">
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
            <a
              key={target.id}
              className="mini-button share-target"
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={copyCardToClipboard}
            >
              {target.label}
            </a>
          ))}
          <button type="button" className="mini-button outline" onClick={copyLink}>
            {copied === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied === 'copied' ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="share-scorecard-hint" role="status">
          {cardCopied ? (
            <>The card is on your clipboard — press <strong>Ctrl+V</strong> in the post to attach it. The text and download link are already filled in.</>
          ) : (
            <>This card shows <strong>your</strong> real result. The buttons open a post with the text and download link filled in, and copy the card so you can paste it straight in with <strong>Ctrl+V</strong>.</>
          )}
        </p>
      </section>
    </div>
  );
}
