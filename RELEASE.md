# RigMatch Release Checklist

Use this before tagging or publishing a beta release.

## Build prerequisites

- Node.js 24.x — the release workflow pins setup-node to 24, and the scoring tests import a .ts module directly
- Rust stable toolchain for RigMatch Chat
- Ollama installed locally for smoke tests
- Platform-specific build host for each installer target
- Linux release artifacts include x64 and ARM64 builds. ARM64 was smoke-tested on a Jetson Orin Nano for 0.7.1: it launches, reads the board through the device tree, and runs the companion

## Required commands

```bash
npm ci
npm --prefix rigmatch-chat ci
npm test
npm run lint
npm run typecheck
npm run sweep
npm run gates
npm run smoke:ui
npm run audit:screens
npm audit --audit-level=critical
npm --prefix rigmatch-chat audit --audit-level=high
npm run build
npm --prefix rigmatch-chat run build
npm run smoke:bench:strict -- --model qwen3:1.7b
npm run smoke:bench:strict -- --model mistral:7b
npm run compare:ollama-speed -- --model qwen3:1.7b
```

**Use `npm run typecheck`, never `tsc -p tsconfig.json`.** The root config is a
solution file — `"files": []` with references — so `-p` type-checks *nothing*
and exits 0. It looks exactly like a clean run. `typecheck` is `tsc -b`, which
builds the referenced projects; `tsc -b --force` when you want to be sure an
incremental cache is not answering for you.

`sweep`, `gates`, `smoke:ui` and `audit:screens` are the checks that catch the
failures the unit tests structurally cannot: a starting state nobody was in,
code that exists twice and drifted, a claim in the source that stopped matching
reality, a window that does not fit the screen. They were added over 0.6 and 0.7
and were missing from this list, which is how the list came to describe a
smaller release process than the one actually run.

After packaging, confirm the build contains what was committed:

```bash
node scripts/verify-package.mjs release/win-unpacked/resources/app.asar
```

If `qwen3:1.7b` is not installed, any small installed thinking model (for example `qwen3.5:0.8b`) covers the same
thinking-mode regression check — the smoke must show default-mode empty answers being rescued in RigMatch mode.

For installers, build on the matching OS:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

For local Windows smoke packaging without executable signing edits:

```bash
npm run pack:win:local
```

For the Rust companion audit, run `cargo audit` from `rigmatch-chat/src-tauri`.

## Manual smoke tests

- Fresh install opens RigMatch and shows the expected version.
- Upgrade install over the previous beta keeps existing scorecards/settings.
- RigMatch Chat launches from the main app without a "not found" error.
- Check Local detects Ollama, installed models, CPU, RAM, VRAM, and storage.
- Provider Support copy names the current version and says Ollama runs downloads while LM Studio can be tested when its local server is running.
- A five-model Speed Dating lineup completes and writes scorecards.
- Missing selected models open setup/download instead of disabling the flow.
- Close cleanup modal supports Cancel, I understand, delete not scored, and delete low scored.
- Support, bug report, GitHub, and hardware affiliate links open expected URLs.

## Artifact checks

- Release output contains the expected platform installers/packages.
- Linux artifacts are labeled by architecture; confirm x64 and ARM64 files are both present before advertising Jetson support.
- The release body includes the macOS unsigned beta first-launch note. It goes out the moment the tag is pushed, so it has to be right beforehand.
- `SHA256SUMS.txt` is generated and uploaded with the release.
- The nested `RigMatch.AI-main/` scratch folder is not committed or included.
- **Artifacts are NOT drafts.** The workflow publishes on a `v*` tag with `draft: false`, and anything not matching nightly/alpha/canary/preview is marked Latest immediately. Smoke-test before tagging, not after. To build without publishing, run the workflow via `workflow_dispatch` — the release job is gated on `refs/tags/`, so it produces artifacts and publishes nothing.

## Logs for beta reports

Ask testers for:

- RigMatch version
- OS and hardware summary
- Ollama version
- Current provider/test engine shown in the app
- Model name/tag
- Repro steps
- Relevant app log lines from **Open logs folder**

Do not ask testers to share private prompts unless they are comfortable doing so.

## Rollback

To roll back:

1. Close RigMatch and RigMatch Chat.
2. Uninstall the current build.
3. Install the previous GitHub release.
4. Keep the app user-data folder intact unless a clean reset is required.
5. If model state looks wrong, click **Check Local** to refresh from Ollama.

Rollback should not delete Ollama models. Ollama model cleanup should only happen through explicit user action in RigMatch or Ollama.
