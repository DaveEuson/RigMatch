// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NOT_IN_ANY_PICTURE, PICTURE_CONTENTS, PICTURE_PASS, checkDescription } from '../src/lib/pictureContents.ts';
import { scoreAdvancedVisionResponse } from '../src/lib/labScoring.ts';
import { JUDGE_PASS } from '../src/lib/balance.ts';

/**
 * A description is checked against what is in the picture, not its shape.
 * Shown the contestant wall on 14 September 2026, Gemma 4 answered with a Java
 * "Hello, World!" on a white background, and the old rubric gave it 100.
 */

const GEMMA_ON_THE_CONTESTANT_WALL = 'The image displays a snippet of code, likely written in Java, set against a plain white background. The code is structured using programming keywords and symbols, including curly braces (`{}`), parentheses, and semicolons. The readable text is the classic "Hello, World!" program, which is transcribed as: ```java public static void main(String[] args) { System.out.println("Hello, World!"); } ``` The layout is clean and academic, presenting a fundamental example of how to print a string to the console.';

// A careful description of each picture, as a good answer would give it.
const FAITHFUL = {
  robot: 'Two cute retro robots sit at a round table with a pink tablecloth. On the left, a beige computer with a pixel heart on its screen writes on heart-shaped cards; on the right, a small robot in pink headphones rests its chin on its hand.',
  lineup: 'A boxy robot types at a keyboard in front of a wall of old television monitors, each showing a different cartoon robot and a heart. A pink rotary telephone and a coffee mug sit on the desk, and the room glows red and purple.',
  greenroom: 'An old beige computer with heart eyes on its screen wears a bow tie, beside a small robot holding a clipboard. A graphics card, memory sticks and a screwdriver lie on the table in a pink room full of hearts.',
  ceremony: 'Four colorful robots stand on round pedestals on a stage, each holding a card with hearts, while a host robot in a top hat speaks into a microphone. Giant glowing hearts and red curtains fill the background.',
};

const names = (things) => things.map((thing) => thing.name);

test('every picture the test offers has five things to check, and nothing else does', () => {
  const source = readFileSync(new URL('../src/lib/labChallenges.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const VISION_TEST_IMAGES');
  const block = source.slice(start, source.indexOf('];', start));
  const offered = [...block.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...offered].sort(), Object.keys(PICTURE_CONTENTS).sort());
  for (const [id, things] of Object.entries(PICTURE_CONTENTS)) assert.equal(things.length, 5, id);
  assert.equal(PICTURE_PASS, JUDGE_PASS, 'passing is the line every other match check uses');
});

test('a careful description of each picture names all five things and invents nothing', () => {
  for (const [id, description] of Object.entries(FAITHFUL)) {
    const check = checkDescription(id, description);
    assert.deepEqual(names(check.missed), [], id);
    assert.deepEqual(names(check.madeUp), [], id);
    assert.equal(check.share, 1, id);
  }
});

test('the answer that scored 100 describes nothing in the contestant wall', () => {
  const check = checkDescription('lineup', GEMMA_ON_THE_CONTESTANT_WALL);
  assert.deepEqual(names(check.named), [], '"the image displays" is not a screen');
  assert.deepEqual(names(check.madeUp), ['code', 'text', 'a white background']);
  assert.equal(check.share, 0);

  const scored = scoreAdvancedVisionResponse(GEMMA_ON_THE_CONTESTANT_WALL, 'stop', 'lineup');
  assert.equal(scored.score, 0);
  assert.equal(scored.grade, 'F');
  assert.equal(scored.adherence, 0);
  const line = (label) => scored.checks.find((check) => check.label === label);
  assert.equal(line('Named what is in the picture').passed, false);
  assert.match(line('Named what is in the picture').detail, /Named none of the 5 things in it: robots, screens, hearts, pink or red and something on the desk/);
  assert.equal(line('Said nothing that is not there').passed, false);
  assert.match(line('Said nothing that is not there').detail, /Described code, text and a white background, which the picture does not have/);
});

test('its second try, a picture of the word "red", names a color and scores nothing for it', () => {
  // gemma4:e2b on the contestant wall in the fixed build, 14 September 2026.
  const answer = 'This image is dominated by a vibrant, textured background composed of various shades of red and orange. The overall appearance is highly saturated and warm. There is a large block of text overlaid on the image, written in a bold, red font. The text consists almost entirely of the word "red" repeated multiple times, filling the majority of the frame.';
  const check = checkDescription('lineup', answer);
  assert.deepEqual(names(check.named), ['pink or red']);
  assert.deepEqual(names(check.madeUp), ['text']);
  const scored = scoreAdvancedVisionResponse(answer, 'stop', 'lineup');
  assert.equal(scored.score, 0);
  assert.equal(scored.checks.find((line) => line.label === 'Said nothing that is not there').passed, false);
});

