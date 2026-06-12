# RigMatch.AI Release Checklist

Use this before tagging or publishing a beta release.

## Build prerequisites

- Node.js 20.x with npm 10.x
- Rust stable toolchain for RigMatch Chat
- Ollama installed locally for smoke tests
- Platform-specific build host for each installer target
- Linux release artifacts include x64 and ARM64 builds; Jetson/ARM64 is experimental until smoke-tested on real hardware

## Required commands

```bash
npm ci
npm --prefix rigmatch-chat ci
npm test
npm run build
npm --prefix rigmatch-chat run build
```

For installers, build on the matching OS:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Manual smoke tests

- Fresh install opens RigMatch.AI and shows the expected version.
- Upgrade install over the previous beta keeps existing scorecards/settings.
- RigMatch Chat launches from the main app without a "not found" error.
- Check Local detects Ollama, installed models, CPU, RAM, VRAM, and storage.
- A five-model Speed Dating lineup completes and writes scorecards.
- Missing selected models open setup/download instead of disabling the flow.
- Close cleanup modal supports Cancel, I understand, delete not scored, and delete low scored.
- Support, bug report, GitHub, and hardware affiliate links open expected URLs.

## Artifact checks

- Release output contains the expected platform installers/packages.
- Linux artifacts are labeled by architecture; confirm x64 and ARM64 files are both present before advertising Jetson support.
- `SHA256SUMS.txt` is generated and uploaded with the release.
- The nested `RigMatch.AI-main/` scratch folder is not committed or included.
- Build artifacts are draft releases until smoke-tested.

## Logs for beta reports

Ask testers for:

- RigMatch.AI version
- OS and hardware summary
- Ollama version
- Model name/tag
- Repro steps
- Relevant app log lines from **Open logs folder**

Do not ask testers to share private prompts unless they are comfortable doing so.

## Rollback

To roll back:

1. Close RigMatch.AI and RigMatch Chat.
2. Uninstall the current build.
3. Install the previous GitHub release.
4. Keep the app user-data folder intact unless a clean reset is required.
5. If model state looks wrong, click **Check Local** to refresh from Ollama.

Rollback should not delete Ollama models. Ollama model cleanup should only happen through explicit user action in RigMatch or Ollama.
