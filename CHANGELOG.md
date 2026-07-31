# Changelog

Every RigMatch release, newest first. These are the same notes the app shows in
Update Center — this file and the GitHub release pages are generated from
`src/data/releaseNotes.ts`, so there is only one place to write them.

## 0.3.7 — One Score, One Grade Table
_Beta build_

- The Match score now means the same thing everywhere. It was described five different ways across the app — one place said it combined "three signals" and quietly left out answer quality's partner, finish rate, which is 18% of the total. Every screen now states the same four parts: 34% answer quality, 32% speed, 18% finish rate, 16% computer fit.
- Fixed two different grade tables shipping side by side. One said an A was 80–94, the other said 88–94 — and the app could show a grade that matched neither. There is now a single grade table that the app itself is graded against, so what you read is what you get.
- Fixed the guided wizard jumping straight to the Winner. Starting a show could skip the whole Compare stage and crown your previous Top Match, and "Meet the winner" stayed clickable mid-run, declaring a result from a fraction of the questions. The show now runs to the end before anyone gets the rose.
- The interactive web demo now shows correct sample numbers. Its scores were typed by hand and drifted from what the weights actually produce, so the demo looked like it disagreed with itself. (Real test results were never affected.)
- Removed the hardware-upgrade shopping link from the live test screen — an affiliate link has no business on the screen that is measuring your computer. Upgrade suggestions stay in Your Rig, with the disclosure now shown before the links and a note that your fit score is not affected by them.

## 0.3.6 — Now Just “RigMatch”
_Beta build_

- RigMatch.AI is now simply RigMatch. The ".AI" led people to expect a website, but this is a desktop app that runs models on your own machine — the shorter name makes that clearer.
- Fixed the share and download links, which pointed at the old address. Shared scorecards, the "get RigMatch" links, and the online demo now all go to the new home. If you shared a card recently, the link works again.
- No feature changes in this build — same app, cleaner name.

## 0.3.5 — Share Your Match, Export for Companions & Update Nudge
_Beta build_

- Share your Top Match right from the winner screen: a new "Share match" button turns your result into an image — your GPU, the matched model, and its score — ready to post. The card got richer graphics (confetti, hearts, and Speed/Quality/Fit chips), and there's now a LinkedIn button alongside X, Reddit, and Bluesky.
- New "Export for Hatch": from Top Pick you can export a small JSON profile of RigMatch's recommendation. Companion apps that accept it (like Hatch) can set your local Ollama model straight from the profile — no typing model names. Copy it to the clipboard or download the .json.
- A gentle update nudge: when a newer RigMatch is available, a small, dismissible pop-up appears on launch with what's new and a link to upgrade. It never forces anything and won't nag you again for a version you've already seen.
- Under the hood: internal cleanup (splitting oversized code into focused modules with no change in behaviour) and small polish fixes to the share and export flows.

## 0.3.4 — Cleaner Settings, Fairer Fit Scores & Audit Fixes
_Beta build_

- Settings is much simpler: it now holds just the things you actually change — mode, theme, updates, and support. The old feature roadmap and duplicate blurbs are gone, hardware and provider details moved to Your Rig, and the skill-test Lab moved to Activity, next to where its results already appear.
- Fixed hardware "fit" scores for larger models: a size-detection bug read models like 22B, 32B, or 123B as if they were tiny, so big models looked like they fit any PC. Fit now reflects the real parameter size, which also corrects the overall Match score for those models.
- The model table's Popularity column is now a measured Speed column. Ollama removed public pull counts from its library, so instead of an empty "No pull data" column, RigMatch shows each model's real tok/s from your own tests and sorts by it. If Ollama restores pull counts, the column switches back automatically.
- Quick single-model tests now show the same resource warning as Speed Dating before they start, with a "don't warn me again" option.
- A skill-test app that only passed the basic structure check no longer shows a confident letter grade — the header reads "Structure … · unverified" so a broken app can't wear an A. Turn on Judge grading for a grade that tests whether it actually runs.
- Scorecard rankings are now stable for models with nearly identical scores (they could previously reorder depending on how the list was built), and a fresh install no longer shows a sample benchmark result as if you had already run a test.
- Under the hood: out-of-range judge scores are rejected instead of being misread as a top score, remote responses are size-capped, the Ollama installer download is hardened against filesystem errors and double-starts, and the app-preview sandbox always applies its network-blocking policy. The RigMatch Chat companion stays in lockstep at 0.3.4.

## 0.3.3 — Judge Grading, App Builder 2.0 & GPU Fixes
_Beta build_

