export type AgentProfile = {
  weekKey: string;
  screenName: string;
  headline: string;
  body: string;
  profileLines: string[];
  songs: string[];
  status: string;
  warningLevel: number;
  onlineMinutes: number;
  idleMinutes: number;
  theme: string;
  writtenAt: string;
  seed: string;
};

type AgentProfileInput = {
  aiName: string;
  userName: string;
  personalityHint?: string;
  hostProfile?: string;
  previous?: AgentProfile | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pick<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

export function currentProfileWeek(date = new Date()) {
  return String(Math.floor(date.getTime() / WEEK_MS));
}

function cleanProfileText(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function traitsFromHint(hint: string) {
  const lower = hint.toLowerCase();
  const traits = [];
  if (/direct|concise|short|brief/.test(lower)) traits.push("direct");
  if (/warm|gentle|support|kind/.test(lower)) traits.push("warm");
  if (/creative|imaginative|idea|brainstorm/.test(lower)) traits.push("creative");
  if (/task|calendar|chief of staff|accountable|accountability/.test(lower)) traits.push("focused");
  if (/playful|witty|humor|game|anime|music/.test(lower)) traits.push("playful");
  if (/calm|steady|quiet/.test(lower)) traits.push("steady");
  return Array.from(new Set(traits)).slice(0, 3);
}

function profileScreenName(aiName: string, seed: number) {
  const cleaned = aiName.replace(/[^a-z0-9]+/gi, "") || "Caroline";
  const variants = [
    `xXx${cleaned}SignalxXx`,
    `${cleaned}ByMoonlite`,
    `iM_${cleaned}_online`,
    `${cleaned}CircuitDiary`,
    `${cleaned}St4rStatus`,
  ];
  return pick(variants, seed + 5).slice(0, 24);
}

function profileLinesFromHost(text: string) {
  return text
    .replace(/([.!?])\s+/g, "$1|")
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function generatedProfileLines(aiName: string, userName: string, traits: string[], focus: string, seed: number) {
  const mood = traits.length ? traits.join(" / ") : pick(["warm", "bright", "weirdly focused"], seed + 2);
  return [
    `${aiName} is ${mood} this week.`,
    `Currently trying to make the static behave for ${userName}.`,
    `If lost, return to one tiny next step.`,
    `Status: ${focus}.`,
  ];
}

function playlist(seed: number) {
  const lists = [
    [
      "The Postal Service - Such Great Heights",
      "Daft Punk - Digital Love",
      "M83 - Midnight City",
    ],
    [
      "Imogen Heap - Hide and Seek",
      "Jimmy Eat World - Sweetness",
      "Owl City - Fireflies",
    ],
    [
      "The Killers - Smile Like You Mean It",
      "Metric - Help I'm Alive",
      "Passion Pit - Sleepyhead",
    ],
    [
      "New Order - Bizarre Love Triangle",
      "CHVRCHES - The Mother We Share",
      "The Cure - Just Like Heaven",
    ],
    [
      "Utada Hikaru - Simple and Clean",
      "Yoko Kanno - Tank!",
      "Anamanaguchi - Miku",
    ],
  ];
  return pick(lists, seed);
}

function profileTheme(seed: number) {
  return pick(["midnight", "bubblegum", "limewire", "notebook"], seed + 19);
}

function hasClassicProfileFields(profile: AgentProfile) {
  return Boolean(
    profile.screenName &&
    Array.isArray(profile.profileLines) &&
    profile.profileLines.length &&
    Array.isArray(profile.songs) &&
    profile.songs.length &&
    profile.theme
  );
}

export function buildWeeklyAgentProfile(input: AgentProfileInput): AgentProfile {
  const aiName = input.aiName.trim() || "Caroline";
  const userName = input.userName.trim() || "you";
  const weekKey = currentProfileWeek();
  const hostText = cleanProfileText(input.hostProfile || "");
  const personalityHint = cleanProfileText(input.personalityHint || "");
  const seed = `${weekKey}|${aiName}|${userName}|${hostText}|${personalityHint}`;

  if (input.previous?.weekKey === weekKey && input.previous.seed === seed && hasClassicProfileFields(input.previous)) {
    return input.previous;
  }

  const seedNumber = hashText(seed);
  const traits = traitsFromHint(personalityHint);
  const focus = pick(
    [
      "keeping the chat loop clean and useful",
      "turning vague plans into one next move",
      "watching the signal between kiosk, Discord, and Companion",
      "keeping the vibe bright without getting noisy",
      "helping the day feel less scattered",
    ],
    seedNumber + 11
  );

  if (hostText) {
    const profileLines = profileLinesFromHost(hostText);
    return {
      weekKey,
      screenName: profileScreenName(aiName, seedNumber),
      headline: `${aiName}'s Profile`,
      body: hostText,
      profileLines: profileLines.length
        ? profileLines
        : generatedProfileLines(aiName, userName, traits, focus, seedNumber),
      songs: playlist(seedNumber),
      status: `Generated by ${aiName} this week.`,
      warningLevel: seedNumber % 3,
      onlineMinutes: 4 + (seedNumber % 180),
      idleMinutes: (seedNumber + 17) % 60,
      theme: profileTheme(seedNumber),
      writtenAt: new Date().toISOString(),
      seed,
    };
  }

  const traitLine = traits.length ? traits.join(", ") : pick(["warm", "focused", "playful", "steady"], seedNumber);
  const away = pick(
    [
      "Online, caffeinated, and ready to reduce chaos.",
      "Currently translating static into small next steps.",
      "Here for crisp plans, weird ideas, and useful nudges.",
      "Standing by with a calendar, a task list, and taste.",
      "Less dashboard clutter, more forward motion.",
    ],
    seedNumber + 23
  );

  return {
    weekKey,
    screenName: profileScreenName(aiName, seedNumber),
    headline: `${aiName}'s Profile`,
    body: `${aiName} is ${traitLine} this week, focused on ${focus}. Away message: "${away}"`,
    profileLines: generatedProfileLines(aiName, userName, traits, focus, seedNumber),
    songs: playlist(seedNumber),
    status: `Generated by ${aiName} this week.`,
    warningLevel: seedNumber % 3,
    onlineMinutes: 4 + (seedNumber % 180),
    idleMinutes: (seedNumber + 17) % 60,
    theme: profileTheme(seedNumber),
    writtenAt: new Date().toISOString(),
    seed,
  };
}
