// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { showExtrasSnapshot } from './showExtras.ts';
import { showTheme, type ShowCue } from './showTheme.ts';

/** How long the show's own ending gets to start before a jingle plays anyway. */
const STING_WAIT_MS = 600;
/** A finished run can also raise the Top Match a moment later: one cue per win. */
const ONE_WIN_MS = 3000;

/**
 * The show's short sound cues. All of them play only with Show effects on,
 * which is off by default.
 *
 * Before the redesign the run jingles played for everyone, whatever the
 * switches said, and a test finishing chimed from a second synth of its own.
 */
export function playCue(cue: ShowCue) {
  if (!showExtrasSnapshot().effects) return;
  showTheme.cue(cue);
}

type Jingle = 'test-complete' | 'speed-date-complete' | 'new-winner' | 'its-a-match';
let lastWin = 0;

/**
 * A run ended with a winner: the jingle, then applause.
 *
 * With the theme song playing, the show ends with its own cue (a ta-da or a
 * sad trombone), and a jingle on top of it is two bands at once. The jingle
 * waits a moment for that cue and stands down if it started.
 */
export function playJingle(type: Jingle) {
  if (!showExtrasSnapshot().effects) return;
  // A match gets the romance: harp, strings and a violin.
  if (type === 'its-a-match') {
    showTheme.romance();
    return;
  }
  const now = Date.now();
  if (now - lastWin < ONE_WIN_MS) return;
  lastWin = now;
  const play = () => {
    showTheme.cue('jingle');
    window.setTimeout(() => showTheme.cue('applause'), 850);
  };
  if (showTheme.isPlaying() || showTheme.stingPlaying()) {
    window.setTimeout(() => { if (!showTheme.stingPlaying()) play(); }, STING_WAIT_MS);
    return;
  }
  play();
}