- New opt-in Judge grading: instead of the built-in keyword checks, a model you pick grades every answer — and reads any app built in a skill test to judge whether it actually works. Choose a local model (everything stays on this computer) or, strictly opt-in, a cloud model through OpenRouter with your own API key.
- App Builder results now show their source: a View code toggle with one-click copy, alongside the running app.
- App Builder second chances: Improve hands the model its own attempt to fix, Improve with a hint lets you tell it what's wrong, and Auto-improve runs several passes back to back and keeps the best attempt. A "Not what you expected?" note explains honestly why small models struggle to build apps.
- Apps with code that can't even run (syntax errors) no longer score well — they're capped at an F with the reason shown on the scorecard. Previously a blank, broken app could score a perfect S.
- Powerful GPUs no longer get tiny models recommended: the Pick step now leads with the largest model that comfortably fits your VRAM instead of the smallest, so a 16 GB card is steered toward a capable 7B–14B model rather than a 2 GB one.
- Fixed VRAM reading as 0 on some Linux/NVIDIA systems: when the system scan can't see your graphics memory, RigMatch now asks nvidia-smi directly, so a 4090 is no longer mistaken for a VRAM-less rig (which had collapsed model picks down to only the smallest models).
- Fixed the RigMatch Chat companion crashing on launch on Linux with NVIDIA graphics (a WebKitGTK/driver crash during startup, most common on Wayland).
- The RigMatch Chat companion now shares the app's version number (0.3.3) instead of its own separate line — one version to track from here on. This is a one-time alignment, not a rewrite; the only companion change this build is the Linux launch fix above.

## 0.3.2 — Image Model Catalog Fix
_Beta build_

- Fixed "Makes images" showing 0 models: Ollama publishes its image-generation models (x/flux2-klein, x/z-image-turbo) in a separate namespace that the catalog scraper never read, so they never appeared no matter how much VRAM you had.
- The catalog now includes both models by default and live-scrapes that namespace going forward, so new models Ollama adds there show up automatically.
- Fixed overlapping text and buttons on the Top Match card in the header at narrower window widths (stale, conflicting CSS from an old layout was winning over the current one).

## 0.3.1 — Live Rig & Skill-Test Fixes
_Beta build_

- The live test stage now shows CPU, RAM, VRAM, and GPU meters while a model runs, so you can watch it work your hardware in real time.
- Model sizes are read correctly again: a multi-tag model no longer borrows a neighbouring tag's size (e.g. nemotron-3-nano:30b showed 2.8 GB instead of its real ~22 GB), which also fixes Rig Picks recommending an oversized tag.
- The App Builder skill test no longer truncates: capable models get a much larger output budget, so full single-file apps like Tetris can finish instead of getting cut off mid-code.
- The "Recognize an image" skill test now lets you pick from a few built-in pictures or upload your own, instead of always using one fixed image.
- Under the hood: a large internal cleanup split the app into focused modules with no change in behaviour, plus a regression test that locks in the model-size fix.

## 0.3.0 — The Guided Wizard Update
_Beta build_

- Simple Mode is now a real five-step wizard — Setup, Pick, Download, Compare, Winner — instead of the advanced screens with a step bar on top. Pick shows friendly contestant cards of models that fit your PC, with no jargon. Advanced Mode is unchanged and one click away.
- First launch now opens a quick splash to choose Simple or Advanced, and Simple Mode always starts at Setup (step one) instead of jumping ahead. The Simple/Advanced switch also sits in the same spot in both modes.
- Chat with a vision model? You can now attach an image for it to read — a paperclip appears in chat for models that support it, and the image shows in the conversation.
- The image-generation skill test can now be attempted on Windows and Linux, not just macOS. Models that are genuinely macOS-only (MLX format) fail with a clear explanation instead of being hidden.
- You can now run skill tests on their own, skipping the question round — handy for image models, which the run no longer tries to quiz first.
- Anything a model makes — a built app or a generated image — is now viewable wherever that model appears, including Top Pick and the Scorecards, via a "View app / View image" chip.
- The live Speed Dating stage can now be minimized to a small "now playing" bar so you can keep using RigMatch while a long run finishes — you are no longer stuck on that screen.
- New Activity tab: a job monitor for running benchmarks, skill tests, and downloads, plus recent results. Apps and images a test produced can be viewed right there.
- Optional Skill Tests during a run: ask models to build a small app (Tetris, Snake, Calculator, Clock, Paint, or your own prompt) or generate an image. Finished apps and images pop up in a locked-down viewer, and grades appear on the scorecard.
- New "Makes images" and "Makes video" model filters, separate from the vision/OCR (reads-images) filter.
- Simple Mode fixes: "Stop the show" now actually halts a run; the Setup screen no longer flashes a false "Ollama not found" on first load; the Compare stage no longer gets skipped; contestants can be removed from the lineup; and the Download screen shows live speed.
- Installers are roughly 15 MB smaller (re-encoded art, no visible quality change), and the app opens faster.
- Fixes: the update checker now correctly finds the newest release; accuracy-trap grading no longer marks down honest refusals for wording. Score weights are unchanged — existing scorecards stay valid.
- Coming from 0.2.4? Download this build manually once — the 0.2.4 updater has a bug that hides newer releases and wrongly reports "up to date." From 0.2.5 onward, update checks work normally.

