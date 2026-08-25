#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The pre-release sweep.
 *
 * Written after a release where the serious bugs all shared one property:
 * every single one lived in a STATE nobody had been in, and none of them were
 * wrong logic. Unit tests, TypeScript and ESLint all passed while a download
 * silently queued forever, the main process quietly rewrote a question type,
 * and every upgrading user was about to lose the headline feature.
 *
 * So this checks the things those tools structurally cannot:
 *
 *   states     — the starting conditions a real machine arrives in
 *   parity     — code that exists twice and has to agree
 *   claims     — numbers and URLs asserted in source, checked against reality
 *   surface    — actions offered where their preconditions are not met
 *   security   — the Electron posture that must not regress
 *
 * Usage:  node scripts/release-sweep.mjs [--net]
 *         --net also checks catalogue URLs and sizes against the servers.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readRendererSource } from './renderer-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withNet = process.argv.includes('--net');
const results = [];

const check = (area, name, fn) => {
  try {
    const note = fn();
    results.push({ area, name, ok: true, note: note || '' });
  } catch (error) {
    results.push({ area, name, ok: false, note: error.message });
  }
};
const read = (rel) => readFileSync(join(root, rel), 'utf-8');
const must = (cond, message) => { if (!cond) throw new Error(message); };

/** Every renderer source concatenated, so guards survive a file move. */
const readRenderer = () => readRendererSource(join(root, 'src'));


// ── states ──────────────────────────────────────────────────────────────────
// The upgrade path is the one starting state guaranteed to exist in the wild.

check('states', 'the upgrade path is covered by tests', () => {
  must(existsSync(join(root, 'tests/upgradePath.test.mjs')),
    'tests/upgradePath.test.mjs is missing — the state every existing user arrives in');
  const body = read('tests/upgradePath.test.mjs');
  must(/goals-only/.test(body), 'the upgrade test no longer checks that upgraders are asked the new question');
  return 'present';
});

check('states', 'a new first-run question cannot skip existing users', () => {
  // The bug this encodes: the goals splash was gated on "has a mode been
  // chosen?", which every upgrading user had already answered.
  const body = read('src/lib/goalSettings.ts');
  must(/firstRunStep/.test(body), 'firstRunStep is gone — the upgrade gate is back to a single flag');
  must(/goalsOffered/.test(body), 'asked-and-declined is no longer distinguished from never-asked');
  return 'gate is state-aware';
});

// ── parity ──────────────────────────────────────────────────────────────────
// Anything maintained in two places drifts, silently, and passes every test.

check('parity', 'the TS and CJS question suites agree', () => {
  must(existsSync(join(root, 'tests/benchmarkSuiteParity.test.mjs')),
    'the parity guard is missing; the main process can silently rewrite question types again');
  const ts = read('src/benchmarkSuite.ts');
  const cjs = read('electron/benchmarkSuite.cjs');
  const types = [...ts.matchAll(/value === '(\w+)'/g)].map((m) => m[1]).sort();
  const cjsTypes = [...cjs.matchAll(/value === '(\w+)'/g)].map((m) => m[1]).sort();
  must(JSON.stringify(types) === JSON.stringify(cjsTypes),
    `question types differ: TS has ${types.join(',')}, CJS has ${cjsTypes.join(',')}`);
  return `${types.length} types, matched`;
});

