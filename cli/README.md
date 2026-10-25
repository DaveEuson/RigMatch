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

## Measure the real speed

The grade's speeds are estimates. `--measure` runs RigScore's speed test, the one in the RigMatch app, through your own Ollama: the same passage, the same settings and the same tier models on every computer, so the number means the same thing on yours as on anyone else's.

```bash
npx rigmatch-fit --measure
```

RIGSCORE_TIERS_OUTPUT

- **The tiers**: Light (`llama3.2:3b`), Standard (`qwen3:8b`), Heavy (`qwen3:14b`) and, on a card with 24 GB, Extreme (`qwen3:30b-a3b`). It runs the ones you have and your card holds. A missing one gets its `ollama pull` command; it is never downloaded for you.
- **Each tier** loads its model, warms it up, then times three runs that each read a page-long passage and write 256 tokens. Writing is how fast the answer comes out, reading how fast your prompt goes in, both the median of the three runs.
- **Points**: 1,000 is the reference PC, an RTX 4070 12 GB on Ollama 0.35.1, and twice as fast at both halves is 2,000. The headline is the Standard tier, as in the app. Points need the same model files as the reference: a tag that has moved since gets its speeds but no points.
- **The words** say what the writing speed is like to use: Excellent from 50 tok/s, Fast from 20, Usable from 5, Slow below.

One model, beside the grade's guess for it:

```bash
npx rigmatch-fit --measure qwen3.5:9b
```

RIGSCORE_MODEL_OUTPUT

It does not run while another program has a model loaded in Ollama, because the two would share the card and the numbers would be low; it says so and leaves that model alone. It unloads every model it loaded when it finishes, and Ctrl+C stops it and unloads. It runs only against Ollama on this computer, since another computer's card cannot be read.

## The Fit grade

A is the best pick for this computer, F will not fit, and "?" means the model's size or your graphics memory is unknown. The grade weighs:

- whether the model fits in graphics memory, and how much room it leaves for a long chat
- how fast it should run, estimated from its size and your card (a mixture-of-experts model counts only the part it runs per word)
- answer quality, judged by size and model family: older families count as smaller than they are

The speeds are estimates; `--measure` measures them. The [RigMatch app](https://github.com/DaveEuson/RigMatch) also measures answer quality, with a judge model scoring the answers.

## What it touches

It reads this computer's graphics card and memory, and asks Ollama at `127.0.0.1:11434` (or `OLLAMA_HOST`) which models are installed. Nothing is downloaded, nothing is sent anywhere else, and the `ollama pull` and `ollama run` commands are printed, never run. Sizes are in GiB, as Ollama and Windows count them, so they read a little smaller than ollama.com's.

`--measure` also runs models you already have on that Ollama, and unloads them after. Its results are printed, not sent anywhere; the JSON's stamp holds the card, driver, versions and model file, and no computer name, file paths or prompts.

Needs Node.js 20 or later, on Windows, macOS or Linux.

## Licence

Source-available, not open source. See [LICENSE](LICENSE). The source is at [github.com/DaveEuson/RigMatch](https://github.com/DaveEuson/RigMatch/tree/main/cli).
