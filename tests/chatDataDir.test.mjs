// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * RigMatch Chat saves its history under the user's own app data folder, and
 * nothing used to stop a test from launching it there. One did, during the
 * 0.10.0 Windows check: the Chat button in a driven RigMatch started the real
 * companion, and its test chats went into the real history.
 *
 * RIGMATCH_CHAT_DATA_DIR moves everything Chat saves into one folder, and a
 * value that is set but unusable stops Chat rather than falling back. That only
 * protects a harness that sets it, so these tests do two things: they keep the
 * Rust side honest (one place decides the folder, every file goes through it),
 * and they fail any script, test or workflow that starts RigMatch or Chat
 * without naming the variable.
 *
 * The Rust function that decides the folder is tested where it lives, in
 * rigmatch-chat/src-tauri/src/data_dir.rs (`cargo test`).
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const VARIABLE = 'RIGMATCH_CHAT_DATA_DIR';
const read = (path) => readFileSync(join(root, path), 'utf8');

const SKIPPED_FOLDERS = new Set(['node_modules', 'target', 'dist', 'release', 'companions', '.git', 'gen']);
const SOURCE_TYPES = new Set(['.mjs', '.cjs', '.js', '.ts', '.tsx', '.yml', '.yaml']);
// Where a harness could live. electron/ and src/ are the apps themselves.
const LAUNCHER_FOLDERS = ['scripts', 'tests', 'cli', '.github/workflows', 'rigmatch-chat'];
const THIS_FILE = 'tests/chatDataDir.test.mjs';

function sourceFiles(folder) {
  return readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_TYPES.has(extname(entry.name)))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .filter((path) => !path.split('/').some((part) => SKIPPED_FOLDERS.has(part)));
}

/**
 * Whether a file starts RigMatch or RigMatch Chat, and how it does. The ways
 * that matter:
 *
 * - Playwright's Electron driver, or Electron driven over a debugging port. The
 *   Chat button in a RigMatch started this way launches the real companion.
 * - A page calling the Chat button's own IPC.
 * - A child-process call that names the Chat binary.
 * - In a workflow, a step whose command is the Chat binary (listing it, running
 *   `ldd` on it, or checking its bundle id does not start it).
 *
 * This reads shapes of code; it cannot prove a harness is safe. A launcher that
 * hides its target behind a variable can get past it, so when a new way of
 * starting Chat turns up, add its shape here along with the harness.
 */
