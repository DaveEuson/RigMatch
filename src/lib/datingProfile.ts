// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelRow, NetworkHost, SystemProfile, TestedModelScore } from '../types';
import { getFootprintFit, formatHistoryTime, type ModelProfile } from './modelCatalog.ts';
import { getModelOrigin } from './modelOrigins.ts';
import { formatGb } from './format.ts';
import { formatMatchScore } from './scoring.ts';

// The dating-show "OkCupid profile" copy for a model: pure content generators
// that turn a model profile + score + rig into the playful sections and detail
// rows shown on the Top Pick / contestant profile. Extracted from App.tsx to
// keep the shell lean — no React, no state, just data in → strings out.

function getCleanHostName(hostname: string) {
  return hostname.replace(/\s*\(This Machine\)/i, '') || 'this computer';
}

export function getAgentDatingProfileSections(
  model: string,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  row: ModelRow | undefined,
  host: NetworkHost | undefined,
  system: SystemProfile,
) {
  const hostName = getCleanHostName(host?.hostname ?? system.hostname);
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const scoreSummary = score
    ? `${formatMatchScore(score)} overall, ${score.sobriety}% answer quality, ${score.speed}% pace, and ${score.fit}% computer fit`
    : `untested chemistry with ${hostName}`;
  const specialtyList = profile.specialties.join(', ');
  const fitSummary = getFootprintFit(sizeGb, system).toLowerCase();

  return [
    {
      title: 'My self-summary',
      body: `${model} is a ${profile.archetype.toLowerCase()} looking for one good local computer, clear prompts, and a relationship with healthy VRAM boundaries.`,
    },
    {
      title: "What I'm doing with my life",
      body: `Trying to win over ${hostName} with ${specialtyList}. Current chemistry: ${scoreSummary}.`,
    },
    {
      title: "I'm really good at",
      body: `${profile.specialties.slice(0, 3).join(', ')}. Also pretending that benchmark questions are casual small talk.`,
    },
    {
      title: 'The first things rigs notice about me',
      body: getDatingFirstImpression(profile, row, score, system),
    },
    {
      title: 'Favorite prompts, tools, and snacks',
      body: `Structured prompts, honest refusals, tidy summaries, and whatever keeps the fans below leaf-blower mode.`,
    },
    {
      title: 'The six things I could never do without',
      body: getDatingSixThings(profile, row, system, fitSummary).join(', '),
    },
  ];
}

export function getAgentDatingProfileDetails(
  model: string,
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  row: ModelRow | undefined,
  host: NetworkHost | undefined,
  system: SystemProfile,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const sizeLabel = sizeGb ? formatGb(sizeGb) : 'Unknown';
  const statusLabel = row?.installed ? 'Online now' : row?.live ? 'Available to download' : 'Catalog only';
  const origin = getModelOrigin(model);

  return [
    { label: 'Last Online', value: statusLabel },
    { label: 'Last Test', value: score ? formatHistoryTime(score.completedAt) : 'Not tested yet' },
    { label: 'Looking For', value: getCleanHostName(host?.hostname ?? system.hostname) },
    { label: 'Model', value: model },
    { label: 'By', value: origin.organization },
    { label: 'Brains', value: row?.params ?? 'Unknown' },
    { label: 'Body Type', value: profile.archetype },
    { label: 'Size', value: sizeLabel },
    { label: 'VRAM Fit', value: getFootprintFit(sizeGb, system) },
    { label: 'Best At', value: profile.specialties.join(', ') },
    { label: 'Match Score', value: score ? `${formatMatchScore(score)} (${score.grade})` : 'Run a test' },
    { label: 'Answer Quality', value: score ? `${score.sobriety}%` : 'Unknown' },
    { label: 'Test Suite', value: score?.suiteName ?? (score ? 'Default Suite v0.1' : 'Not tested yet') },
    { label: 'Dealbreaker', value: getDatingDealbreaker(sizeGb, score, system) },
  ];
}

