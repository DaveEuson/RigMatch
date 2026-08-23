// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The shareable match card: a score that can leave the rig.
 *
 * Every result lives and dies in localStorage on one PC — nothing to show a
 * friend, nothing to compare across machines. This renders the winner as a
 * PNG the user chooses to save and share: a dating-profile card with the
 * score, the grade, and the rig that measured it. No servers, no telemetry —
 * an image file, made locally, shared only by the user's own hand.
 *
 * Drawing is split from wording so tests can pin the words without a canvas:
 * matchCardLines() decides what the card says, drawMatchCard() only paints.
 */

import type { ScoreRigStamp, TestedModelScore } from '../types.ts';
import { formatMatchScore } from './scoring.ts';

export type MatchCardInput = {
  score: TestedModelScore;
  /** "Best for coding" when a goal crowned this; absent for the overall pick. */
  matchLabel?: string;
  appVersion: string;
};

export type MatchCardLines = {
  kicker: string;
  model: string;
  scoreLine: string;
  grade: string;
  subScores: Array<{ label: string; value: number }>;
  rigLine: string;
  footer: string;
};

/** Everything the card says, in draw order. */
export function matchCardLines({ score, matchLabel, appVersion }: MatchCardInput): MatchCardLines {
  const rig: ScoreRigStamp | undefined = score.rig;
  return {
    kicker: matchLabel ? matchLabel.toUpperCase() : "IT'S A MATCH",
    model: score.model,
    scoreLine: formatMatchScore(score),
    grade: score.grade,
    subScores: [
      { label: 'Accuracy', value: score.sobriety },
      { label: 'Speed', value: score.speed },
      { label: 'Stability', value: score.stability ?? score.total },
      { label: 'Fit', value: score.fit },
    ],
    // The rig is part of the number. A card without it would invite exactly
    // the comparison the app spends so much effort refusing to fake.
    // Three cases, because a shared card must never name a machine it did not
    // run on. A remote score knows the host but not its hardware; a local score
    // knows the card; an unstamped one predates stamping entirely.
    rigLine: rig?.host
      ? `Measured on ${rig.host} · hardware unknown · ${new Date(score.completedAt).toLocaleDateString()}`
      : rig?.gpu
        ? `Measured on ${rig.gpu}${rig.vramGb ? ` · ${rig.vramGb} GB VRAM` : ''} · ${new Date(score.completedAt).toLocaleDateString()}`
        : `Measured locally · ${new Date(score.completedAt).toLocaleDateString()} · scores are relative to the rig`,
    footer: `RigMatch ${appVersion} — AI matchmaking for your PC. Nothing leaves the computer.`,
  };
}

export const MATCH_CARD_WIDTH = 1200;
export const MATCH_CARD_HEIGHT = 630;

/** Paint the card onto a canvas. Pure drawing; wording comes from matchCardLines. */
export function drawMatchCard(canvas: HTMLCanvasElement, input: MatchCardInput): void {
  const lines = matchCardLines(input);
  canvas.width = MATCH_CARD_WIDTH;
  canvas.height = MATCH_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ui = '"Segoe UI", system-ui, sans-serif';

  // Stage: the app's own dark ground with a soft gold glow behind the score.
  ctx.fillStyle = '#171523';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(880, 300, 40, 880, 300, 430);
  glow.addColorStop(0, 'rgba(239, 188, 90, 0.20)');
  glow.addColorStop(1, 'rgba(239, 188, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Card frame.
  ctx.strokeStyle = 'rgba(239, 188, 90, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  // Kicker.
  ctx.fillStyle = '#efbc5a';
  ctx.font = `800 30px ${ui}`;
  ctx.letterSpacing = '6px';
  ctx.fillText(lines.kicker, 80, 130);
  ctx.letterSpacing = '0px';

  // Model name, wrapped naively if enormous.
  ctx.fillStyle = '#fff9ef';
  ctx.font = `800 64px ${ui}`;
  const model = lines.model.length > 30 ? `${lines.model.slice(0, 29)}…` : lines.model;
  ctx.fillText(model, 80, 220);

  // Sub-score bars.
  ctx.font = `600 26px ${ui}`;
  lines.subScores.forEach((sub, index) => {
    const y = 300 + index * 62;
    ctx.fillStyle = '#b9aaa2';
    ctx.fillText(sub.label, 80, y);
    ctx.fillStyle = 'rgba(255, 249, 239, 0.12)';
    ctx.fillRect(240, y - 20, 380, 24);
    ctx.fillStyle = '#efbc5a';
    ctx.fillRect(240, y - 20, 380 * Math.min(100, Math.max(0, sub.value)) / 100, 24);
    ctx.fillStyle = '#efe5dc';
    ctx.fillText(String(sub.value), 640, y);
  });

  // The score, huge, with the grade beneath.
  ctx.fillStyle = '#efbc5a';
  ctx.font = `900 190px ${ui}`;
  ctx.textAlign = 'center';
  ctx.fillText(lines.scoreLine, 950, 330);
  ctx.font = `800 54px ${ui}`;
  ctx.fillStyle = '#fff9ef';
  ctx.fillText(`${lines.grade} chemistry`, 950, 410);
  ctx.textAlign = 'left';

  // Provenance and footer.
  ctx.fillStyle = '#b9aaa2';
  ctx.font = `500 24px ${ui}`;
  ctx.fillText(lines.rigLine, 80, 540);
  ctx.fillStyle = '#efbc5a';
  ctx.font = `700 22px ${ui}`;
  ctx.fillText(lines.footer, 80, 580);
}

/** Render offscreen and hand the PNG to the browser as a download. */
export function downloadMatchCard(input: MatchCardInput): Promise<boolean> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    drawMatchCard(canvas, input);
    canvas.toBlob((blob) => {
      // No blob means the canvas produced nothing — say so rather than
      // reporting a save that did not happen.
      if (!blob) { resolve(false); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rigmatch-${input.score.model.replace(/[^a-z0-9.-]+/gi, '-')}.png`;
      // In the document, and revoked on a later tick. The download is
      // asynchronous: revoking the blob URL in the same synchronous block
      // races the fetch of that blob and can cancel the save outright, and a
      // detached anchor is not clickable in every engine.
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
        resolve(true);
      }, 1000);
    }, 'image/png');
  });
}
