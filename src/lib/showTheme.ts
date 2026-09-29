// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The show's theme song, synthesized live with Web Audio.
 *
 * No audio file ships and nothing is downloaded: every note below is an
 * oscillator or a burst of noise, scheduled a beat or two ahead. It is an
 * original tune in the style of a 1970s dating show — organ, brass, a bouncy
 * bass and a slide whistle — and deliberately not any real show's theme.
 *
 * Three cues: a looping theme while the contestants answer, a drum roll and
 * ta-da when a winner is crowned, and a sad trombone when a show stops with
 * nobody crowned. Off unless the user turns music on (showExtras).
 */

export const THEME_BPM = 128;
const BEAT = 60 / THEME_BPM;
const LOOP_BEATS = 32;
const LEVEL = 0.35;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

type Bus = GainNode;
type Cue = { beat: number; play: (bus: Bus, t: number) => void };

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let organWave: PeriodicWave | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  out = ctx.createGain();
  out.gain.value = LEVEL;
  out.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  // A drawbar organ: fundamental, octave, twelfth, fifteenth, a little above.
  const imag = new Float32Array([0, 1, 0.75, 0.5, 0.4, 0, 0.25, 0, 0.18]);
  organWave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  return ctx;
}

function newBus(ac: AudioContext): Bus {
  const bus = ac.createGain();
  bus.connect(out!);
  return bus;
}

// ---- Instruments -------------------------------------------------------------

function shape(g: GainNode, t: number, attack: number, peak: number, sustain: number, end: number, release = 0.06) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), Math.max(t + attack + 0.01, end - 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, end + release);
}

function osc(type: OscillatorType, freq: number, t: number, stop: number): OscillatorNode {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t);
  o.stop(stop);
  return o;
}

function lead(bus: Bus, m: number, t: number, dur: number) {
  const ac = ctx!;
  const end = t + dur;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.8;
  const g = ac.createGain();
  const vib = osc('sine', 5.6, t, end + 0.1);
  const depth = ac.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(dur > 0.3 ? 14 : 4, t + Math.min(dur, 0.35));
  vib.connect(depth);
  for (const [shift, level] of [[0, 1], [12, 0.3]] as const) {
    const o = osc('square', mtof(m + shift), t, end + 0.1);
    const lv = ac.createGain(); lv.gain.value = level;
    depth.connect(o.detune);
    o.connect(lv).connect(f);
  }
  f.connect(g).connect(bus);
  shape(g, t, 0.012, 0.11, 0.075, end);
}

function organ(bus: Bus, chord: number[], t: number, dur: number) {
  const end = t + dur;
  for (const m of chord) {
    const o = ctx!.createOscillator();
    o.setPeriodicWave(organWave!);
    o.frequency.value = mtof(m);
    const g = ctx!.createGain();
    o.connect(g).connect(bus);
    shape(g, t, 0.004, 0.035, 0.03, end, 0.04);
    o.start(t); o.stop(end + 0.08);
  }
}

function bass(bus: Bus, m: number, t: number, dur: number) {
  const end = t + dur;
  const g = ctx!.createGain();
  const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  for (const type of ['triangle', 'square'] as const) osc(type, mtof(m), t, end + 0.1).connect(f);
  f.connect(g).connect(bus);
  shape(g, t, 0.006, 0.28, 0.12, end, 0.05);
}

function brass(bus: Bus, chord: number[], t: number, dur: number, peak = 0.05) {
  const end = t + dur;
  for (const m of chord) {
    const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
    const g = ctx!.createGain();
    for (const cents of [-8, 8]) {
      const o = osc('sawtooth', mtof(m), t, end + 0.15);
      o.detune.value = cents;
      o.connect(f);
    }
    f.connect(g).connect(bus);
    shape(g, t, 0.025, peak, peak * 0.7, end, 0.1);
  }
}

function noise(bus: Bus, t: number, freq: number, peak: number, decay: number) {
  const src = ctx!.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random()); src.stop(t + decay + 0.05);
}

function kick(bus: Bus, t: number, peak = 0.55) {
  const o = osc('sine', 140, t, t + 0.3);
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(bus);
}

