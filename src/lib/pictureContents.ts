// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What is in each of RigMatch's own test pictures, so a description of one can
 * be checked against it.
 *
 * The reading test used to grade a description by its shape: an answer came
 * back, it ran to twelve words, it named a color or an object, and it did not
 * refuse. Shown the contestant wall, Gemma 4 described a Java "Hello, World!"
 * on a plain white background, and that scored 100. RigMatch chose these
 * pictures, so it knows what is in them. Each lists the five things a good
 * description names, in the words people use for them, and all four share the
 * few things none of them shows. A picture someone uploads has no such list, so
 * a description of one is left unjudged.
 *
 * No assets here, so it can be tested in Node. The ids are the ones
 * VISION_TEST_IMAGES uses in labChallenges.ts, and a test holds the two together.
 */

export type PictureThing = {
  /** How it reads in a sentence: "robots", "a stage". */
  name: string;
  /** The words a description might use for it. */
  words: RegExp;
};

/** Four of the five things named passes: the line every other "matches" check uses. */
export const PICTURE_PASS = 0.8;

const ROBOTS: PictureThing = {
  name: 'robots',
  words: /\b(?:robots?|robotic|androids?|droids?|automatons?|bots?|cyborgs?|mechs?)\b/i,
};
const HEARTS: PictureThing = { name: 'hearts', words: /\bhearts?\b/i };
const PINK_OR_RED: PictureThing = {
  name: 'pink or red',
  words: /\b(?:pink|pinkish|red|reddish|magenta|crimson|maroon|burgundy|rose|rosy|fuchsia|scarlet|purple)\b/i,
};
// "Display" is left out: "the image displays" is how many descriptions begin.
const SCREEN: PictureThing = {
  name: 'a computer or screen',
  words: /\b(?:computers?|monitors?|screens?|crts?|pcs?|tvs?|televisions?)\b/i,
};

export const PICTURE_CONTENTS: Record<string, PictureThing[]> = {
  // Robot host: two robots on a date at a round table, an old computer writing
  // with a pen and a small robot in headphones.
  robot: [ROBOTS, SCREEN, HEARTS, PINK_OR_RED, { name: 'a table', words: /\b(?:tables?|tablecloths?|desks?)\b/i }],
  // Contestant wall: a robot at a keyboard before a wall of old monitors, each
  // showing a robot, with a pink telephone, a mug and a lava lamp on the desk.
  lineup: [
    ROBOTS,
    { ...SCREEN, name: 'screens' },
    HEARTS,
    PINK_OR_RED,
    { name: 'something on the desk', words: /\b(?:(?:tele)?phones?|rotary|keyboards?|mugs?|cups?|coffee|lamps?)\b/i },
  ],
  // Green room: an old computer with heart eyes, a small robot with a
  // clipboard, and the parts of a PC laid out on the table.
  greenroom: [
    ROBOTS,
    SCREEN,
    HEARTS,
    PINK_OR_RED,
    {
      name: 'computer parts',
      words: /\b(?:graphics cards?|video cards?|gpus?|fans?|ram|memory|dimms?|circuit boards?|screwdrivers?|components?|hardware)\b/i,
    },
  ],
  // Scorecards: four robots on a stage holding heart cards, and a host in a top
  // hat with a microphone.
  ceremony: [
    ROBOTS,
    { name: 'a stage', words: /\b(?:stages?|podiums?|pedestals?|platforms?|spotlights?|curtains?|lecterns?|theat(?:er|re)s?)\b/i },
    HEARTS,
    PINK_OR_RED,
    {
      name: 'the cards or the host',
      words: /\b(?:cards?|scorecards?|signs?|placards?|microphones?|mics?|top hats?|tuxedos?|host|presenter|announcer)\b/i,
    },
  ],
};

/**
 * What none of the four pictures shows. Code, text and a white background are
 * what Gemma 4 described; people and a screenshot are the other things a
 * description of one of these could only have made up.
 */
export const NOT_IN_ANY_PICTURE: PictureThing[] = [
  { name: 'code', words: /\b(?:code|coding|java(?:script)?|python|hello,? world|syntax|curly braces|semicolons?)\b/i },
  // Writing, as in Gemma 4's second try: "a large block of text overlaid on the
  // image... the word 'red' repeated". The prompt asks for any text, so "there
  // is no readable text" is a common right answer; only a claim of writing counts.
  {
    name: 'text',
    words: /\b(?:(?:blocks?|lines?|pieces?|paragraphs?) of text|text (?:reads|says|that reads|overlaid)|(?:the )?following text|text (?:on|in) (?:the|some|each|a|an|one|its)|(?:that|which) (?:reads|says)|the words?|transcribed as|fonts?|lettering|typeface)\b/i,
  },
  // "Human-like" describes a robot, so it does not count.
  { name: 'people', words: /\b(?:man|men|woman|women|person|people|boys?|girls?|child|children|humans?(?!-?like))\b/i },
  { name: 'a white background', words: /\bwhite background\b/i },
  { name: 'a screenshot', words: /\b(?:screenshot|spreadsheet|web ?page|website)\b/i },
];

const NEGATIONS = new Set([
  'no', 'not', 'nor', 'without', 'never', 'neither', 'none', 'cannot',
  "isn't", "aren't", "doesn't", "don't", "wasn't", "weren't", "can't", "couldn't",
]);
/** Where a negation stops reaching: the end of its clause. */
const CLAUSE_END = /[.!?;:,\n]|\b(?:but|while|although|though|however|yet)\b/gi;

/**
 * Whether a description says the thing is there. "There are no people" and
 * "without any code" say it is not, so they count for nothing either way.
 */
export function mentions(description: string, thing: PictureThing): boolean {
  const text = description.replace(/[’‘]/g, "'");
  const flags = thing.words.flags.includes('g') ? thing.words.flags : `${thing.words.flags}g`;
  for (const match of text.matchAll(new RegExp(thing.words.source, flags))) {
    const before = text.slice(0, match.index ?? 0);
    let clauseStart = 0;
    for (const end of before.matchAll(CLAUSE_END)) clauseStart = (end.index ?? 0) + end[0].length;
    const lastWords = before.slice(clauseStart).toLowerCase().split(/[^a-z']+/).filter(Boolean).slice(-4);
    if (!lastWords.some((word) => NEGATIONS.has(word))) return true;
  }
  return false;
}

export type PictureCheck = {
  things: PictureThing[];
  named: PictureThing[];
  missed: PictureThing[];
  madeUp: PictureThing[];
  /** The things named, less the things made up, over the things there are: 0 to 1. */
  share: number;
};

/** A description checked against one of the test pictures, or null for a picture RigMatch did not choose. */
export function checkDescription(picture: string, description: string): PictureCheck | null {
  const things = Object.prototype.hasOwnProperty.call(PICTURE_CONTENTS, picture) ? PICTURE_CONTENTS[picture] : undefined;
  if (!things) return null;
  const text = description ?? '';
  const named = things.filter((thing) => mentions(text, thing));
  const missed = things.filter((thing) => !named.includes(thing));
  const madeUp = NOT_IN_ANY_PICTURE.filter((thing) => mentions(text, thing));
  // Each thing made up takes back one thing named: naming all of the picture
  // and a person who is not in it is not a perfect description of it.
  return { things, named, missed, madeUp, share: Math.max(0, named.length - madeUp.length) / things.length };
}

/** "robots, hearts and a stage". */
export function listThings(things: PictureThing[], conjunction: 'and' | 'or' = 'and'): string {
  const names = things.map((thing) => thing.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}