export function howItLaunches(path, text) {
  if (path.endsWith('.yml') || path.endsWith('.yaml')) {
    return workflowRunsChat(text) ? 'a workflow step runs the Chat binary' : null;
  }
  if (/\b_electron\b/.test(text)) return 'drives Electron with Playwright';
  if (/--remote-debugging-port/.test(text)) return 'drives Electron over a debugging port';
  if (/\bagentArcade\.openChatApp\s*\(/.test(text)) return 'calls the Chat button from a page';
  if (childProcessCalls(text).some((args) => /rigmatch-chat|RigMatch Chat/.test(args))) return 'starts the Chat binary';
  return null;
}

/** The text between the parentheses of each child-process call in `text`. */
function childProcessCalls(text) {
  const calls = [];
  for (const match of text.matchAll(/\b(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')') depth -= 1;
      end += 1;
    }
    calls.push(text.slice(start, end));
  }
  return calls;
}

function workflowRunsChat(text) {
  const wrappers = /^(?:sudo|nohup|exec|xvfb-run(?:\s+-\S+)*|timeout\s+\S+)\s+/;
  return text.split('\n').some((raw) => {
    let line = raw.trim().replace(/^-\s+/, '').replace(/^run:\s*/, '');
    if (!line || line.startsWith('#')) return false;
    while (wrappers.test(line)) line = line.replace(wrappers, '');
    if (/^(?:Start-Process|start)\s.*rigmatch-chat/i.test(line)) return true;
    if (/^open\s.*RigMatch Chat/.test(line)) return true;
    const command = /^(["'])(.*?)\1/.exec(line)?.[2] ?? line.split(/\s+/)[0];
    return /(?:^|[\\/])rigmatch-chat(?:\.exe)?$/i.test(command);
  });
}

/** Every launcher in `files` (path -> text) that does not name the variable. */
export function unisolatedLaunchers(files) {
  return Object.entries(files)
    .filter(([path]) => path !== THIS_FILE)
    .map(([path, text]) => ({ path, how: howItLaunches(path, text), names: text.includes(VARIABLE) }))
    .filter(({ how, names }) => how && !names)
    .map(({ path, how }) => `${path} ${how} without setting ${VARIABLE}`);
}

test('every script, test and workflow that starts RigMatch or Chat names the variable', () => {
  const files = {};
  for (const folder of LAUNCHER_FOLDERS) for (const path of sourceFiles(folder)) files[path] = read(path);
  assert.ok(Object.keys(files).length > 50, 'the scan found almost nothing, so it proves nothing');
  assert.deepEqual(
    unisolatedLaunchers(files),
    [],
    `Set ${VARIABLE} to a throwaway folder (see scripts/gate-desktop.mjs) or the run can write test chats into the real history.`,
  );
  // The scan has to be looking at the one harness that launches RigMatch today.
  assert.match(howItLaunches('scripts/gate-desktop.mjs', files['scripts/gate-desktop.mjs']) ?? '', /Electron/);
});

test('a launcher without the variable is caught, and the same launcher with it is not', () => {
  const launchers = {
    'scripts/a.mjs': "import { _electron as electron } from 'playwright';\nawait electron.launch({ args: ['electron/main.cjs'] });",
    'scripts/b.mjs': "spawn('node', ['x.js', '--remote-debugging-port=9333']);",
    'scripts/c.mjs': "await page.evaluate(() => window.agentArcade.openChatApp());",
    'scripts/d.mjs': "const child = spawn(\n  join(root, 'companions', 'rigmatch-chat.exe'),\n  [],\n);",
    'scripts/e.mjs': "execFileSync('cmd', ['/c', 'start', 'RigMatch Chat.exe']);",
    '.github/workflows/f.yml': '      - run: |\n          xvfb-run -a "$app/companions/rigmatch-chat" &\n',
    '.github/workflows/g.yml': '        run: open "$install_dir/RigMatch Chat.app"\n',
    '.github/workflows/h.yml': '          timeout 20 ./rigmatch-chat\n',
  };
  const caught = unisolatedLaunchers(launchers);
  assert.equal(caught.length, Object.keys(launchers).length, `caught: ${caught.join('; ')}`);

  const withVariable = Object.fromEntries(
    Object.entries(launchers).map(([path, text]) => [path, `${text}\n# ${VARIABLE}`]),
  );
  assert.deepEqual(unisolatedLaunchers(withVariable), []);
});

test('files that only mention Chat, or check it without starting it, are not launchers', () => {
  const bystanders = {
    // A source scan of the launch handler, like the ones in tests/.
    'tests/x.test.mjs': "const main = readFileSync('electron/main.cjs', 'utf8');\nassert.match(main, /app:openChatApp/);",
    'tests/y.test.mjs': "assert.match(app, /agentArcadeApi\\.openChatApp\\(\\)/);",
    // The preview's Chat button opens an in-page dock; no companion starts.
    'scripts/z.mjs': "await page.getByLabel('Open RigMatch Chat').click();",
    'scripts/w.mjs': "execFileSync('npx', ['tsc', '-b']); const exe = join(root, 'companions/rigmatch-chat.exe');",
    '.github/workflows/ok.yml': [
      '          for bin in "$app/rigmatch-ai" "$app/companions/rigmatch-chat"; do',
      '            out="$(ldd "$bin" 2>&1 || true)"',
      '          test -d "$mountpoint/RigMatch Chat.app"',
      '          test "$(plutil -extract CFBundleIdentifier raw -o - "$mountpoint/RigMatch Chat.app/Contents/Info.plist")" = "ai.rigmatch.chat"',
      '          ditto "$mountpoint/RigMatch Chat.app" "$install_dir/RigMatch Chat.app"',
      '          cp rigmatch-chat/src-tauri/target/release/rigmatch-chat companions/',
      '          # ./rigmatch-chat would start it, but this is a comment',
    ].join('\n'),
  };
  assert.deepEqual(unisolatedLaunchers(bystanders), []);
});

test('the app hands the variable on to the Chat it starts', () => {
  const main = read('electron/main.cjs');
  const filter = /const cleanEnv = Object\.fromEntries\([\s\S]*?\n    \);/.exec(main)?.[0];
  assert.ok(filter, 'could not find the environment filter in launchChatApp');
  assert.match(main, /spawn\(candidate,[\s\S]{0,120}env: cleanEnv/);

  // Run the shipped lines themselves against a made-up environment.
  const cleanEnv = new Function('process', `${filter}\nreturn cleanEnv;`)({
    env: { [VARIABLE]: 'C:\\Temp\\chat', RIGMATCH_BRIDGE_PORT: '11450', ELECTRON_RUN_AS_NODE: '1', WEBVIEW2_USER_DATA_FOLDER: 'x', PATH: 'p' },
  });
  assert.equal(cleanEnv[VARIABLE], 'C:\\Temp\\chat', `the filter strips ${VARIABLE} on its way to the companion`);
  assert.equal(cleanEnv.PATH, 'p');
  assert.equal(cleanEnv.ELECTRON_RUN_AS_NODE, undefined, 'the filter no longer does its own job');
});

test('Chat reads the variable in one place and sends every file through it', () => {
  const rust = read('rigmatch-chat/src-tauri/src/lib.rs');
  const shipped = rust.slice(0, rust.indexOf('#[cfg(test)]'));
  assert.ok(shipped.length > 1000, 'could not separate the shipped code from its tests');

  // Where Tauri says the app data folder is: asked once, as the default.
  assert.equal(shipped.match(/app_data_dir/g)?.length, 1, 'only store_path may ask Tauri for a data folder');
  assert.match(shipped, /data_dir::store_dir\(chosen\.0\.as_deref\(\), \|\| app\.path\(\)\.app_data_dir\(\)/);
  assert.doesNotMatch(shipped, /app_(?:local_data|config|cache|log)_dir|home_dir|data_local_dir|config_dir\(\)/);

  // Writing: the two store helpers, and nothing else. A new file written
  // anywhere else would bypass the variable.
  const writes = shipped.match(/std::fs::(?:write|copy|rename|File|OpenOptions|create_dir_all|remove_file|remove_dir_all)/g);
  assert.deepEqual(writes, ['std::fs::write', 'std::fs::rename', 'std::fs::copy'],
    'a new std::fs write in lib.rs: route the file through store_path so RIGMATCH_CHAT_DATA_DIR covers it');
  assert.match(shipped, /store_path\(app, "conversations\.json"\)/);
  assert.match(shipped, /store_path\(app, "memories\.json"\)/);

  // A value that cannot be used stops the launch; it does not become "unset".
  assert.match(
    shipped,
    /data_dir::prepare\(std::env::var_os\(data_dir::ENV_VAR\)\.as_deref\(\)\)\s*\{\s*Ok\(dir\) => dir,\s*Err\(why\) => \{[\s\S]*?std::process::exit\(\d+\);/,
  );
  // The page's own storage (settings, cached scores) moves with the files.
  assert.match(shipped, /\.data_directory\(dir\.join\("webview"\)\)/);
  assert.match(shipped, /window\.create = false/);
});

test('the folder decision does not depend on Tauri, and names the variable the harnesses set', () => {
  const decision = read('rigmatch-chat/src-tauri/src/data_dir.rs');
  assert.match(decision, new RegExp(`pub const ENV_VAR: &str = "${VARIABLE}";`));
  assert.doesNotMatch(decision, /\buse\s+tauri|\btauri::/, 'data_dir.rs must stay testable without a window');
  assert.match(decision, /#\[cfg\(test\)\]/);
  assert.match(read('rigmatch-chat/src-tauri/src/lib.rs'), /^mod data_dir;$/m);
});

test('the variable is written down where Chat is run and where a release is smoke-tested', () => {
  for (const path of ['rigmatch-chat/README.md', 'RELEASE.md']) {
    assert.ok(read(path).includes(VARIABLE), `${path} does not mention ${VARIABLE}`);
  }
});