function snare(bus: Bus, t: number, peak = 0.16) {
  noise(bus, t, 1400, peak, 0.13);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(peak * 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc('triangle', 190, t, t + 0.1).connect(g).connect(bus);
}

const hat = (bus: Bus, t: number, open = false) => noise(bus, t, 7500, open ? 0.06 : 0.045, open ? 0.16 : 0.035);
const crash = (bus: Bus, t: number, peak = 0.14) => noise(bus, t, 4200, peak, 1.8);

function slideWhistle(bus: Bus, t: number, from: number, to: number, dur: number) {
  const o = osc('sine', from, t, t + dur + 0.1);
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const vib = osc('sine', 7, t, t + dur + 0.1);
  const depth = ctx!.createGain(); depth.gain.value = 18;
  vib.connect(depth).connect(o.frequency);
  const g = ctx!.createGain();
  shape(g, t, 0.03, 0.07, 0.06, t + dur, 0.05);
  o.connect(g).connect(bus);
}

// ---- The romance: harp, strings, a violin -------------------------------------

/** A harp string: a bright pluck that rings and fades. */
function harp(bus: Bus, m: number, t: number, peak = 0.07) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3800;
  osc('triangle', mtof(m), t, t + 1.5).connect(f);
  const shimmer = ctx!.createGain(); shimmer.gain.value = 0.25;
  osc('sine', mtof(m + 12), t, t + 1.5).connect(shimmer).connect(f);
  f.connect(g).connect(bus);
}

/** A string section: detuned saws, slow bow, a little vibrato. */
function strings(bus: Bus, chord: number[], t: number, dur: number, peak = 0.022) {
  const end = t + dur;
  for (const m of chord) {
    const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1700; f.Q.value = 0.5;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.55);
    g.gain.setValueAtTime(peak, Math.max(t + 0.55, end - 0.1));
    g.gain.linearRampToValueAtTime(0.0001, end + 1.1);
    const vib = osc('sine', 5, t, end + 1.2);
    const depth = ctx!.createGain(); depth.gain.value = 7;
    vib.connect(depth);
    for (const cents of [-7, 7]) {
      const o = osc('sawtooth', mtof(m), t, end + 1.2);
      o.detune.value = cents;
      depth.connect(o.detune);
      o.connect(f);
    }
    f.connect(g).connect(bus);
  }
}

/** A solo violin: bowed in, singing vibrato that deepens as the note holds. */
function violin(bus: Bus, m: number, t: number, dur: number) {
  const end = t + dur;
  const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000; f.Q.value = 1.2;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.09);
  g.gain.setValueAtTime(0.06, Math.max(t + 0.1, end - 0.08));
  g.gain.linearRampToValueAtTime(0.0001, end + 0.25);
  const vib = osc('sine', 5.5, t, end + 0.3);
  const depth = ctx!.createGain();
  depth.gain.setValueAtTime(3, t);
  depth.gain.linearRampToValueAtTime(dur > 0.6 ? 16 : 9, t + Math.min(dur, 0.8));
  vib.connect(depth);
  const o = osc('sawtooth', mtof(m), t, end + 0.3);
  // A violinist slides up into the note.
  o.detune.setValueAtTime(-35, t);
  o.detune.linearRampToValueAtTime(0, t + 0.07);
  depth.connect(o.detune);
  o.connect(f).connect(g).connect(bus);
}

/** A music-box chime: two pure partials, a long ring. */
function chime(bus: Bus, m: number, t: number) {
  for (const [shift, level] of [[0, 0.05], [19, 0.015]] as const) {
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    osc('sine', mtof(m + shift), t, t + 2.3).connect(g).connect(bus);
  }
}

// ---- The theme: eight bars in F, 128 bpm --------------------------------------

const CHORDS: Record<string, number[]> = {
  F: [57, 60, 65], Dm7: [57, 60, 62, 65], Gm7: [58, 62, 65, 67], C7: [58, 60, 64, 67], D7: [57, 60, 62, 66],
};
const ROOTS: Record<string, [number, number]> = { F: [41, 48], Dm7: [38, 45], Gm7: [43, 50], C7: [36, 43], D7: [38, 45] };
/** Each bar's first-half and second-half chord. */
const BARS: Array<[string, string]> = [['F', 'F'], ['Dm7', 'Dm7'], ['Gm7', 'Gm7'], ['C7', 'C7'], ['F', 'F'], ['D7', 'D7'], ['Gm7', 'C7'], ['F', 'F']];
/** [beat, length in beats, midi note] */
const MELODY: Array<[number, number, number]> = [
  [0, 0.5, 72], [0.5, 0.5, 69], [1, 0.5, 72], [1.5, 1.5, 77], [3, 0.5, 76], [3.5, 0.5, 74],
  [4, 0.5, 72], [4.5, 0.5, 69], [5, 0.5, 72], [5.5, 1.5, 74], [7, 0.5, 72], [7.5, 0.5, 69],
  [8, 0.5, 70], [8.5, 0.5, 67], [9, 0.5, 70], [9.5, 1.5, 74], [11, 0.5, 72], [11.5, 0.5, 70],
  [12, 1, 69], [13, 0.5, 67], [13.5, 0.5, 69], [14, 1.5, 72], [15.5, 0.5, 70],
  [16, 0.5, 72], [16.5, 0.5, 69], [17, 0.5, 72], [17.5, 1.5, 77], [19, 0.5, 79], [19.5, 0.5, 77],
  [20, 1.5, 78], [21.5, 0.5, 76], [22, 1, 74], [23, 1, 72],
  [24, 0.5, 70], [24.5, 0.5, 74], [25, 1, 77], [26, 0.5, 76], [26.5, 0.5, 74], [27, 1, 76],
  [28, 1, 77], [29, 0.5, 72], [29.5, 0.5, 69], [30, 1.5, 65],
];
const BRASS_HITS: Array<[number, string, number]> = [[0, 'F', 0.45], [15.5, 'F', 0.45], [23.5, 'Gm7', 0.45], [28, 'F', 1]];

