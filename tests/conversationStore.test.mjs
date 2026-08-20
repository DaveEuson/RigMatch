// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_CHAT_TITLE,
  STORE_VERSION,
  conversationsForModel,
  createConversation,
  deriveTitle,
  migrateV1,
  parseStore,
  serializeStore,
  sortConversations,
  withMessages,
} from '../rigmatch-chat/src/lib/conversationStore.ts';

const OPTS = { makeId: (i) => `id-${i}`, now: 1_770_000_000_000, defaultPersonalityId: 'default' };
const msg = (role, content, ts) => ({ id: `${role}-${ts}`, role, content, ts });

/** A v1 store of the shape every existing install has on disk. */
const V1 = {
  version: 1,
  conversations: {
    'llama3.2:3b::default': [
      msg('user', 'How do I rotate a Postgres password without downtime?', 1000),
      msg('assistant', 'Create the new role first…', 1100),
    ],
    'qwen2.5:7b::creative-copilot': [
      msg('user', 'Give me ten names for a bread shop', 2000),
      msg('assistant', 'Crust Fund, Loafers…', 2100),
    ],
    // Written before personalities existed — someone's entire history with
    // this model lives under a bare key.
    'mistral:7b': [
      msg('user', 'Explain zero-copy networking', 3000),
      msg('assistant', 'The kernel avoids…', 3100),
    ],
    'gemma3:4b::default': [],
  },
};

test('a v1 store survives the move to conversations', () => {
  const conversations = parseStore(JSON.stringify(V1), OPTS);
  assert.equal(conversations.length, 3, 'the empty thread is dropped, the other three are kept');

  const byModel = Object.fromEntries(conversations.map((c) => [c.modelName, c]));
  assert.equal(byModel['llama3.2:3b'].personalityId, 'default');
  assert.equal(byModel['qwen2.5:7b'].personalityId, 'creative-copilot');
  // The bare key is the one that would be easiest to lose.
  assert.equal(byModel['mistral:7b'].personalityId, 'default', 'a pre-personality key keeps its messages');
  assert.equal(byModel['mistral:7b'].messages.length, 2);
});

test('migration loses no messages', () => {
  // The invariant that matters most: this runs once, over history someone
  // cannot get back.
  const before = Object.values(V1.conversations).flat();
  const after = parseStore(JSON.stringify(V1), OPTS).flatMap((c) => c.messages);
  assert.equal(after.length, before.length);
  assert.deepEqual(
    after.map((m) => m.content).sort(),
    before.map((m) => m.content).sort(),
  );
});

test('migrated threads are named after what was asked in them', () => {
  const conversations = parseStore(JSON.stringify(V1), OPTS);
  const llama = conversations.find((c) => c.modelName === 'llama3.2:3b');
  assert.equal(llama.title, 'How do I rotate a Postgres password without…');
  assert.ok(llama.titleIsAuto, 'a derived title must stay derived until renamed');
  // Times come from the messages, not the migration clock, so the sidebar
  // orders a migrated history the way it actually happened.
  assert.equal(llama.createdAt, 1000);
  assert.equal(llama.updatedAt, 1100);
});

test('a colon in a model tag does not split the key in the wrong place', () => {
  // Keys are `model::personality` and model names contain single colons —
  // splitting on the first `::` is right, but only the *last* one is safe if a
  // personality id ever contained one.
  const migrated = migrateV1(
    { 'qwen2.5-coder:0.5b::direct-helper': [msg('user', 'hi', 1)] },
    OPTS.makeId, OPTS.now, 'default',
  );
  assert.equal(migrated[0].modelName, 'qwen2.5-coder:0.5b');
  assert.equal(migrated[0].personalityId, 'direct-helper');
});

test('a v2 store round-trips', () => {
  const original = parseStore(JSON.stringify(V1), OPTS);
  const reread = parseStore(serializeStore(original), OPTS);
  assert.deepEqual(reread, original);
  assert.equal(JSON.parse(serializeStore(original)).version, STORE_VERSION);
});

test('a store from a newer build is refused rather than half-read', () => {
  // Reading it would drop whatever the newer shape added, and the next save
  // would write that loss back over the file.
  assert.equal(parseStore(JSON.stringify({ version: 99, conversations: [] }), OPTS), null);
  assert.equal(parseStore('{"version":2}', OPTS), null, 'v2 must carry an array');
  assert.equal(parseStore('{oh no', OPTS), null);
  assert.equal(parseStore(null, OPTS), null);
});

