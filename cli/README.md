# rigmatch-fit

Which local AI models will run well on this computer? `rigmatch-fit` reads your graphics card and memory, grades every chat model in a snapshot of Ollama's library for this PC, and prints the best picks with the command that gets each one (or runs it, if you have it already). The snapshot ships with each release; this one is from October 2026.

Those speeds are estimates. `rigmatch-fit --measure` [measures the real ones](#measure-the-real-speed) through your own Ollama, with a score you can set beside another computer's.

```bash
npx rigmatch-fit
```

```text
o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o
|   R I G M A T C H     fit check       |
|   Who will your PC go home with?      |
o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o
NVIDIA GeForce RTX 4070, 12 GB graphics memory, 61.6 GB system memory
Ollama is running with 11 models installed: 4 in this list, marked *. --installed lists all 11.

Grade  Model             Size    Speed      Fit         Command
A      qwen3.5:9b *      6.1 GB  ~49 tok/s  Sweet spot  ollama run qwen3.5:9b
A      qwen3-vl:8b       5.7 GB  ~53 tok/s  Sweet spot  ollama pull qwen3-vl:8b
A      mistral-nemo:12b  6.6 GB  ~46 tok/s  Sweet spot  ollama pull mistral-nemo:12b
A      ministral-3:8b    5.6 GB  ~54 tok/s  Sweet spot  ollama pull ministral-3:8b
A      qwen3:8b *        4.9 GB  ~61 tok/s  Sweet spot  ollama run qwen3:8b
...

Tonight's Top Match: qwen3.5:9b (A, ~49 tok/s). Say hi: ollama run qwen3.5:9b
```

The sign and the Top Match line are for a terminal. Piped into a file or another program, the output starts with a plain "RigMatch fit check" line, and `--json` has neither.

## Options

| Option | Does |
|---|---|
| `--all` | List every model, including coding and other specialist models, and the ones that will not fit |
| `--installed` | List only the models Ollama already has, graded |
| `--json` | Print every model as JSON, for scripts (with `--installed`, only those) |
| `--provider lmstudio` | Print LM Studio's `lms get` commands instead of `ollama pull` |
| `--vram 16` | Grade for a card with 16 GB instead of this one |
| `--measure` | Measure this PC's real speed with RigScore's test, on the tier models you have (minutes, not seconds) |
| `--measure <model>` | Measure one installed model's real speed, beside its estimate |
| `--measure --json` | The measures, each one's stamp and points, for scripts |
| `--endurance <model>` | Find where one installed model slows down or loses its place as the context grows, at 2K, 8K and 16K (a few minutes) |
| `--endurance <model> --json` | The stages, the verdict and what the card was doing, for scripts |

## Measure the real speed

The grade's speeds are estimates. `--measure` runs RigScore's speed test, the one in the RigMatch app, through your own Ollama: the same passage, the same settings and the same tier models on every computer, so the number means the same thing on yours as on anyone else's.

```bash
npx rigmatch-fit --measure
```

```text
o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o
|   R I G M A T C H     speed test      |
|   How fast is your PC, really?        |
o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o-*-o
NVIDIA GeForce RTX 4070, 12 GB graphics memory, 61.6 GB system memory
Extreme (qwen3:30b-a3b) is not run: needs 24 GB of graphics memory, and this PC has 12 GB.
Tonight's speed dates: Light (llama3.2:3b), Standard (qwen3:8b), Heavy (qwen3:14b). This takes about
2 minutes: each loads its model, warms it up, then times 3 runs. Ctrl+C stops and unloads.
Steam is open, and can use the graphics card, but the card itself reads quiet, so this should not
matter. Closing it gives the most accurate result.

Speed dates
Light, llama3.2:3b: 166 tok/s writing, 10,085 tok/s reading, 1,182 points
Standard, qwen3:8b: 79 tok/s writing, 4,358 tok/s reading, 1,177 points
Heavy, qwen3:14b: 46 tok/s writing, 2,393 tok/s reading, 1,180 points

Tier      Model          Writing    Reading       Points  Feels
Light     llama3.2:3b    166 tok/s  10,085 tok/s  1,182   Excellent
Standard  qwen3:8b       79 tok/s   4,358 tok/s   1,177   Excellent
Heavy     qwen3:14b      46 tok/s   2,393 tok/s   1,180   Fast
Extreme   qwen3:30b-a3b  Not run: needs 24 GB of graphics memory, and this PC has 12 GB.

Tonight's RigScore: 1,177 points on the Standard tier. Excellent: long answers and code arrive in
seconds.
1,000 points is the reference PC, an RTX 4070 12 GB on Ollama 0.35.1. Twice as fast at both writing
and reading is 2,000. Writing is how fast the answer comes out; reading is how fast the prompt goes
in.
```

That is a real run on the reference card, so it lands near 1,000: the same card scored between 1,004 and 1,177 on the Standard tier across runs, because a card's speed moves 10 to 18 percent with its clocks and what else the desktop is doing. A computer with a slower card scores less, and a faster one more.

It also reads the card before and after the runs, with the app's own thresholds, and says if something else is heavily using it: through `nvidia-smi` on an NVIDIA card, the Windows graphics counters on any other card on Windows, the `amdgpu` driver's files on AMD under Linux, and `ioreg` on Apple Silicon. A card it cannot read (an Intel card under Linux, for one) is reported as not checked, with the reason, never as idle; `--json` names which reading it used. It looks at the card again between the runs' requests, never inside one, and a tier that something else used the card during is marked as disturbed, in the text and as `disturbed: true` with `disturbedBy` in `--json`. Its numbers are as measured; a run nothing disturbed has neither field. A graphics-heavy program that is merely open, such as Steam, is mentioned but is not called busy while the card reads quiet. On any card, a measured speed under half the grade's estimate is flagged on its tier, which is how a card shared with another program shows up. The estimate check rests on one card's numbers so far (an RTX 4070), so it is a note on the result, never a refusal.

Piped into a file or another program, the show's dressing is gone and the progress goes to stderr, so what is printed is a plain title, the card, the table and the closing lines. `--json` prints the measures, each tier's stamp and its points instead.

- **The tiers**: Light (`llama3.2:3b`), Standard (`qwen3:8b`), Heavy (`qwen3:14b`) and, on a card with 24 GB, Extreme (`qwen3:30b-a3b`). It runs the ones you have and your card holds. A missing one gets its `ollama pull` command; it is never downloaded for you.
- **Each tier** loads its model, warms it up, then times three runs that each read a page-long passage and write 256 tokens. Writing is how fast the answer comes out, reading how fast your prompt goes in, both the median of the three runs.
- **Points**: 1,000 is the reference PC, an RTX 4070 12 GB on Ollama 0.35.1, and twice as fast at both halves is 2,000. The headline is the Standard tier, as in the app. Points need the same model files as the reference: a tag that has moved since gets its speeds but no points.
- **The words** say what the writing speed is like to use: Excellent from 50 tok/s, Fast from 20, Usable from 5, Slow below.

One model, beside the grade's guess for it:

```bash
npx rigmatch-fit --measure qwen3.5:9b
```

```text
Model       Writing   Estimated  Reading      Loads in  Points
qwen3.5:9b  72 tok/s  ~49 tok/s  3,354 tok/s  2.9 s     -

Excellent: long answers and code arrive in seconds.
Points are for the four RigScore tier models (--measure on its own runs them). This is this model's
own speed on the same test.
```

Estimated is the fit grade's guess from the model's size and your card (here 49 tok/s); Writing is the real speed (72). Only the four tier models get points, since the points compare like with like: the same weights on every computer.

It does not start while another program has a model loaded in Ollama, because the two would share the card and the numbers would be low; it says so, exits, and leaves that model alone. It unloads every model it loaded when it finishes, and waits for each to leave the card before the next, so a slow release is not mistaken for another program. Ctrl+C stops it and unloads. It runs only against Ollama on this computer, since another computer's card cannot be read, and only local models: one of Ollama's cloud models (a `-cloud` tag, or one Ollama lists with a remote host) is refused, because it runs on Ollama's servers, not on this card, and the prompts would leave this computer.

## Where a model slows down

The speed test, like every RigMatch test, runs at a short context (2K). A long chat, a long document or a whole project fills much more of it, and a model that is fast at 2K can crawl at 16K. `--endurance` finds where, on your card:

```bash
npx rigmatch-fit --endurance qwen3:14b
```

```text
Stage          Context  Prompt  Writing     Reading      Loads in  On the card  Passkey  Feels
Quick chat     2K       287     46 tok/s    2,229 tok/s  2.9 s     100%         kept     Fast
Long page      8K       6,235   40 tok/s    2,108 tok/s  3.6 s     100%         kept     Fast
Whole project  16K      14,692  15.4 tok/s  1,483 tok/s  4.9 s     87%          kept     Usable

Slows down past 8K: part of the model moves to system memory.
At 16K it writes at 15.4 tok/s, 34% of its 2K speed. Only 87% of the model fits on the graphics card there; the rest runs from system memory.
```

It loads the model at each size (the context changes, so Ollama reloads it) and fills the context with a fake server log that hides a passkey 55% of the way in. Each stage reports the prompt Ollama counted, the writing and reading speed, the load time on its own (it is not in the speeds), how much of the model sits on the graphics card, and whether the passkey came back. The verdict names the first size where writing falls under 55% of the 2K speed, less than 92% of the model sits on the graphics card, or the passkey is lost: "Holds up to 16K on your card", "Slows down past 8K: part of the model moves to system memory", "Loses the middle of long inputs past 8K". Those cut-offs were set on three models on one card (an RTX 4070 12 GB), so treat the verdict as a guide.

Ollama silently cuts a prompt that is longer than the context, so the command measures how many tokens a line costs on the model first, and checks after every stage that the prompt Ollama counted is within 15% of the size meant. A stage that is not is marked "wrong size", left out of the verdict and said so; it is never reported as the model's failure. It also reads the context Ollama really gave the model, and says so when `OLLAMA_NUM_PARALLEL` above 1 has split it.

Where a model gives out moves with what else is using the card, so the card is read before and after (NVIDIA only) and named in the result. The same care as `--measure`: it does not start while another program has a model loaded, ends the run and keeps nothing if one loads during it (Ollama then unloads this model to make room), unloads only what it loaded, stops cleanly on Ctrl+C, and runs only against Ollama on this computer and only local models. LM Studio does not report how much of a model is on the card, so `--endurance` works only with Ollama. `--json` prints the stages, the verdict and the card's baseline.

## The Fit grade

A is the best pick for this computer, F will not fit, and "?" means the model's size or your graphics memory is unknown. The grade weighs:

- whether the model fits in graphics memory, and how much room it leaves for a long chat
- how fast it should run, estimated from its size and your card (a mixture-of-experts model counts only the part it runs per word)
- answer quality, judged by size and model family: older families count as smaller than they are

The speeds are estimates; `--measure` measures them. The [RigMatch app](https://github.com/DaveEuson/RigMatch) also measures answer quality, with a judge model scoring the answers.

## What it touches

It reads this computer's graphics card and memory, and asks Ollama at `127.0.0.1:11434` (or `OLLAMA_HOST`) which models are installed. Nothing is downloaded, nothing is sent anywhere else, and the `ollama pull` and `ollama run` commands are printed, never run. Sizes are in GiB, as Ollama and Windows count them, so they read a little smaller than ollama.com's.

`--measure` also runs models you already have on that Ollama, and unloads them after. Its results are printed, not sent anywhere; the JSON's stamp holds the card, driver, versions and model file, and no computer name, file paths or prompts. If Ollama answers with an error that names a path (a model it could not load, say), the terminal shows the error with the path taken out, and the JSON says only that the test did not finish.

Needs Node.js 20 or later, on Windows, macOS or Linux.

## License

Source-available, not open source. See [LICENSE](LICENSE). The source is at [github.com/DaveEuson/RigMatch](https://github.com/DaveEuson/RigMatch/tree/main/cli).