check('parity', 'the companion binary is newer than its source', () => {
  // A Tauri build is slow, so it is the step that gets skipped — and nothing
  // about a stale companion looks wrong. It launches, it connects, it just
  // silently lacks whatever was added since. That shipped once today: the
  // capability panel was written, committed and described to the user while
  // the binary next to it predated the source by nine minutes, and the user
  // reasonably reported the feature missing.
  const exe = join(root, 'companions/rigmatch-chat.exe');
  if (!existsSync(exe)) return 'no companion binary to check';

  const newest = (dir) => {
    let latest = 0;
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') continue;
        const full = join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else latest = Math.max(latest, statSync(full).mtimeMs);
      }
    };
    if (existsSync(dir)) walk(dir);
    return latest;
  };

  const sourceTime = Math.max(
    newest(join(root, 'rigmatch-chat/src')),
    newest(join(root, 'rigmatch-chat/src-tauri/src')),
    existsSync(join(root, 'rigmatch-chat/src-tauri/tauri.conf.json'))
      ? statSync(join(root, 'rigmatch-chat/src-tauri/tauri.conf.json')).mtimeMs
      : 0,
  );
  const builtTime = statSync(exe).mtimeMs;
  const behindMin = Math.round((sourceTime - builtTime) / 60000);
  must(builtTime >= sourceTime,
    `companions/rigmatch-chat.exe is ${behindMin} minute(s) older than its source — run \`cd rigmatch-chat && npx tauri build\` and copy the result, or the release ships a companion missing whatever changed`);

  // And the copy that actually runs.
  //
  // RigMatch launches the companion from its own install root, so an unpacked
  // build carries its own copy — and that one goes stale on its own schedule.
  // Checking only the source-tree binary missed this twice in one afternoon:
  // the feature was built, committed and described while the running companion
  // was hours behind, and the second time the copy had been blocked by a file
  // lock and the failure looked identical to the first.
  const packaged = join(root, 'release/win-unpacked/companions/rigmatch-chat.exe');
  if (existsSync(packaged)) {
    const packagedTime = statSync(packaged).mtimeMs;
    const gapMin = Math.round((builtTime - packagedTime) / 60000);
    must(packagedTime >= builtTime,
      `release/win-unpacked/companions/rigmatch-chat.exe is ${gapMin} minute(s) behind companions/ — that is the copy RigMatch launches, so testing it proves nothing about the current build. Close RigMatch Chat (it locks the file) and copy it across`);
    return 'source-tree and packaged copies both current';
  }

  return 'built after its source';
});

check('parity', 'the unpacked build is not older than the app it came from', () => {
  // The companion is only half of it. release/win-unpacked also carries its own
  // app.asar, and a stale one is worse than a stale companion because it fails
  // *quietly and wrongly*: the companion asked whether a picture could be made,
  // an old RigMatch had no answer to give, and the panel reported "Not ready"
  // over a working ComfyUI with SDXL Turbo loaded. A confident false statement,
  // produced by two correct programs of different ages.
  const asar = join(root, 'release/win-unpacked/resources/app.asar');
  if (!existsSync(asar)) return 'no unpacked build to check';

  const builtTime = statSync(asar).mtimeMs;
  const rendererTime = existsSync(join(root, 'dist'))
    ? Math.max(...readdirSync(join(root, 'dist/assets'))
      .map((f) => statSync(join(root, 'dist/assets', f)).mtimeMs))
    : 0;
  const mainTime = statSync(join(root, 'electron/main.cjs')).mtimeMs;
  const newest = Math.max(rendererTime, mainTime);
  const behindMin = Math.round((newest - builtTime) / 60000);

  must(builtTime >= newest,
    `release/win-unpacked is ${behindMin} minute(s) behind dist/ or electron/main.cjs — testing it exercises an old app, and anything the companion asks it will be answered by that old app. Rebuild with \`npx electron-builder --dir\``);
  return 'unpacked build is current';
});

check('parity', 'the version is one number everywhere', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const app = read('src/lib/appConfig.ts').match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  must(pkg === app, `package.json is ${pkg} but APP_VERSION is ${app}`);
  must(read('src/data/releaseNotes.ts').includes(`version: '${pkg}'`),
    `no release notes entry for ${pkg} — users meet the changes with no explanation`);
  return pkg;
});

// ── claims ──────────────────────────────────────────────────────────────────
// Numbers written by hand and never checked. Four of six were wrong once.