## 0.2.5 — Steadier Scoring & Live Progress
_Beta build_

- Speed is now the median of three timed runs per question, so a single background spike no longer skews a model's pace score.
- Answer-quality grading is more robust — a correct coding answer written with a ternary or a different function name is no longer marked down.
- Scoring improved enough to refresh the saved-score schema: older scorecards now show "Retest recommended," and re-running a test updates them. Heads up — benchmarks take longer now because each question runs three times.
- Benchmarks show live per-run progress ("timing run 2 of 3") so longer tests no longer look stalled, and a running benchmark now stays visible across the app — even after a window reload.
- RigMatch can detect LM Studio's local OpenAI-compatible server and list already-downloaded LM Studio models.
- Installed LM Studio models can be tested and scored, and chatted with in the main app, without a second Ollama download. (The standalone RigMatch Chat companion stays Ollama-only for now.)

## 0.2.4 — Beta Polish & Release QA
_Beta build_

- Simple Mode now uses a clearer game-show host path with consistent top-deck cards and more obvious next-step guidance.
- The top header layout has been tightened so mode, rig, setup, local AI status, and Top Match areas use space more evenly.
- Release validation now includes refreshed build, lint, unit/security guard, dependency audit, secret-pattern sweep, and rendered UI smoke checks.

## 0.2.3 — Personality Profiles
_Nightly build_

- RigMatch Chat now supports personality profiles with custom names, behavior instructions, and optional local avatar uploads.
- The selected local model stays visible in the chat header, so personality never hides which model is actually responding.
- Chat history is separated by model and personality profile, making it easier to test the same model with different assistant styles.

## 0.2.2 — Model Radar & Provider Clarity
_Beta build_

- Models can now be filtered by developer, making it easier to compare families from Google, Meta, Microsoft, Mistral AI, Qwen, and others.
- What's New now watches the live Ollama catalog for newly seen models and can send a local desktop notification when new entries appear.
- Provider copy is clearer: RigMatch 0.2.x is Ollama-first, with LM Studio and OpenAI-compatible local server support planned after the current flow is stable.
- The first App.tsx cleanup pass moved sidebar, model-news, and origin-mapping code into focused modules.

## 0.2.1 — Download Pause & Resume
_Beta build_

- Model downloads now have a Pause control that keeps the active model queued instead of throwing away the whole download queue.
- Paused downloads show their last known progress and switch the main queue action to Resume Download.
- Cancel Queue is now separate from Pause and clearly clears queued downloads.
- Canceling the close cleanup prompt no longer traps the window; the next quit attempt opens the prompt again.

## 0.2.0 — Simple Mode & Release Polish
_Beta build_

- Simple and Advanced modes now look and read clearly different, with a guided Simple Mode path and full hardware monitors in Advanced Mode.
- Top Match can now be cleared or restored, so the best pick can change with the job you want the model to do.
- Saved model scores can be removed from Top Pick and Scorecards when old tests no longer represent what you want.
- Model rows now include a direct Pick Me action for choosing a model without hunting through another panel.
- Mobile and narrow-window layouts now keep the Models cabinet readable instead of squeezing the table into a tiny column.
- Cleaned up the Top Pick roster markup to avoid nested-button warnings during release QA.

## 0.1.9 — Smoke Test & Release Gate Hardening
_Beta build_

- ESLint now ignores generated bundles, nested worktree copies, release output, and Tauri target artifacts so lint checks report real source issues.
- RigMatch Chat now uses the updated Vite/esbuild toolchain to clear the companion npm audit warnings.
- Added a local Windows packaging script that skips executable signing edits for smoke tests on machines without symlink privileges.
- macOS close confirmation now quits RigMatch instead of leaving the app running in the Dock.
- Release smoke guidance now favors qwen3:1.7b and mistral:7b as the thinking-model and normal-model canaries.
- Removed unused RigMatch Chat prototype GIF assets left over from an earlier project.

## 0.1.8 — Platform Reliability & Catalog Fixes
_Beta build_

- Bundled a larger offline model catalog so macOS, Linux, and Windows keep a healthy model pool even when the live Ollama library scan fails.
- Added Linux ARM64 / Jetson release packaging so ARM testers get native beta artifacts.
- Linux RigMatch Chat packaging now builds the dependable .deb companion and avoids flaky upstream AppImage runtime downloads.
- Release workflow hardening keeps security tests portable in CI and updates Rust dependency auditing for newer advisories.
- Mac model counts should no longer collapse to a tiny 14-model fallback when the full live catalog is unavailable.
- macOS close confirmation now quits RigMatch instead of leaving the app running in the Dock.

