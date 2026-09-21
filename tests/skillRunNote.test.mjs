// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { nothingToRunNote } from '../src/lib/skillRunNote.ts';

const NONE = { appBuilder: false, code: false, recognize: false, listen: false, image: false, video: false };

test('a run that asked for no skill test says nothing about skill tests', () => {
  // Found on the Jetson smoke for 0.9.0: an ordinary one-model test ended with
  // "None of these models can be tested that way." in Activity, because the
  // skill round follows every run whether or not a skill was ticked.
  assert.equal(nothingToRunNote(NONE), null);
});

test('a skill that was asked for and had no eligible model is still reported', () => {
  // The wizard waits for its round to start and stop; silence here stranded it.
  assert.equal(nothingToRunNote({ ...NONE, recognize: true }), 'None of these models can read pictures.');
  assert.equal(nothingToRunNote({ ...NONE, listen: true }), 'None of these models can listen to audio.');
  for (const skill of ['appBuilder', 'code', 'image', 'video']) {
    assert.equal(nothingToRunNote({ ...NONE, [skill]: true }), 'None of these models can be tested that way.', skill);
  }
});