test('Gemma 3 sees the contestant wall, and loses one thing for a word that is not on it', () => {
  // gemma3:4b, shown the same PNG through the same endpoint, 14 September 2026.
  const answer = 'The image depicts a retro-futuristic workspace dominated by a collection of small, colorful computer monitors. Each monitor displays a different stylized robot character with a distinct color scheme – pink, blue, yellow, and gray – and a heart symbol. The monitors are mounted on a dark, metallic console with a keyboard, telephone, and various buttons and switches.  A warm, pinkish-orange light illuminates the scene, casting shadows and highlighting the details of the robots and equipment.  There are several heart-shaped decorations on the wall behind the monitors. \n\nI can see the following text on some of the monitors: "LOVE"';
  const check = checkDescription('lineup', answer);
  assert.equal(check.named.length, 5);
  assert.deepEqual(names(check.madeUp), ['text'], 'there is no word on the monitors, only hearts');
  const scored = scoreAdvancedVisionResponse(answer, 'stop', 'lineup');
  assert.equal(scored.score, 80);
  assert.equal(scored.checks.find((line) => line.label === 'Named what is in the picture').passed, true);
  // And "I cannot see any text" is not a claim that there is some.
  assert.deepEqual(names(checkDescription('lineup', 'I cannot see any text on the screens.').madeUp), []);
});

test('a short answer that names four of the five things passes', () => {
  const scored = scoreAdvancedVisionResponse('Cartoon robots appear on a wall of retro monitors decorated with hearts, all in pink light.', 'stop', 'lineup');
  assert.equal(scored.adherence, 0.8);
  assert.equal(scored.score, 80);
  const named = scored.checks.find((check) => check.label === 'Named what is in the picture');
  assert.equal(named.passed, true);
  assert.match(named.detail, /Named 4 of 5: robots, screens, hearts and pink or red\. Missed something on the desk\./);
});

test('saying a thing is not there is not claiming it is', () => {
  const check = checkDescription('lineup', 'Robots sit before retro monitors covered in hearts in a pink room. There are no people, and no code or text anywhere.');
  assert.deepEqual(names(check.madeUp), []);
  assert.equal(check.share, 0.8);
  // A human-like robot is a robot.
  assert.deepEqual(names(checkDescription('robot', 'A human-like robot sits at a table.').madeUp), []);
});

test('each thing made up takes back one thing named', () => {
  const check = checkDescription('lineup', 'Robots, screens, hearts, a pink glow and a telephone on the desk, and a man watching from a chair.');
  assert.equal(check.named.length, 5);
  assert.deepEqual(names(check.madeUp), ['people']);
  assert.equal(check.share, 0.8);
  const scored = scoreAdvancedVisionResponse('Robots, screens, hearts, a pink glow and a telephone on the desk, and a man watching from a chair.', 'stop', 'lineup');
  assert.match(scored.checks.find((line) => line.label === 'Named what is in the picture').detail, /The one thing it made up takes one back\./);
  assert.equal(scored.checks.find((line) => line.label === 'Said nothing that is not there').passed, false);
});

test('nothing returned scores nothing, and cannot pass for having said nothing wrong', () => {
  const scored = scoreAdvancedVisionResponse('', 'stop', 'robot');
  assert.equal(scored.score, 0);
  assert.equal(scored.adherence, 0);
  const absent = scored.checks.find((check) => check.label === 'Said nothing that is not there');
  assert.equal(absent.passed, false);
  assert.equal(absent.detail, 'There was no description to check.');
});

test('a picture RigMatch did not choose is left unjudged', () => {
  const good = 'A man in a white shirt and dark tie sits by a window on the left, holding a small cup near his face. The background is a bright room.';
  const scored = scoreAdvancedVisionResponse(good, 'stop');
  assert.equal(scored.adherence, null);
  const line = scored.checks.find((check) => check.label === 'Named what is in the picture');
  assert.equal(line.unchecked, true);
  assert.equal(line.passed, false);
  // Its score is the shape of the answer, as it always was, and nothing ranks on it.
  assert.equal(scored.score, 100);
  assert.equal(scoreAdvancedVisionResponse(good, 'stop', 'no-such-picture').adherence, null);
  assert.equal(checkDescription('constructor', good), null);
});

test('what none of the pictures shows is really in none of them', () => {
  for (const [id, description] of Object.entries(FAITHFUL)) {
    for (const thing of NOT_IN_ANY_PICTURE) assert.equal(thing.words.test(description), false, `${id}: ${thing.name}`);
  }
});