## 0.1.7 — Advanced Capability Lab
_Beta build_

- Added an optional Advanced Lab for larger capability checks that do not affect the core Match score.
- App Builder challenge asks an installed Ollama model to create a complete single-file Tetris-style HTML game.
- Lab grading checks for structure, controls, scoring, gameplay loop, collision logic, line clearing, and truncation risk.
- Image Generation Lab is extra beta: explicit size/platform warnings, opt-in image model pulls, and separate image grades.
- Model table Good For now shows multiple strengths per model and adds Image/OCR and Search filters.
- Popularity is now visible as a pull-count meter using Ollama library catalog data when available.
- RigChat installer shortcut creation is more explicit and uses the RigChat shortcut name.
- Amazon support links now open through the desktop external-link allowlist.

## 0.1.6 — Release Safety & Download Consent
_June 2026_

- Added third-party model notices in Settings for Ollama/Gemma model terms.
- Bulk Download All now requires an explicit third-party model terms acknowledgement before queueing pulls.
- Added a bottom download status window for active Ollama pulls and queued model downloads.
- Top Match now includes a Use this model action in the top deck.
- System resource meters are compacted so CPU, RAM, VRAM, and GPU fit the header row.
- Default desktop window now opens wider to give the header, lineup, and download dock more room.
- Added a repo-level THIRD_PARTY_MODELS.md release checklist.

## 0.1.5 — Ollama Parity Benchmarks
_June 2026_

- Benchmark timing now uses an unscored Warm-up Period before measuring Ollama parity requests.
- Scored prompts now use stream:false, keep_alive, deterministic options, and Ollama official timing fields.
- Speed score now comes from Ollama official eval_count / eval_duration metrics.
- Truncated Ollama runs now affect stability instead of being treated as clean finishes.
- Closing RigMatch now warns about Ollama model storage and can delete unscored or low-scored models.
- Added local speed comparison diagnostics for beta tester reports.

## 0.1.4 — Speed & Popularity in the Table
_June 2026_

- New Speed column in the model table — shows tok/s for benchmarked models, pull count otherwise.
- Speed column is sortable: click the header to rank by real benchmark speed.
- Pull counts (popularity) now visible at a glance for every model with Ollama library data.

## 0.1.3 — Smarter Benchmarks & Scoring
_June 2026_

- Benchmark now streams tokens live — no more frozen "Asking now" during generation.
- Added num_ctx cap so large-context models (Gemma4, Qwen3) don't blow out VRAM.
- Increased max response length so models can finish answering.
- Fixed answer-quality scoring to catch more natural refusal phrasing.
- ScoreBars now shows real Avg Response Time and First Token latency in ms/s.
- Bottleneck explainer: Judge Card now flags CPU-only mode, VRAM overflow, slow drive, GPU not active.
- Models that are too big now show amber warning instead of being blocked — test anyway at your own risk.
- Section flow: View Scorecards → after Speed Dating; Top Pick → in Scorecards header.
- Stop Run button in single test panel now actually stops the run.
- Fixed model size scoring for 12b, 27b, 9b and other missing sizes.
- In-app Ollama installer for Windows and Mac.
- Live VRAM used and GPU % in the system header.

## 0.1.2 — Stability & Security
_June 2026_

- Download cancel now immediately aborts the active Ollama pull, not just the queue.
- Chat timeouts and failures now surface in the activity ticker.
- Clearing app data now confirms disk write before resetting UI state.
- Fixed catalog double-fetch race when clicking Refresh rapidly.
- Fixed stale model selection crash when a model is removed from Ollama.
- Ollama update check now times out after 5 seconds instead of hanging.
- Hardened chat message sanitization against control-character injection.

## 0.1.1 — Beta Hardening
_June 2026_

- Bug report button, markdown chat rendering, VRAM header, sticky profile tabs, and lineup banner.
- UI polish: single-row tabs, Top Pick hero card, roster X buttons, avatar glow.
- Stability and hardening improvements across the board.

## 0.1.0 — Local Matchmaker Preview
_June 2026_

- Local-only v1 flow focused on this computer and local Ollama.
- Dating profile, Top Pick, Speed Dating, scorecards, and editable test questions.
- Hardware-aware model filters keep models that are too big for your VRAM out of the default lineup.
- Settings now includes release notes and Release/Nightly upgrade checks.

## 0.0.x — Prototype Lab
_Earlier builds_

- Initial rig scan, Ollama model pool, compatibility scoring, and desktop bridge logging.