test('broken entries are dropped without taking the good ones with them', () => {
  const raw = JSON.stringify({
    version: 2,
    conversations: [
      { id: 'a', modelName: 'llama3.2:3b', personalityId: 'default', title: 'Kept',
        titleIsAuto: false, createdAt: 1, updatedAt: 2, messages: [msg('user', 'hi', 1)] },
      { id: 'b', messages: [] },                       // no model
      { id: 'c', modelName: 'x', messages: 'not a list' },
      null,
    ],
  });
  const conversations = parseStore(raw, OPTS);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].title, 'Kept');
  assert.equal(conversations[0].titleIsAuto, false, 'a hand-written title stays put');
});

test('titles are derived from the opening question, cut at a word', () => {
  assert.equal(deriveTitle([]), NEW_CHAT_TITLE);
  assert.equal(deriveTitle([msg('assistant', 'unprompted', 1)]), NEW_CHAT_TITLE);
  assert.equal(deriveTitle([msg('user', '   ', 1), msg('user', 'Real question', 2)]), 'Real question');
  // Leading blank lines are skipped rather than producing an empty title.
  assert.equal(deriveTitle([msg('user', '\n\nAfter some blank lines', 1)]), 'After some blank lines');

  const long = deriveTitle([msg('user', 'Explain how grouped query attention reduces the size of the key value cache', 1)]);
  assert.ok(long.length <= 45, `too long: ${long}`);
  assert.ok(long.endsWith('…'));
  assert.ok(!/\s…$/.test(long), 'should not leave a dangling space before the ellipsis');
  assert.ok(long.startsWith('Explain how grouped query attention'));

  // A single unbroken run has no word boundary to cut at, and must still fit.
  const unbroken = deriveTitle([msg('user', 'x'.repeat(200), 1)]);
  assert.ok(unbroken.length <= 45);
});

test('an automatic title follows the conversation; a renamed one does not', () => {
  const base = createConversation({ id: 'c1', modelName: 'llama3.2:3b', personalityId: 'default', now: 10 });
  assert.equal(base.title, NEW_CHAT_TITLE);

  const filled = withMessages(base, [msg('user', 'First real question', 20)], 20);
  assert.equal(filled.title, 'First real question');
  assert.equal(filled.updatedAt, 20);

  const renamed = { ...filled, title: 'My own name', titleIsAuto: false };
  const later = withMessages(renamed, [...renamed.messages, msg('user', 'Something else entirely', 30)], 30);
  assert.equal(later.title, 'My own name', 'a rename must survive later messages');
  assert.equal(later.updatedAt, 30);
});

test('a model lists its own threads, newest first', () => {
  const conversations = [
    { ...createConversation({ id: 'a', modelName: 'llama3.2:3b', personalityId: 'default', now: 1 }), updatedAt: 100 },
    { ...createConversation({ id: 'b', modelName: 'llama3.2:3b', personalityId: 'default', now: 1 }), updatedAt: 300 },
    { ...createConversation({ id: 'c', modelName: 'qwen2.5:7b', personalityId: 'default', now: 1 }), updatedAt: 200 },
  ];
  assert.deepEqual(conversationsForModel(conversations, 'llama3.2:3b').map((c) => c.id), ['b', 'a']);
  assert.deepEqual(sortConversations(conversations).map((c) => c.id), ['b', 'c', 'a']);
  // Sorting must not reorder the caller's array in place.
  assert.deepEqual(conversations.map((c) => c.id), ['a', 'b', 'c']);
});

test('a compacted thread keeps its summary, and the count cannot outrun the messages', () => {
  // summarizedCount decides how much of the transcript the model is NOT shown.
  // A value larger than the conversation would hide real turns, so it is
  // clamped to what is there rather than trusted.
  const raw = (count) => JSON.stringify({
    version: 2,
    conversations: [{
      id: 'a', modelName: 'llama3.2:3b', personalityId: 'default', title: 'T',
      titleIsAuto: true, createdAt: 1, updatedAt: 2,
      messages: [msg('user', 'one', 1), msg('assistant', 'two', 2), msg('user', 'three', 3)],
      summary: 'notes', summarizedCount: count, summaryBy: 'qwen2.5:7b',
    }],
  });

  const ok = parseStore(raw(2), OPTS)[0];
  assert.equal(ok.summary, 'notes');
  assert.equal(ok.summarizedCount, 2);
  assert.equal(ok.summaryBy, 'qwen2.5:7b');

  assert.equal(parseStore(raw(99), OPTS)[0].summarizedCount, 3, 'clamped to the messages present');
  assert.equal(parseStore(raw(-5), OPTS)[0].summarizedCount, 0);

  // A count without a summary would hide turns and put nothing in their place.
  const orphan = JSON.parse(raw(2));
  delete orphan.conversations[0].summary;
  assert.equal(parseStore(JSON.stringify(orphan), OPTS)[0].summarizedCount, undefined);
});
