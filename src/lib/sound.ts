/** UI jingles played on run milestones. */
export function playJingle(type: 'speed-date-complete' | 'new-winner' | 'its-a-match') {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes =
      type === 'speed-date-complete'
        ? [
            { freq: 261.63, start: 0,    dur: 0.08, vol: 0.15 },
            { freq: 329.63, start: 0.09, dur: 0.08, vol: 0.15 },
            { freq: 392.00, start: 0.18, dur: 0.08, vol: 0.15 },
            { freq: 523.25, start: 0.28, dur: 0.30, vol: 0.20 },
            { freq: 659.25, start: 0.34, dur: 0.25, vol: 0.14 },
          ]
        : type === 'new-winner'
        ? [
            { freq: 523.25, start: 0,    dur: 0.09, vol: 0.18 },
            { freq: 659.25, start: 0.11, dur: 0.09, vol: 0.18 },
            { freq: 783.99, start: 0.22, dur: 0.09, vol: 0.18 },
            { freq: 1046.5, start: 0.36, dur: 0.38, vol: 0.20 },
          ]
        : /* its-a-match — romantic ascending arpeggio */ [
            { freq: 261.63, start: 0,    dur: 0.14, vol: 0.16 }, // C4
            { freq: 329.63, start: 0.16, dur: 0.14, vol: 0.16 }, // E4
            { freq: 392.00, start: 0.32, dur: 0.14, vol: 0.16 }, // G4
            { freq: 523.25, start: 0.48, dur: 0.22, vol: 0.20 }, // C5
            { freq: 659.25, start: 0.55, dur: 0.20, vol: 0.16 }, // E5
            { freq: 783.99, start: 0.62, dur: 0.20, vol: 0.14 }, // G5
            { freq: 1046.5, start: 0.72, dur: 0.70, vol: 0.22 }, // C6
            { freq: 783.99, start: 0.80, dur: 0.55, vol: 0.12 }, // G5 harmony
            { freq: 659.25, start: 0.90, dur: 0.45, vol: 0.10 }, // E5 tail
          ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(note.vol, now + note.start + 0.012);
      gain.gain.linearRampToValueAtTime(0, now + note.start + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.05);
    }
    const totalDur = Math.max(...notes.map((n) => n.start + n.dur));
    window.setTimeout(() => void ctx.close(), (totalDur + 0.3) * 1000);
  } catch {
    // AudioContext unavailable
  }
}
