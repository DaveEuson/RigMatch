# RigMatch.AI

RigMatch.AI helps everyday users find the best local Ollama model for their computer. It checks the machine, confirms Ollama is running, shows model candidates, downloads selected models, and runs simple match tests for speed, reliability, stability, and hardware fit.

<p align="center">
  <img src="src/assets/robot-scorecard-ceremony.png" alt="RigMatch.AI scorecard ceremony banner with retro robot contestants holding scorecards" width="100%">
</p>

The product priorities are:

1. Helpful: recommend models that make sense for the user's computer.
2. Easy: make the next useful step obvious and keep advanced choices optional.
3. Fun: use the matchmaking/game-show theme to make testing local AI less boring.

The product voice is a friendly AI matchmaking game show, but clarity always wins over the joke.

## Compatibility Goal

RigMatch.AI is intended to run locally on:

- Windows 10/11
- macOS, including Apple Silicon
- Ubuntu/Linux desktop systems

The app uses Electron for the desktop shell and keeps OS-specific behavior inside the desktop bridge. Release builds should be verified on the target OS, especially macOS signing/notarization and Linux package behavior.

## Run Locally

```bash
npm install
npm run dev
```

## Useful Commands

```bash
npm run build
npm run lint
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Notes

- Desktop mode uses Electron IPC to scan this machine, local Ollama, CUDA, and the model catalog.
- Browser preview mode uses clearly marked sample data.
- RigMatch.AI v1 is local-only. Remote systems and trusted runners are planned for a later 2.0 phase.
- Compatibility tests can heavily use CPU, GPU, VRAM, RAM, disk, fans, and battery.
- Windows, macOS, and Ubuntu/Linux should remain first-class targets for UI, setup guidance, and release packaging.
