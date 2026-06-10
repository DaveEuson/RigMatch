# Known Issues — RigMatch.AI v0.1 Beta

This is a candid list of issues we know about going into the beta. If you hit something not listed here, that's a genuine bug report — please share it.

---

## Data & Scoring

**Speed scores on existing results show 100 for most models**
The speed scoring formula was recalibrated in this build (now anchored to tok/s: 5 tok/s = 0, 100 tok/s = 100). Results saved before this version will still show the old inflated speed scores. Re-running a test on any model will give it the corrected score.

**Five-way ties in Scorecards**
The Match score is an integer 0–100. With 10 questions, several models often land on the same number (e.g. 89·A). Tiebreakers exist (sobriety → fit → speed → alphabetical) but the underlying score doesn't have enough resolution to separate close results. A future build will add decimal precision internally and round only for display.

**Stale "Not tested yet" state after Speed Dating**
In some cases, a model that was just tested in Speed Dating will still show "Not tested yet" in its individual profile panel until the app is refreshed. The score is saved correctly — it's a UI refresh issue, not data loss.

**Category picks may show unexpected winners on old saved scores**
The "Best for Reasoning" and similar category cards filter by model specialties. If you have saved scores from before this build, some category winners may not reflect the updated specialty tags. Re-testing will correct them.

---

## Chat Companion (RigMatch Chat)

**"Visible Models" control has no effect**
The Visible Models bar in Chat Settings is present but not yet functional. It's intended as the way to un-hide a hidden buddy. Workaround: clear all chat data to reset hidden model state.

---

## What's Working Well

- Model counts are consistent across all panels
- Cloud models (tagged ☁) are excluded from rankings and Top Pick
- Speed Dating side-by-side comparison is fully functional
- Score weights (34/32/18/16) are shown on the methodology page
- Real tok/s is measured live and displayed per-question
- Run logs with path + copy are available for bug reports
- All local model inference runs entirely on your machine — no prompts leave your computer
- Chat companion renders markdown formatting (bold, bullets, code blocks)
- Chat header shows CPU, RAM, and live VRAM used by loaded models

---

## Reporting Bugs

If you find something not on this list, please open an issue or drop it in the beta feedback channel. Screenshots and your hardware spec (VRAM, OS) help narrow things down fast.

*Last updated: v0.1 beta — June 2026*