check('claims', 'no literal backspace where a word boundary was meant', () => {
  // `\b` inside a shell heredoc or a template literal becomes 0x08, and the
  // regex then silently matches nothing. This has happened three times.
  for (const rel of ['src/lib/modelCatalog.ts', 'src/lib/goals.ts', 'electron/benchmarkScoring.cjs']) {
    must(!read(rel).includes(''), `${rel} contains a literal backspace byte`);
  }
  return 'clean';
});

check('claims', 'declared model sizes are exact, not rounded', () => {
  // comfyModels deletes a download that falls short of the declared size, so a
  // number rounded UP destroys a good file whenever content-length is absent.
  const catalogue = read('src/lib/generationCatalog.ts');
  const sizes = [...catalogue.matchAll(/bytes:\s*(\d+),/g)].map((m) => Number(m[1]));
  must(sizes.length > 0, 'no model sizes found');
  const rounded = sizes.filter((n) => n % 100000 === 0);
  must(rounded.length === 0,
    `${rounded.join(', ')} look rounded rather than measured — run scripts/check-model-sizes.mjs`);
  return `${sizes.length} sizes, none rounded`;
});

// ── surface ─────────────────────────────────────────────────────────────────
// Actions offered where they cannot work: the shape of this release's worst bug.

check('surface', 'a refused download reports itself', () => {
  // The whole renderer, not App.tsx alone. This failed when ModelCabinet moved
  // into its own file — the behaviour was intact and only the address was
  // stale, which is a false alarm a release gate cannot afford to raise.
  const body = readRenderer();
  must(/const refuse = /.test(body),
    'downloadGenerationModel no longer marks refusals, so they render as "Queued" forever');
  must(/!comfyFolderSet \? \(/.test(body),
    'the Download button is offered again without a ComfyUI folder to download into');
  return 'refusals are visible';
});

check('surface', 'the winner board ranks by the score it prints', () => {
  // Shipped once as "3. 87.5 / 4. 87.6": the board sorted on the rounded
  // integer while printing the one-decimal value, so the ranked list
  // contradicted its own figures.
  const body = readRenderer();
  const board = body.match(/const wizardLineupResults = useMemo\(([\s\S]{0,1200}?)\n {2}\);/)?.[1];
  must(board, 'wizardLineupResults is gone — the Winner screen announces one model out of five again');
  must(/compareTestedModelScores/.test(board),
    'the lineup board no longer sorts with the app comparator, so its order can disagree with its numbers');
  return 'ranks by comparator';
});

check('surface', 'cleanup only targets what it can delete', () => {
  const body = read('src/lib/modelCleanup.ts');
  must(/lm-studio/.test(body) && /comfyui/.test(body),
    'deletableRows no longer excludes models Ollama cannot delete');
  return 'scoped to Ollama';
});

check('parity', 'audio is sent to the endpoint that understands it', () => {
  // Two bugs in one day, in two places, from the same cause: Ollama's
  // /api/generate accepts an `images` array and answers 200 for audio while
  // understanding none of it. The listening test reported models scoring zero
  // for hearing nothing; chat returned an empty reply while the app advertised
  // that you could send a recording. Nothing errored in either case.
  //
  // Both senders now route through /api/chat. This is here because the failure
  // is invisible at runtime — the wrong endpoint looks exactly like a working
  // one until a human reads the answer.
  const main = read('electron/main.cjs');
  must(/data:audio\//.test(main),
    'sendChat no longer detects audio attachments, so recordings go back to /api/generate');
  must(/\$\{baseUrl\}\/api\/chat/.test(main),
    'nothing posts to /api/chat any more — audio cannot work through /api/generate');

  const listening = read('src/lib/labChallenges.ts');
  must(/chat: true/.test(listening),
    'the listening test stopped asking for the chat endpoint, which is the only one that hears audio');
  must(/think: false/.test(listening),
    'thinking is back on for transcription — Gemma 4 spends the whole budget reasoning and answers nothing');
  return 'both audio senders use /api/chat';
});

check('surface', 'the chat dock streams and can be stopped', () => {
  // Both are invisible when they break. A dock that stopped streaming would
  // still answer — just all at once, after a silence long enough to read as a
  // hung app — and a Stop that stopped being wired would still render, and do
  // nothing. Neither fails a test that only checks the final text.
  const main = read('electron/main.cjs');
  must(/sendChat\(request, event\.sender\)/.test(main),
    'chat:send no longer passes the sender, so there is nowhere to stream tokens to');
  must(/if \(wantStream\) \{\s*const streamed = await streamAdvancedGenerate/.test(main),
    'sendChat stopped streaming — replies go back to arriving in one piece after a long silence');

  const hook = read('src/hooks/useChat.ts');
  must(/onAdvancedGenerateProgress/.test(hook),
    'the dock stopped listening for tokens, so a streamed reply would never render');
  must(/abortAdvancedGenerate/.test(hook),
    'Stop is no longer wired to the abort, so the button would do nothing');
  return 'streamed, and interruptible';
});

check('surface', 'each platform ships only the companion it can run', () => {
  // companions/rigmatch-chat.exe is tracked in git, and the CI Linux and macOS
  // jobs build their own companion into the same directory. A single top-level
  // extraFiles copied whatever was there, so the Jetson's .deb arrived carrying
  // a Windows .exe it can never execute — found by listing /opt/RigMatch on the
  // real machine, not by reading the config.
  //
  // Harmless, since the Linux branch of the launcher never looks for a .exe, but
  // it is 15 MB in every non-Windows download.
  const build = JSON.parse(read('package.json')).build;
  must(!build.extraFiles,
    'a top-level extraFiles is back — it copies companions/ wholesale, so every platform ships every companion');

  const expected = { win: 'rigmatch-chat.exe', mac: 'rigmatch-chat', linux: 'rigmatch-chat' };
  for (const [platform, binary] of Object.entries(expected)) {
    const sets = build[platform]?.extraFiles;
    must(Array.isArray(sets) && sets.length > 0,
      `build.${platform}.extraFiles is missing — that platform would ship no companion at all, and the sidebar button would find nothing`);
    const companions = sets.find((set) => set.from === 'companions');
    must(companions, `build.${platform}.extraFiles no longer copies the companion`);
    must(Array.isArray(companions.filter) && companions.filter.includes(binary),
      `build.${platform} does not filter down to ${binary} — it will ship the other platforms' companions too`);
  }
  return 'win/mac/linux each filtered to their own binary';
});

check('parity', 'both chat windows tell the truth about what a model cannot do', () => {
  // The guard shipped in the main app and not in the companion, which is the
  // window people actually talk in. Asked to draw a dog there, a text model
  // wrote two hundred words describing one and nothing warned that was coming —
  // the release's own headline feature, missing from its most-used surface.
  //
  // The classifier now exists in both and must agree; the wording deliberately
  // differs, because each window can point at different things.
  const appGuard = read('src/lib/chatCapabilityGuard.ts');
  const chatGuard = read('rigmatch-chat/src/lib/chatCapabilityGuard.ts');
  must(/export function classifyChatRequest/.test(appGuard),
    'the main app lost its capability guard');
  must(/export function classifyChatRequest/.test(chatGuard),
    'the companion lost its capability guard — chat goes back to passing on whatever the model claims');
  must(existsSync(join(root, 'tests/chatGuardParity.test.mjs')),
    'the parity test is gone, so the two copies can drift without anyone noticing');

  const wired = read('rigmatch-chat/src/App.tsx');
  must(/classifyChatRequest\(/.test(wired),
    'the companion has the guard but no longer calls it');
  must(/fromRigMatch/.test(read('rigmatch-chat/src/lib/compaction.ts')),
    "RigMatch's own notes are being fed back to the model as context again");
  return 'both windows guarded, classifier held in parity';
});

// ── security ────────────────────────────────────────────────────────────────
// Cheap to check, catastrophic to regress.

check('security', 'the renderer stays sandboxed', () => {
  const main = read('electron/main.cjs');
  must(/contextIsolation:\s*true/.test(main), 'contextIsolation is off');
  must(/nodeIntegration:\s*false/.test(main), 'nodeIntegration is on');
  must(/sandbox:\s*true/.test(main), 'the renderer sandbox is off');
  const noSandbox = main.match(/.*appendSwitch\('no-sandbox'\).*/)?.[0] ?? '';
  const gated = /isDev\(\)/.test(main.slice(Math.max(0, main.indexOf(noSandbox) - 200), main.indexOf(noSandbox)));
  must(!noSandbox || gated, 'no-sandbox is applied outside a dev-only branch');
  return 'isolated, sandboxed';
});

check('security', 'every IPC handler checks its sender', () => {
  const main = read('electron/main.cjs');
  must(/function handleLogged[\s\S]{0,200}assertTrustedIpcSender/.test(main),
    'handleLogged no longer validates the sender, so most IPC is unguarded');
  const bare = [...main.matchAll(/^\s*ipcMain\.handle\(/gm)].length;
  const guarded = [...main.matchAll(/assertTrustedIpcSender/g)].length;
  must(guarded >= bare, `${bare} bare ipcMain.handle calls but only ${guarded} sender checks`);
  return `${guarded} checks`;
});

check('security', 'downloads stay on https and a known host', () => {
  const body = read('electron/comfyModels.cjs');
  must(/protocol !== 'https:'/.test(body), 'model downloads no longer require https');
  must(/huggingface\.co/.test(body), 'the download host allowlist is gone');
  must(/assertSafeFilename/.test(body), 'the path-traversal guard on filenames is gone');
  return 'https + allowlist + safe names';
});

check('security', 'the renderer cannot ask for any permission it likes', () => {
  // Electron grants every permission request unless a handler refuses, which
  // sat oddly beside the sandbox, the CSP and the host allowlists. RigMatch
  // needs the microphone for the listening test and nothing else.
  const main = read('electron/main.cjs');
  must(/setPermissionRequestHandler/.test(main), 'no permission request handler: camera, geolocation and the rest are granted by default');
  must(/setPermissionCheckHandler/.test(main), 'no permission check handler: a denied permission still queries as granted');
  const allowed = main.match(/ALLOWED_PERMISSIONS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
  const names = [...allowed.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  must(names.length > 0, 'the permission allowlist is empty or gone');
  const unexpected = names.filter((name) => !['media', 'audioCapture'].includes(name));
  must(unexpected.length === 0, `unexpected permission(s) allowed: ${unexpected.join(', ')}`);
  return names.join(' + ');
});

check('security', 'the local scores bridge stays on loopback', () => {
  must(/listen\([^,]+,\s*'127\.0\.0\.1'/.test(read('electron/main.cjs')),
    'the scores server is no longer bound to 127.0.0.1 — it would be reachable from the network');
  return 'loopback only';
});

check('security', 'the bridge only takes orders from the companion', () => {
  // This server was read-only until image generation went through it. A GET
  // that leaks scores to a stray browser tab is bad; a POST that starts a
  // multi-minute GPU job on someone's machine is worse, and the origin
  // allowlist is the whole boundary now.
  const main = read('electron/main.cjs');
  must(/BRIDGE_ALLOWED_ORIGINS/.test(main), 'the bridge origin allowlist is gone');
  must(/if \(origin && !BRIDGE_ALLOWED_ORIGINS\.has\(origin\)\)/.test(main),
    'the origin check no longer runs before the request is routed, so a foreign page could POST');
  must(/req\.method === 'POST' && url\.pathname === '\/generate'/.test(main),
    'the generate endpoint is gone, or no longer restricted to POST /generate');
  must(/body\.length > 8192/.test(main),
    'the prompt size cap is gone — the only unbounded allocation this server has');
  // `origin && ...` only tests the header when it is present, so for a while
  // anything sending no Origin at all skipped the boundary entirely and could
  // both read the scores and start a GPU job. These two are what closed it.
  must(/req\.method === 'POST' && !origin/.test(main),
    'a POST with no Origin header is accepted again — that is the generate endpoint wide open');
  must(/function hostIsLoopback/.test(main) && /!hostIsLoopback\(req\.headers\.host\)/.test(main),
    'the Host check is gone, so a rebound DNS name reaches the bridge again');
  return 'origin-locked, host-checked, capped';
});

check('security', 'external links stay on an allowlist', () => {
  const main = read('electron/main.cjs');
  must(/ALLOWED_EXTERNAL_HOSTS/.test(main), 'the external-link allowlist is gone');
  must(/function openExternalSafe/.test(main), 'openExternal is being called without the guard');
  return 'allowlisted';
});

// ── the suites that already exist ───────────────────────────────────────────

check('tests', 'the types actually get checked', () => {
  // `tsc --noEmit -p tsconfig.json` reports success on code with undefined
  // names, because the root tsconfig is a solution file with "files": [] and
  // checks nothing at all. Only `tsc -b` walks the referenced projects. A
  // typecheck that cannot fail is worse than none, so this asserts the real
  // command is the one wired up, then runs it.
  const rootConfig = JSON.parse(read("tsconfig.json"));
  must(Array.isArray(rootConfig.references) && rootConfig.references.length > 0,
    'the root tsconfig no longer uses project references; re-check what command actually type-checks');
  const script = JSON.parse(read('package.json')).scripts?.typecheck;
  must(script === 'tsc -b', `npm run typecheck is "${script}", which does not check a referenced project`);
  execFileSync("npx", ["tsc", "-b"], { cwd: root, encoding: "utf-8", shell: true });
  return 'tsc -b, clean';
});

check('tests', 'the full suite passes', () => {
  const out = execFileSync('npm', ['test'], { cwd: root, encoding: 'utf-8', shell: true });
  const fail = out.match(/^.*fail (\d+)/m)?.[1];
  must(fail === '0', `${fail} failing test(s)`);
  return `${out.match(/^.*pass (\d+)/m)?.[1] ?? '?'} passing`;
});

if (withNet) {
  check('claims', 'catalogue URLs and sizes match the servers', () => {
    execFileSync('node', ['scripts/check-model-sizes.mjs'], { cwd: root, encoding: 'utf-8' });
    return 'all sizes verified';
  });

  check('claims', 'every licence link on the consent dialog opens', () => {
    // Most of these are built from the model name rather than written down, so
    // a renamed model yields a 404 on the one screen whose job is to make sure
    // the user can read the terms before agreeing to them.
    const out = execFileSync('node', ['--experimental-strip-types', 'scripts/check-license-links.mjs'],
      { cwd: root, encoding: 'utf-8' });
    return out.trim().split(/\r?\n/).pop();
  });
}

// ── report ──────────────────────────────────────────────────────────────────

const width = Math.max(...results.map((r) => r.name.length));
let area = '';
for (const result of results) {
  if (result.area !== area) { area = result.area; console.log(`\n${area.toUpperCase()}`); }
  const mark = result.ok ? 'ok  ' : 'FAIL';
  console.log(`  ${mark} ${result.name.padEnd(width)}  ${result.note}`);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0
  ? `\nAll ${results.length} checks passed.${withNet ? '' : ' Run with --net to also check catalogue URLs.'}`
  : `\n${failed.length} of ${results.length} checks FAILED.`);
console.log('\nWhat `npm run gates` covers without a human: a real download against the real\n'
  + 'server, the provider dying mid-run, and the run log driven through the real desktop\n'
  + 'app — that last one because the web preview stubs getLogs() and can prove nothing\n'
  + 'about it. The microphone in a packaged build still needs a person.');
process.exit(failed.length === 0 ? 0 : 1);
