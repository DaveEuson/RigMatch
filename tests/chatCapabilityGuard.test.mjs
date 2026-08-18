import test from 'node:test';
import assert from 'node:assert/strict';

import { chatBeyondNote, classifyChatRequest } from '../src/lib/chatCapabilityGuard.ts';

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
