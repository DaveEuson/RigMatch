// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What the person is testing: the channel Advanced Mode is tuned to.
 *
 * Advanced Mode showed every kind of test at once and framed all of it around
 * chat, so racing video makers meant scrolling past a question-round console
 * and an App Builder to find them. A channel scopes the screens to one use —
 * which models are listed, which lab runs, which result crowns a winner — and
 * All keeps the everything-view one click away.
 *
 * Built on the goal taxonomy rather than beside it (goals.ts): every goal lives
 * in exactly one channel, and channels are named for the kind of test RigMatch
 * can actually run, so goals graded by the same test share a channel.
 */

import type { GoalId } from './goals.ts';
import type { ModelTaskFilterId } from './modelCatalog.ts';

export type WorkbenchId = 'all' | 'chat' | 'code' | 'images' | 'video' | 'listening' | 'reading';
/** A channel with a fader of its own. All ranks the way chat does. */
export type ChannelId = Exclude<WorkbenchId, 'all'>;
export type LabCardId = 'app-builder' | 'image' | 'listening' | 'video';

export type Workbench = {
  id: WorkbenchId;
  label: string;
  /** What winning here is called: "Best for making video". */
  matchLabel: string;
  /** The same, short enough for the winner card in the top deck: "Best video maker". */
  shortLabel: string;
  goals: GoalId[];
  /** The Models screen filter the channel opens with; null lists everything. */
  taskFilter: ModelTaskFilterId | null;
  /** The Lab cards Activity shows for the channel. */
  labCards: LabCardId[];
  /** What accuracy measures here, in words someone can check. */
  accuracyMeans: string;
  /** Where the channel's test starts: the Lab in Activity, or a comparison. */
  home: 'activity' | 'speedDate';
  /** Said when nothing has been crowned yet. */
  emptyHint: string;
  startLabel: string;
  /** Said in the Lab in place of cards, for a channel tested somewhere else. */
  labNote?: string;
};

export const WORKBENCHES: Workbench[] = [
  {
    id: 'all',
    label: 'All',
    matchLabel: 'Best Match',
    shortLabel: 'Best Match',
    // Making audio has no channel of its own until something can grade it.
    goals: ['make-audio'],
    taskFilter: null,
    labCards: ['app-builder', 'image', 'listening', 'video'],
    accuracyMeans: 'how good the answers are',
    home: 'speedDate',
    emptyHint: 'Test a model to crown the winner.',
    startLabel: 'Open Comparison',
  },
  {
    id: 'chat',
    label: 'Chat and writing',
    matchLabel: 'Best for chat and writing',
    shortLabel: 'Best for chat',
    goals: ['talk', 'write', 'use-tools', 'ask-documents'],
    taskFilter: 'assistant',
    labCards: [],
    accuracyMeans: 'how good the answers are',
    home: 'speedDate',
    emptyHint: 'Run a comparison to crown one.',
    startLabel: 'Open Comparison',
    labNote: 'Chat and writing is tested with questions, not a Lab card. Pick contestants in Comparison and run the show: every answer is timed and marked.',
  },
  {
    id: 'code',
    label: 'Code',
    matchLabel: 'Best for coding',
    shortLabel: 'Best for code',
    goals: ['code'],
    taskFilter: 'coding',
    labCards: ['app-builder'],
    accuracyMeans: 'how good the coding answers are',
    home: 'speedDate',
    emptyHint: 'A comparison with at least three coding questions crowns one.',
    startLabel: 'Open Comparison',
  },
  {
    id: 'images',
    label: 'Images',
    matchLabel: 'Best for making images',
    shortLabel: 'Best image maker',
    goals: ['make-images'],
    taskFilter: 'imagegen',
    labCards: ['image'],
    accuracyMeans: 'how well the picture matches the prompt',
    home: 'activity',
    emptyHint: 'Run the Image test to crown one.',
    startLabel: 'Open the Image test',
  },
  {
    id: 'video',
    label: 'Video',
    matchLabel: 'Best for making video',
    shortLabel: 'Best video maker',
    goals: ['make-video', 'animate-image'],
    taskFilter: 'videogen',
    labCards: ['video'],
    accuracyMeans: 'how well the middle frame matches the prompt; motion is not judged',
    home: 'activity',
    emptyHint: 'Race video models to crown one.',
    startLabel: 'Open the Video Lineup',
  },
  {
    id: 'listening',
    label: 'Listening',
    matchLabel: 'Best for transcription',
    shortLabel: 'Best listener',
    goals: ['transcribe-file', 'transcribe-live'],
    taskFilter: 'hears',
    labCards: ['listening'],
    accuracyMeans: 'how many words it transcribed correctly',
    home: 'activity',
    emptyHint: 'Run the Listening test to crown one.',
    startLabel: 'Open the Listening test',
  },
  {
    id: 'reading',
    label: 'Reading pictures',
    matchLabel: 'Best for reading images',
    shortLabel: 'Best picture reader',
    goals: ['describe-image'],
    taskFilter: 'vision',
    labCards: [],
    accuracyMeans: 'how well it describes the test picture',
    home: 'speedDate',
    emptyHint: 'A comparison with the picture-reading test crowns one.',
    startLabel: 'Open Comparison',
    labNote: 'Reading pictures runs from the Run dialog: put a model that can see in Comparison, tick “Recognize an image”, and it describes a test picture.',
  },
];

export const WORKBENCH_IDS = WORKBENCHES.map((workbench) => workbench.id);
export const CHANNEL_IDS = WORKBENCH_IDS.filter((id): id is ChannelId => id !== 'all');

export const WORKBENCH_STORAGE_KEY = 'rigmatch:workbench:v1';

export function workbenchById(id: WorkbenchId): Workbench {
  return WORKBENCHES.find((workbench) => workbench.id === id) ?? WORKBENCHES[0];
}

/** The channel a first-run goal opens on. */
export function workbenchForGoal(goalId: string | undefined): WorkbenchId {
  return WORKBENCHES.find((workbench) => workbench.id !== 'all' && (workbench.goals as string[]).includes(goalId ?? ''))?.id ?? 'all';
}

/**
 * The channel someone picked, if they ever picked one.
 *
 * Null until then, so the channel keeps following the first-run goal: a goal
 * chosen after the app opened would otherwise leave it on All until a restart.
 */
export function readWorkbench(raw: string | null | undefined): WorkbenchId | null {
  return raw && (WORKBENCH_IDS as string[]).includes(raw) ? raw as WorkbenchId : null;
}

/** Whose fader a channel reads. All ranks the way chat does, since its winner is the chat Top Match. */
export function balanceChannel(id: WorkbenchId): ChannelId {
  return id === 'all' ? 'chat' : id;
}
