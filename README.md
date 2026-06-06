# RigMatch.AI

RigMatch.AI pairs a local computer with the best Ollama model for that rig. It scans hardware, checks Ollama, lists model candidates, warns before heavy runs, pulls queued models, and runs compatibility tests for speed, sobriety, stability, and rig fit.

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

- Desktop mode uses Electron IPC to scan the machine, LAN, Ollama, CUDA, and model catalog.
- Browser preview mode uses clearly marked sample data.
- Remote systems must be running Ollama on port `11434` before RigMatch.AI can test them.
- Compatibility tests can heavily use CPU, GPU, VRAM, RAM, disk, fans, and battery.
- Windows, macOS, and Ubuntu/Linux should remain first-class targets for UI, setup guidance, and release packaging.
