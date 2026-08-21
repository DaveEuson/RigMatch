#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Render the share cards straight to PNG, without walking the whole wizard.
 *
 * Card design is iterative and the canvas code is the only thing being
 * changed, so driving five wizard steps to see one drawing wasted a minute per
 * look. This mounts a bare canvas, runs the same draw functions against a
 * realistic score, and writes both styles.
 *
 * Usage:  node scripts/render-card.mjs
 */

import { leaseDevServer, COLD_START_MS } from './dev-server-lease.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.RIGMATCH_TOUR_URL || 'http://127.0.0.1:5173/';
const out = join(tmpdir(), 'rigmatch-cards');
mkdirSync(out, { recursive: true });

const lease = await leaseDevServer(url, { timeoutMs: 180_000 });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: COLD_START_MS });

// A score with a real skill spread, so the card shows its purpose line.
const SCORE = {
  model: 'granite4:3b',
  total: 95, preciseTotal: 95, grade: 'S',
  speed: 90, sobriety: 91, stability: 95, fit: 96,
  tokensPerSecond: 142,
  completedAt: '2026-08-16T00:00:00Z',
  scoreSchemaVersion: 5,
  taskScores: {
    coding: { score: 97, questions: 6, graded: 6 },
    chat: { score: 88, questions: 6, graded: 6 },
    facts: { score: 90, questions: 4, graded: 4 },
  },
};
const SYSTEM = {
  hostname: 'DavePC',
  platform: 'win32', arch: 'x64',
  cpu: { brand: 'AMD Ryzen 9 5900X', physicalCores: 12, loadPercent: 20 },
  memory: { totalGb: 62, usedGb: 13 },
  gpu: { model: 'NVIDIA GeForce RTX 4070', vramGb: 12, vramUsedGb: 4, isUnifiedMemory: false, gpuLoadPercent: 30 },
  os: { distro: 'Windows', release: '11' },
  networks: [{ address: '127.0.0.1' }],
};

for (const style of ['datingshow', 'scorecard']) {
  const dataUrl = await page.evaluate(async ({ style, score, system }) => {
    const mod = await import('/src/components/ShareScorecard.tsx');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');
    // The draw functions are module-private; the component exposes them for
    // exactly this purpose via __drawForTest when present, else fall back to
    // mounting nothing and reporting the gap loudly.
    const draw = mod.__drawForTest;
    if (!draw) return null;
    draw(ctx, style, { modelName: 'granite4:3b', score, system, showHostname: true });
    return canvas.toDataURL('image/png');
  }, { style, score: SCORE, system: SYSTEM });

  if (!dataUrl) {
    console.error('ShareScorecard does not export __drawForTest — cannot render without walking the wizard.');
    process.exitCode = 1;
    break;
  }
  const file = join(out, `${style}.png`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`wrote ${file}`);
}

await browser.close();
lease.stop();
