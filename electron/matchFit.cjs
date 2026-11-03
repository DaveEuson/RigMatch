// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

/**
 * The two parts of the Match Score that come from this PC: Speed and Fit.
 *
 * Through score version 6, Speed scaled 5 to 100 tokens a second and Fit read
 * only the size in the model's name. On an RTX 4070 every model under about 4B
 * writes faster than 100 tok/s, so each got full Speed, while qwen3.5:9b at 64
 * tok/s, which is quick to read, lost 12 points of the total for it; and Fit
 * gave a 14B 74 on a 24 GB card it fits in with room to spare. Small models
 * won balanced shows on speed nobody could see.
 */

/** Writing speed that gets full marks: rigmatch-fit's "Excellent" from the same number. */
const FULL_SPEED_TPS = 50;
const NO_SPEED_TPS = 5;

/** Graphics memory left over that counts as comfortable. */
const ROOMY_SHARE = 0.15;
/** Ollama reports a few bytes off the full size for a model that is all on the card. */
const ALL_ON_CARD = 0.99;
/** A model's file is smaller than what it holds in memory once loaded (cache and buffers at 2K). */
const LOAD_OVERHEAD = 1.1;

const clamp = (value) => Math.max(0, Math.min(100, value));

/** Speed: 5 tokens a second scores 0, 50 or more scores 100, a straight line between. */
function speedScoreFor(tokensPerSecond) {
  const tps = Number(tokensPerSecond);
  if (!Number.isFinite(tps)) return 0;
  return clamp(Math.round(((tps - NO_SPEED_TPS) / (FULL_SPEED_TPS - NO_SPEED_TPS)) * 100));
}

/**
 * Fit from the size in the model's name, for when nothing about the PC is known.
 * This was the whole of Fit through score version 6.
 */
function fitFromName(model) {
  const lower = String(model || '').toLowerCase();
  // Read the parameter count from an anchored "NNb" token. A bare substring
  // match let a small token match inside a larger one ("2b" inside "22b").
  //
  // Three more things the last token got wrong:
  // - An expert count, "8x7b", is 56B in total, not 7B.
  // - An active slice, "a3b" in qwen3:30b-a3b, is how much runs per token. The
  //   30B has to be held in memory all the same, so the largest token counts.
  // - A context marker, "-1m" in qwen2.5-14b-instruct-1m, is not a size.
  const experts = lower.match(/(?<![\d.])(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*b\b/);
  const tokens = [...lower.matchAll(/(?<![\d.ax])(\d+(?:\.\d+)?)\s*b\b/g)].map((token) => parseFloat(token[1]));
  const sizes = tokens.filter(Number.isFinite);
  if (experts) sizes.push(parseFloat(experts[1]) * parseFloat(experts[2]));

  // Tiny markers that carry no "NNb" token (sub-1B and keyword sizes).
  if (sizes.length === 0) {
    if (/\b(mini|nano)\b/.test(lower) || /(?<![\d.])\d+(?:\.\d+)?\s*m\b/.test(lower)) return 96;
    return 82; // size unknown
  }
  const params = Math.max(...sizes);
  if (params <= 3) return 96;
  if (params <= 9) return 88;
  if (params <= 15) return 74;
  if (params <= 34) return 58;
  return 38;
}

/** It fits: 100 with at least 15% of the memory left over, down to 70 with none. */
function roomFit(usedBytes, poolBytes) {
  const free = 1 - usedBytes / poolBytes;
  if (free >= ROOMY_SHARE) return 100;
  if (free <= 0) return 70;
  return Math.round(70 + (free / ROOMY_SHARE) * 30);
}

/** Part of it runs from system memory. Speed already counts the slowdown; this is the lack of room. */
function spillFit(share) {
  return Math.round(60 * Math.max(0, Math.min(1, share)));
}

/** Whether a name Ollama lists is the model asked for. A bare name means its :latest. */
function sameModel(name, model) {
  const want = model.includes(':') ? model : `${model}:latest`;
  return name === want || name === model;
}

/**
 * Where a loaded model sits, from an /api/ps listing: its size in memory, how
 * much of it is on the graphics card, and that as a share. Null when the model
 * is not listed or the listing gives no size.
 */
function loadedFootprint(listing, model) {
  const entry = (Array.isArray(listing?.models) ? listing.models : [])
    .find((item) => sameModel(item?.name || item?.model || '', model));
  const sizeBytes = Number(entry?.size);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  const vramBytes = Math.max(0, Number(entry.size_vram) || 0);
  return { sizeBytes, vramBytes, share: Math.min(1, vramBytes / sizeBytes) };
}

/**
 * Fit (0 to 100): how comfortably the model sits in this PC's memory.
 *
 * - footprint: what Ollama reported once the model was loaded (loadedFootprint).
 *   The most direct reading, so it wins when present.
 * - fileBytes: the model's download size, for an estimate when Ollama could not
 *   say (LM Studio, or /api/ps unreachable).
 * - graphicsBytes: the card's memory, or the shared pool on a Mac. 0 when unknown.
 * - systemBytes: the PC's memory, for a model that runs without the card.
 *
 * Returns the score and what it was read from: 'measured', 'estimated' or 'name'.
 */
function fitFromPc({ model, footprint = null, fileBytes = 0, graphicsBytes = 0, systemBytes = 0 }) {
  if (footprint) {
    const { share, sizeBytes, vramBytes } = footprint;
    if (share >= ALL_ON_CARD) {
      return { fit: graphicsBytes > 0 ? roomFit(vramBytes, graphicsBytes) : 100, basis: 'measured', gpuShare: 1 };
    }
    if (share > 0) return { fit: spillFit(share), basis: 'measured', gpuShare: share };
    // Nothing on the card: Ollama runs it from system memory, on a PC whose
    // card it cannot use or that has none. Judged against that memory, so every
    // model is not simply scored 0 on a machine without a usable card.
    if (systemBytes > 0) return { fit: roomFit(sizeBytes, systemBytes), basis: 'measured', gpuShare: 0 };
  }
  if (fileBytes > 0) {
    const loaded = fileBytes * LOAD_OVERHEAD;
    if (graphicsBytes > 0) {
      return {
        fit: loaded <= graphicsBytes ? roomFit(loaded, graphicsBytes) : spillFit(graphicsBytes / loaded),
        basis: 'estimated',
      };
    }
    if (systemBytes > 0) return { fit: roomFit(loaded, systemBytes), basis: 'estimated' };
  }
  return { fit: fitFromName(model), basis: 'name' };
}

module.exports = {
  FULL_SPEED_TPS,
  speedScoreFor,
  fitFromName,
  fitFromPc,
  loadedFootprint,
};
