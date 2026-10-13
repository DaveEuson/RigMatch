# RigScore: a score you can set beside another computer's

Decided 2026-10-12 with Dave. Builds the roadmap's "community score database", pulled forward from 1.0+, in an order that keeps the data promise.

## The question

The Match Score answers "which model suits my PC". It cannot be compared across computers: answer quality belongs to the model, and fit belongs to the card. RigScore answers a different question, "how fast is my PC at local AI", with a number that means the same thing on every computer.

LocalScore already publishes speed leaderboards from thousands of runs, so RigMatch will not win on breadth. What it can add is a speed score from the same app that measures quality and fit on the same machine.

## What a score is

- **Fixed work.** Every computer runs the same prompts on the same weights with the same settings (`RIG_WORKLOAD` in `src/lib/rigScore.ts`). Anything that changes a speed is in there, and its `version` moves when any of it changes. Scores of different versions are never set side by side.
- **Tiers**, like 3DMark's: Light (`llama3.2:3b`), Standard (`qwen3:8b`), Heavy (`qwen3:14b`), Extreme (`qwen3:30b-a3b`). A PC that cannot hold a tier shows "not run" for it, never zero.
- **Measured per tier:** prompt processing and generation, in tokens per second, as the median of 3 timed runs after a warm-up, plus the model load time.
- **Points:** 1000 at a written-down reference machine. Twice as fast at both halves is 2000. The two halves are combined as a geometric mean, so neither can hide the other.
- **Headline:** the Standard tier, which most computers that run local AI can hold. The other tiers are shown beside it.
- **Separate from the Match Score.** Never blended into it.

## What goes with every score (the rig stamp)

GPU, VRAM, driver, Ollama version, app version, the digest and quantization of the weights, the workload version and the context size. Two results are set side by side only if the weights, the workload version and the context size match. A different Ollama or driver is compared with the difference named, because speeds do move with them (the same card drifted 12 to 18 percent between two days).

## Where other computers' numbers come from

Opt-in, one result at a time, no server at first:

1. A "Submit my result" button opens a prefilled GitHub issue holding the score and the rig stamp, the same pattern as the feedback link. Nothing is sent from the app, and nothing leaves until the person presses Submit on GitHub.
2. Accepted results are merged by hand into a table in the repo.
3. A leaderboard page on the site is built from that table.

This holds to a few hundred entries and costs nothing. A server is the step after, if it is ever needed, and it needs a privacy policy first.

The submission carries the rig stamp and the scores only: no host name, prompts, transcripts or file paths.

## Phases

1. **Core** (this branch): `src/lib/rigScore.ts` and its tests. Tier models, the workload, the medians, the points, and whether two results can be compared.
2. **Runner**: an IPC that pulls a tier's model if it is missing (saying the size first), runs the fixed workload, and returns a `TierMeasure` and a `RigStamp`. Uses the per-run timings the benchmark already records (`evalCount`, `evalDuration`, `promptEvalDuration`, `loadDuration`).
3. **Reference**: measure the reference machine for each tier and write the numbers in.
4. **Screen**: the results screen in Advanced Mode, with history, and a shareable card.
5. **Submit and compare**: the GitHub submission, the table, the leaderboard page.

## Open

- **The reference machine.** The suggestion is the RTX 4070 12 GB on Ollama 0.35.1, Dave's own machine, so the number is one that can be checked. It needs measuring in phase 3.
- **The fixed passage** for the prompt-processing half has to be written and checked to land near 1500 tokens on every tokenizer in the tier models.
- **Pinning by digest.** The tags can move. The first measurement records the digest, and a later one with a different digest is flagged, not mixed in.
- **Machines with unified memory** (Apple Silicon, Jetson) have no VRAM figure, so every tier is offered, and a tier too large for the memory has to fail clearly.
- **Remote hosts** are out. RigMatch cannot read another computer's card, so a score from one has no honest stamp.