function buildTheme(): Cue[] {
  const cues: Cue[] = [];
  const at = (beat: number, play: Cue['play']) => cues.push({ beat, play });
  for (const [b, d, m] of MELODY) at(b, (bus, t) => lead(bus, m, t, d * BEAT * 0.92));
  for (const [b, name, d] of BRASS_HITS) at(b, (bus, t) => brass(bus, CHORDS[name].map((m) => m + 12), t, d * BEAT));
  BARS.forEach(([first, second], bar) => {
    const b0 = bar * 4;
    at(b0, (bus, t) => bass(bus, ROOTS[first][0], t, BEAT * 0.9));
    at(b0 + 2, (bus, t) => bass(bus, first === second ? ROOTS[first][1] : ROOTS[second][0], t, BEAT * 0.9));
    const walk = bar === 6 ? 40 : bar === 7 ? 48 : ROOTS[first][0] + 12;
    at(b0 + 3.5, (bus, t) => bass(bus, walk, t, BEAT * 0.4));
    at(b0 + 1, (bus, t) => organ(bus, CHORDS[first], t, BEAT * 0.3));
    at(b0 + 3, (bus, t) => organ(bus, CHORDS[second], t, BEAT * 0.3));
    at(b0, (bus, t) => kick(bus, t));
    at(b0 + 2, (bus, t) => kick(bus, t));
    if (bar === 3 || bar === 7) at(b0 + 2.5, (bus, t) => kick(bus, t, 0.4));
    at(b0 + 1, (bus, t) => snare(bus, t));
    at(b0 + 3, (bus, t) => snare(bus, t));
    for (let h = 0; h < 8; h += 1) {
      const open = (bar === 3 || bar === 7) && h === 7;
      at(b0 + h / 2, (bus, t) => hat(bus, t, open));
    }
  });
  at(0, (bus, t) => crash(bus, t, 0.08));
  at(31, (bus, t) => slideWhistle(bus, t, 700, 1600, BEAT * 0.9));
  return cues.sort((a, b) => a.beat - b.beat);
}

let theme: Cue[] | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let themeBus: Bus | null = null;
let loopStart = 0;
let loops = 0;
let index = 0;

function scheduleAhead() {
  const ac = ctx!;
  const cues = theme!;
  const horizon = ac.currentTime + 0.15;
  for (;;) {
    const cue = cues[index];
    const t = loopStart + loops * LOOP_BEATS * BEAT + cue.beat * BEAT;
    if (t > horizon) break;
    cue.play(themeBus!, t);
    index += 1;
    if (index >= cues.length) { index = 0; loops += 1; }
  }
}

function fadeOut(bus: Bus | null, seconds: number) {
  if (!bus || !ctx) return;
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, seconds / 3);
  setTimeout(() => bus.disconnect(), seconds * 1000 + 400);
}

function stopLoop(fade: number) {
  if (timer) clearInterval(timer);
  timer = null;
  fadeOut(themeBus, fade);
  themeBus = null;
}

let stingBus: Bus | null = null;
/** When the current sting finishes (performance.now()). */
let stingUntil = 0;

function freshSting(ac: AudioContext): Bus {
  stopLoop(0.15);
  fadeOut(stingBus, 0.1);
  stingBus = newBus(ac);
  return stingBus;
}

