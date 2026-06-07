# RigMatch.AI Session Notes

Saved: 2026-06-06 19:58 PDT

## Product Direction

RigMatch.AI should be:

1. Helpful: recommend models that make sense for the user's computer.
2. Easy: make the next useful step obvious and keep advanced choices optional.
3. Fun: use the matchmaking, dating-game, and online-dating theme to make testing local AI less boring.

The current visual direction is retro dating show / matchmaker / AI personals. The robot scorecard ceremony banner is the strongest reference image for the vibe.

## What Changed This Session

- Shifted the app toward a clearer dating-game layout with a left-side Matchmaker menu.
- Moved remote/network runners out of v1 scope. RigMatch v1 is local-only; remote systems are phase 2 / 2.0.
- Added hardware-aware model filtering so out-of-league models are hidden by default while still allowing a "Show All" view.
- Made the winner clearer with "Bachelor Number 1" / Top Pick language.
- Added a Speed Dating category separate from single-model tests.
- Improved Speed Dating so users can see the picked lineup, the question set, rankings, and question/answer transcript.
- Added live compatibility-date/flirting style animation during model tests.
- Added clickable score/profile tabs so Scores and Questions expose saved scoring details and test prompts/answers.
- Added score clearing controls for wiping one score or all saved scores.
- Added "Choose Me" behavior and cruise-style celebration animation.
- Added model origin/country metadata in the model table and profiles.
- Added release notes and an Upgrade Center area under About.
- Added "Tonight's Lineup" sidebar card navigation. Clicking it opens the Speed Dating tab.
- Added the scorecard ceremony image to the README near the top.
- Reworked the brand/app icon multiple times. Final icon is a high-quality raster compatibility-meter scene, not a vector robot/heart mark.
- Replaced decorative identity pieces with raster art:
  - `src/assets/rigmatch-brand-icon.png`
  - `src/assets/status-ollama-service.png`
  - `src/assets/status-local-scan.png`
  - `src/assets/machine-avatar-local.png`
  - `src/assets/model-avatar-*.png`
- Kept lucide icons for functional buttons and navigation controls where icon recognition matters.

## Important Files

- Main React UI: `src/App.tsx`
- Main styling: `src/App.css`
- Desktop shell: `electron/main.cjs`
- Desktop preload bridge: `electron/preload.cjs`
- README: `README.md`
- App icon/favicons:
  - `src/assets/rigmatch-brand-icon.png`
  - `public/rigmatch-brand-icon.png`
  - `build/icon.png`
  - `build/icon.ico`
- Strong visual reference:
  - `src/assets/robot-scorecard-ceremony.png`

## Verification Used

Useful commands:

```bash
npm run lint
npx tsc -b
npx -y node@22 ./node_modules/vite/bin/vite.js build
node --check electron/main.cjs
node --check electron/preload.cjs
```

Note: the system Node is older than Vite wants, so use the Node 22 shim for Vite builds:

```bash
npx -y node@22 ./node_modules/vite/bin/vite.js build
```

The dev app was running at:

```text
http://127.0.0.1:5173/
```

If Electron shows old imagery or old click behavior after a reboot, refresh or restart the Electron window so it picks up the latest bundle.

## Suggested Next Improvements

1. Home screen clarity
   - Make "Your Rig" feel like the starting lobby.
   - Clear first actions: "This computer is ready", "good model dates found", "Start Speed Dating".

2. Speed Dating flow
   - Make the process obvious at a glance:
     - Pick models
     - Ask same questions
     - Crown Bachelor Number 1
   - Keep the selected lineup visible when users are told to remove or add models.

3. Model profile polish
   - Every profile should quickly answer:
     - Is this good for my computer?
     - What is it best at?
     - Why did it win or lose?

4. Score explainability
   - Each score should have a plain-English reason.
   - Example: "qwen2.5:7b won because it fit your 12 GB VRAM, answered JSON prompts cleanly, and stayed fast."

5. README / GitHub polish
   - Add 2 to 3 screenshots.
   - Add install instructions.
   - Add a short "What this app does" section.

6. First-run experience
   - The wizard should end with one obvious action: "Start Speed Dating".
   - It should let a new user test the app without learning the whole UI.

## Open Product Questions

1. Should RigMatch feel primarily like a dating site, a 1970s game show, or a matchmaker assistant?
2. Should the main promise be "Find the best model for your computer" or "Benchmark local AI models the fun way"?
3. Should "Choose Me" eventually set a preferred/default model, or stay purely fun for now?
4. Should RigMatch eventually launch chats through Ollama, or only recommend and test models?
5. How much tacky romance is right for v1 before it starts getting in the way of clarity?

## Current Best Next Step

Tighten the first-run path and Speed Dating screen. The app should become obvious in the first 30 seconds: pick a few models, ask the same questions, and crown the best local match for this computer.