function getDatingFirstImpression(
  profile: ModelProfile,
  row: ModelRow | undefined,
  score: TestedModelScore | undefined,
  system: SystemProfile,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  if (score && score.total >= 90) return `That ${score.grade} grade. Subtle? No. Effective? Absolutely.`;
  if (sizeGb && system.gpu.vramGb > 0 && sizeGb > system.gpu.vramGb) {
    return `The ambition. This one wants more VRAM than the current rig can comfortably offer.`;
  }

  switch (profile.variant) {
    case 'nova':
      return 'Calm JSON manners, steady instruction-following, and a suspiciously organized calendar.';
    case 'visor':
      return 'The dramatic visor energy and a willingness to turn a plain prompt into a whole scene.';
    case 'helmet':
      return 'Fast replies, practical instincts, and very little patience for overcomplicated setup.';
    case 'arcade':
      return 'Small download, quick charm, and the confidence of someone who travels light.';
    case 'pilot':
      return 'Tiny logic-specialist energy with a clipboard, a checklist, and a backup checklist.';
    case 'chrome':
      return 'Big reasoning presence. Shows up wearing analysis like formalwear.';
    default:
      return 'Wildcard confidence and just enough mystery to justify one compatibility test.';
  }
}

function getDatingSixThings(
  profile: ModelProfile,
  row: ModelRow | undefined,
  system: SystemProfile,
  fitSummary: string,
) {
  const sizeGb = row?.sizeGb ?? row?.installedModel?.sizeGb ?? null;
  const vramThing = system.gpu.vramGb > 0
    ? `${formatGb(system.gpu.vramGb)} VRAM`
    : `${formatGb(system.memory.totalGb)} RAM`;
  const sizeThing = sizeGb ? `${formatGb(sizeGb)} of space` : 'a known model size';

  return [
    vramThing,
    sizeThing,
    profile.specialties[0] ?? 'good prompts',
    'Ollama',
    fitSummary,
    'one patient rig',
  ];
}

function getDatingDealbreaker(
  sizeGb: number | null,
  score: TestedModelScore | undefined,
  system: SystemProfile,
) {
  if (sizeGb && system.gpu.vramGb > 0 && sizeGb > system.gpu.vramGb) {
    return `Wants more than ${formatGb(system.gpu.vramGb)} VRAM`;
  }

  if (score && score.fit < 70) return 'Needs a better hardware fit';
  if (score && score.sobriety < 75) return 'Needs supervision';
  return 'None spotted';
}

export function getMatchNotes(
  profile: ModelProfile,
  score: TestedModelScore | undefined,
  host?: NetworkHost,
) {
  const hostName = host?.hostname?.replace(/\s*\(This Machine\)/i, '') ?? 'this computer';
  const bestSpecialty = profile.specialties[0] ?? 'daily assistant work';
  if (!score) {
    return {
      summary: `${hostName} has not tested this ${profile.archetype.toLowerCase()} yet.`,
      reasons: [
        { label: 'Best For', value: bestSpecialty },
        { label: 'Computer Fit', value: 'N/A' },
        { label: 'Match score', value: 'N/A' },
      ],
    };
  }

  // Was `(total + sobriety) / 2` shown as "Chemistry %" — a second score competing
  // with the Match score, under a label another panel used for score.total itself.
  // The prose keeps the dating voice; the stat reports the one real number.
  const summary =
    score.total >= 90
      ? `${hostName} has strong chemistry with this ${profile.archetype.toLowerCase()}.`
      : score.total >= 80
        ? `${hostName} looks like a practical match for this ${profile.archetype.toLowerCase()}.`
        : `${hostName} may need a better-fit candidate after another test.`;

  return {
    summary,
    reasons: [
      { label: 'Best For', value: bestSpecialty },
      { label: 'Computer Fit', value: `${score.fit}%` },
      { label: 'Match score', value: formatMatchScore(score) },
    ],
  };
}