export const showTheme = {
  isPlaying: () => timer !== null,
  /** A ta-da or sad trombone is playing now. */
  stingPlaying: () => performance.now() < stingUntil,

  /** Starts the loop from the top; a no-op while it is already playing. */
  start() {
    if (timer) return;
    const ac = audio();
    if (!ac) return;
    void ac.resume();
    theme ??= buildTheme();
    fadeOut(stingBus, 0.1);
    stingBus = null;
    themeBus = newBus(ac);
    loopStart = ac.currentTime + 0.08;
    loops = 0;
    index = 0;
    timer = setInterval(scheduleAhead, 25);
    scheduleAhead();
  },

  /** Fades out whatever is playing: the loop and any sting. */
  stop(fade = 0.3) {
    stopLoop(fade);
    fadeOut(stingBus, fade);
    stingBus = null;
    stingUntil = 0;
  },

  /** Drum roll, "da-da", ta-da. About three seconds. */
  winner() {
    const ac = audio();
    if (!ac) return;
    void ac.resume();
    const bus = freshSting(ac);
    stingUntil = performance.now() + 3200;
    const t0 = ac.currentTime + 0.12;
    const hits = 22;
    for (let i = 0; i < hits; i += 1) snare(bus, t0 + i * 0.045, 0.03 + (i / hits) * 0.14);
    const hit = t0 + hits * 0.045;
    brass(bus, [72, 76], hit - 0.36, 0.1);
    brass(bus, [72, 76], hit - 0.2, 0.1);
    brass(bus, [53, 57, 60, 65, 69, 72], hit, 1.6, 0.045);
    lead(bus, 77, hit, 1.6);
    bass(bus, 29, hit, 1.4);
    kick(bus, hit, 0.7);
    crash(bus, hit, 0.2);
    slideWhistle(bus, hit + 1.0, 900, 1900, 0.35);
  },

  /**
   * "It's a match": a harp glissando, the strings swelling from B-flat to F,
   * and a violin that sighs its way home. About five seconds. Plays whether
   * or not the theme song is on — it replaces the arpeggio this moment always
   * had.
   */
  romance() {
    const ac = audio();
    if (!ac) return;
    void ac.resume();
    const bus = freshSting(ac);
    stingUntil = performance.now() + 5200;
    const t0 = ac.currentTime + 0.08;
    // The harp runs up two octaves of F major.
    [65, 69, 72, 76, 79, 81, 84, 88, 89].forEach((m, i) => harp(bus, m, t0 + i * 0.075));
    // IV to I: B-flat major seven, then F major nine.
    strings(bus, [46, 58, 62, 65, 69], t0 + 0.15, 1.9);
    strings(bus, [41, 57, 60, 64, 67, 69], t0 + 2.05, 2.2);
    const melody: Array<[number, number, number]> = [
      [0.35, 0.5, 74], [0.85, 0.45, 77], [1.3, 0.9, 81],
      [2.2, 0.35, 79], [2.55, 0.35, 76], [2.9, 1.6, 77],
    ];
    for (const [at, dur, m] of melody) violin(bus, m, t0 + at, dur);
    chime(bus, 84, t0 + 2.95);
    chime(bus, 89, t0 + 3.2);
    chime(bus, 93, t0 + 3.45);
  },

  /** Wah, wah, wah, wahhh. About three seconds. */
  sad() {
    const ac = audio();
    if (!ac) return;
    void ac.resume();
    const bus = freshSting(ac);
    stingUntil = performance.now() + 3400;
    let t = ac.currentTime + 0.12;
    const notes: Array<[number, number]> = [[62, 0.42], [61, 0.42], [60, 0.42], [59, 1.5]];
    notes.forEach(([m, d], i) => {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      // The plunger mute: each note opens and closes its "wah".
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(1300, t + 0.12);
      f.frequency.exponentialRampToValueAtTime(450, t + d);
      const g = ac.createGain();
      shape(g, t, 0.04, 0.16, 0.12, t + d, 0.15);
      const vib = osc('sine', 5, t, t + d + 0.2);
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(i === notes.length - 1 ? 45 : 8, t + d);
      vib.connect(depth);
      (['sawtooth', 'square'] as const).forEach((type, k) => {
        const o = osc(type, mtof(m), t, t + d + 0.2);
        // A trombone slides into the note rather than landing on it.
        o.detune.setValueAtTime(-60, t);
        o.detune.linearRampToValueAtTime(0, t + 0.08);
        depth.connect(o.detune);
        const lv = ac.createGain(); lv.gain.value = k === 0 ? 1 : 0.35;
        o.connect(lv).connect(f);
      });
      f.connect(g).connect(bus);
      t += d + 0.06;
    });
  },
};
