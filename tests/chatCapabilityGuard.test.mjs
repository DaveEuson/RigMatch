// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { attachmentBlockedReason, chatBeyondNote, classifyChatRequest } from '../src/lib/chatCapabilityGuard.ts';

// Ask a text model to draw a cat and it does not refuse — it describes one, or
// announces it has made one. The second is a straight untruth, and the app was
// relaying it without comment.

test('a request for a picture is recognised', () => {
  for (const message of [
    'draw me a picture of a cat',
    'can you generate an image of a sunset',
    'make a logo for my band',
    'please create an illustration of a robot',
    'design an icon showing a coffee cup',
  ]) {
    assert.equal(classifyChatRequest(message), 'image', message);
  }
});

test('video and speech are told apart from images', () => {
  // "make a video of a cat" also matches the image nouns through "of", and the
  // more specific answer is the more useful one.
  assert.equal(classifyChatRequest('make a video of a cat playing piano'), 'video');
  assert.equal(classifyChatRequest('generate an animation of a rocket'), 'video');
  assert.equal(classifyChatRequest('read this out loud please'), 'speech');
  assert.equal(classifyChatRequest('can you generate audio of this paragraph'), 'speech');
});

test('talking about drawing is not asking for a drawing', () => {
  // The note is additive rather than a block, but a note that fires on every
  // mention of a picture stops being read at all.
  for (const message of [
    'how do I draw a flowchart in mermaid',
    'what does this image tell you about the code',
    'explain how diffusion models create images',
    'write a function called drawGrid',
    'summarise the picture this data paints of Q4',
  ]) {
    assert.equal(classifyChatRequest(message), null, message);
  }
});

test('an ordinary question is left alone', () => {
  assert.equal(classifyChatRequest('what is the capital of France'), null);
  assert.equal(classifyChatRequest(''), null);
});

test('the note names the model and where the thing can really be done', () => {
  const image = chatBeyondNote('image', 'qwen2.5:7b');
  assert.match(image, /qwen2\.5:7b/, 'names the model rather than "the model"');
  assert.match(image, /cannot make images/);
  assert.match(image, /ComfyUI/, 'a refusal without a route is half an answer');

  assert.match(chatBeyondNote('video', 'llama3'), /video checkpoint|Video test/);
  // Honest about the one RigMatch genuinely cannot do anywhere.
  assert.match(chatBeyondNote('speech', 'llama3'), /no text-to-speech/);
});

test('nothing is said when nothing was asked for', () => {
  assert.equal(chatBeyondNote(null, 'llama3'), null);
});

test('an attachment the new model cannot take is explained, not sent', () => {
  // The attach button is capability-gated, but the model can change afterwards
  // and the attachment stays. Ollama then answers "Failed to load image or
  // audio file", which reads as a broken recording rather than the wrong model.
  const audioToDeafModel = attachmentBlockedReason({
    kind: 'audio', model: 'llama3', canSee: false, canHear: false,
  });
  assert.match(audioToDeafModel, /cannot listen/);
  assert.match(audioToDeafModel, /llama3/, 'names the model that cannot do it');
  assert.match(audioToDeafModel, /Listening test/, 'and where it can still be done');

  assert.match(
    attachmentBlockedReason({ kind: 'image', model: 'llama3', canSee: false, canHear: false }),
    /cannot look at images/,
  );
});

test('an attachment the model can take is left alone', () => {
  assert.equal(attachmentBlockedReason({ kind: 'audio', model: 'gemma4:e2b', canSee: false, canHear: true }), null);
  assert.equal(attachmentBlockedReason({ kind: 'image', model: 'llava', canSee: true, canHear: false }), null);
});

test('a transcription request is recognised', () => {
  // A text model asked to transcribe does not refuse — it writes a plausible
  // transcript of nothing, which is the most convincing untruth of the lot.
  assert.equal(classifyChatRequest('transcribe this recording'), 'transcribe');
  assert.equal(classifyChatRequest('write a transcript of the meeting'), 'transcribe');
  assert.equal(classifyChatRequest('listen to this clip and tell me what it says'), 'transcribe');
  assert.equal(classifyChatRequest('what is the capital of France'), null);
});

test('transcription is the one limit that depends on the model, not on Ollama', () => {
  // Some local models genuinely hear. Warning one of those would be nagging,
  // and a note that fires when it need not stops being read at all.
  assert.equal(chatBeyondNote('transcribe', 'gemma4:e2b', { canHear: true }), null);

  const deaf = chatBeyondNote('transcribe', 'llama3', { canHear: false });
  assert.match(deaf, /cannot listen/);
  assert.match(deaf, /transcript of nothing/, 'says what it would do instead of refusing');
  assert.match(deaf, /Listening test/, 'and where it can be done properly');
});
