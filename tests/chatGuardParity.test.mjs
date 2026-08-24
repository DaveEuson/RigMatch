// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyChatRequest as appClassify } from '../src/lib/chatCapabilityGuard.ts';
import { classifyChatRequest as chatClassify } from '../rigmatch-chat/src/lib/chatCapabilityGuard.ts';

/**
 * The honesty guard exists in two places and must agree in both.
 *
 * The main app has had it since 0.7 opened; the companion did not, and the
 * companion is the window people actually talk in — asked to draw a dog,
 * starcoder2:3b wrote two hundred words describing one and nothing said that
 * was going to happen.
 *
 * The two cannot share a module: they are separate applications with separate
 * builds. So the classifier is copied, and this holds the copies together for
 * the same reason the benchmark suites have a parity guard — code that exists
 * twice and is edited once is a bug nobody sees until someone reports that the
 * warning fires in one window and not the other.
 *
 * Only the classification is shared. The wording is deliberately not: the main
 * app points at Advanced Mode, and the companion points at the chips above its
 * own model list and can name the checkpoint that would do the work.
 */

const CASES = [
  // Should warn.
  'draw me a picture of a cat',
  'draw me a picture of a dog',
  'can you generate an image of a sunset',
  'make a logo for my band',
  'sketch a poster for the show',
  'paint an illustration of a harbour',
  'make a video of a rocket',
  'generate an animation of a bouncing ball',
  'create a gif of a cat falling over',
  'read this aloud',
  'say something out loud for me',
  'transcribe this recording',
  'give me a transcript of the meeting',
  'listen to this clip and tell me what it says',
  'caption that audio file',

  // Must NOT warn — ordinary questions that mention the words.
  'how do I draw a flowchart in mermaid',
  'what is the capital of France',
  'summarise the picture this data paints of Q4',
  'explain how image compression works',
  'write me a function that renders a chart',
  'what does the word illustration mean',
  'my video card is slow, why',
  'read the docs and summarise them',

  // Shapes a broken caller can produce.
  '',
  '   ',
];

test('both copies of the classifier agree on every case', () => {
  for (const message of CASES) {
    assert.equal(
      chatClassify(message),
      appClassify(message),
      `the two guards disagree on ${JSON.stringify(message)} — `
      + 'one copy was edited and the other was not',
    );
  }
});

test('the cases actually exercise every kind, so agreement means something', () => {
  // Two functions that both return null for everything would agree perfectly.
  const kinds = new Set(CASES.map((m) => appClassify(m)));
  for (const kind of ['image', 'video', 'speech', 'transcribe', null]) {
    assert.ok(kinds.has(kind), `no case in this list produces ${String(kind)}`);
  }
});

test('an ordinary question is never classified as a request for a file', () => {
  // The failure that matters most. A note that fires on prose stops being read,
  // and then the notes that matter are skipped too.
  const ordinary = [
    'how do I draw a flowchart in mermaid',
    'what is the capital of France',
    'summarise the picture this data paints of Q4',
    'explain how image compression works',
  ];
  for (const message of ordinary) {
    assert.equal(chatClassify(message), null, `${JSON.stringify(message)} was wrongly flagged`);
  }
});
