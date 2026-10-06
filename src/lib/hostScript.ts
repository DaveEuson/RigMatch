// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The host's lines, by situation, from the redesign's host script.
 *
 * One voice: a warm 70s game-show host who is on your side and never mocks a
 * model or a computer. One or two sentences, under 30 words. Numbers come from
 * the app through the {braces}, never written in, and no line claims a result
 * the board does not show.
 *
 * The script's own Trojan line crowned the smallest model, which is not how
 * the Trojan stage is earned here (see lib/trojanStage.ts), so the Trojan line
 * below is RigMatch's own.
 */
export const HOST_LINES = {
  setupIdle: [
    "Welcome to RigMatch! Tonight's show is all about your computer. One click and I'll handle the rest.",
    'Good evening and welcome! Before anyone walks on, let me take a look at the stage.',
    'Lights up! First, a quick peek at your computer, so I only bring out contestants who fit.',
  ],
  // The check found no Ollama: the one step a newcomer does by hand.
  setupNoOllama: [
    "One thing before the show: RigMatch needs Ollama, a free program that runs the models. Get it below and I'll spot it when it's running.",
  ],
  setupChecking: [
    'Peeking under the bonnet. Nobody panic.',
    'Measuring the stage. Contestants, please stay in the green room.',
    "Counting graphics memory. This is the only maths on tonight's show, I promise.",
  ],
  setupDone: [
    "Lovely! {vram} GB of graphics memory. That's room for some very charming contestants.",
    "We're set. {vram} GB to play with, and Ollama is waiting in the wings.",
    "Your computer passed the audition. Let's meet tonight's hopefuls.",
  ],
  pick: [
    "Who's your dream model? Tell me what you want and I'll bring out the right contestants.",
    'Pick up to five. Everyone you see fits your computer, so no heartbreak tonight.',
    'Take your time. A good match is worth the wait.',
  ],
  pickFull: [
    'Five is a full house. Send one home to make room.',
    "That's a full stage! To bring someone new on, someone has to take a bow.",
  ],
  download: [
    'Getting the contestants ready backstage. Hair, make-up, {gb} GB of luggage.',
    'Downloading now. The good ones always take a moment to get ready.',
    "Nearly there. Once they're unpacked they stay on your PC for next time.",
  ],
  downloadFailed: [
    "Oh dear, {name} missed the bus. The download stopped. We'll carry on with the others.",
    // Used when too few contestants arrived to carry on, beside "Try the downloads again".
    "A hiccup backstage: {name} didn't arrive. Nothing's broken; try the download again or pick someone else.",
  ],
  dating: [
    "{name} is on question {q}. Let's see what they've got.",
    'Round {q}: {topic}. Contestants, nice and steady.',
    '{name} is thinking. Silence in the studio, please.',
  ],
  selfJudge: [
    'Heads up: {name} is also tonight\'s judge. A contestant marking its own homework can flatter itself.',
  ],
  ollamaDown: [
    "The band's not here! Ollama isn't answering. Start it up and I'll wait right here.",
    "We've lost the studio feed. Ollama stopped answering, so the show is paused.",
  ],
  winner: [
    'We have a match! Go get to know each other.',
    'And the Top Match is {name}! The control room is there when you want the details.',
    "{name} stole the show tonight. Say hello, it's been waiting.",
  ],
  noWinner: [
    "Nobody passed tonight. That's a real result about these models on this computer, not a broken show.",
  ],
  trojan: [
    'You tested Ajax, the agent model made for Odysseus. Ladies and gentlemen, a true Trojan hero!',
  ],
  stopped: [
    // This screen only shows when no model finished: there are no scores to keep.
    "Show's stopped. No harm done, and your lineup is still picked.",
    "We'll call it there. Come back any time; the stage stays set.",
  ],
} as const;

export type HostSituation = keyof typeof HOST_LINES;

/**
 * One line for a situation. `turn` picks among the variants so the host does
 * not repeat himself; a missing variable leaves the line without it rather
 * than printing the brace.
 */
export function hostLine(situation: HostSituation, vars: Record<string, string | number | undefined> = {}, turn = 0): string {
  const lines = HOST_LINES[situation];
  const line = lines[Math.abs(Math.trunc(turn)) % lines.length];
  return line.replace(/\{(\w+)\}/g, (_, key: string) => (vars[key] != null && vars[key] !== '' ? String(vars[key]) : ''));
}
