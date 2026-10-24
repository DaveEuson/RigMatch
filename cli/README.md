# rigmatch-fit

Which local AI models will run well on this computer? `rigmatch-fit` reads your graphics card and memory, grades every chat model in a snapshot of Ollama's library for this PC, and prints the best picks with the command that gets each one (or runs it, if you have it already). The snapshot ships with each release; this one is from October 2026.

```bash
npx rigmatch-fit
```

```text
RigMatch fit check
NVIDIA GeForce RTX 4070, 12 GB graphics memory, 61.6 GB system memory
Ollama is running with 9 models installed: 3 in this list, marked *. --installed lists all 9.

Grade  Model             Size    Speed      Fit         Command
A      qwen3.5:9b *      6.1 GB  ~49 tok/s  Sweet spot  ollama run qwen3.5:9b
A      qwen3-vl:8b       5.7 GB  ~53 tok/s  Sweet spot  ollama pull qwen3-vl:8b
A      mistral-nemo:12b  6.6 GB  ~46 tok/s  Sweet spot  ollama pull mistral-nemo:12b
A      deepseek-r1:8b    4.8 GB  ~63 tok/s  Sweet spot  ollama pull deepseek-r1:8b
A      qwen3:8b          4.8 GB  ~63 tok/s  Sweet spot  ollama pull qwen3:8b
```

## Options

| Option | Does |
|---|---|
| `--all` | List every model, including coding and other specialist models, and the ones that will not fit |
| `--installed` | List only the models Ollama already has, graded |
| `--json` | Print every model as JSON, for scripts (with `--installed`, only those) |
| `--provider lmstudio` | Print LM Studio's `lms get` commands instead of `ollama pull` |
| `--vram 16` | Grade for a card with 16 GB instead of this one |

## The Fit grade

A is the best pick for this computer, F will not fit, and "?" means the model's size or your graphics memory is unknown. The grade weighs:

- whether the model fits in graphics memory, and how much room it leaves for a long chat
- how fast it should run, estimated from its size and your card (a mixture-of-experts model counts only the part it runs per word)
- answer quality, judged by size and model family: older families count as smaller than they are

The speeds are estimates. The [RigMatch app](https://github.com/DaveEuson/RigMatch) runs the models on your PC and measures the real speed and answer quality, with a judge model scoring the answers.

## What it touches

It reads this computer's graphics card and memory, and asks Ollama at `127.0.0.1:11434` (or `OLLAMA_HOST`) which models are installed. Nothing is downloaded, nothing is sent anywhere else, and the `ollama pull` and `ollama run` commands are printed, never run. Sizes are in GiB, as Ollama and Windows count them, so they read a little smaller than ollama.com's.

Needs Node.js 20 or later, on Windows, macOS or Linux.

## Licence

Source-available, not open source. See [LICENSE](LICENSE). The source is at [github.com/DaveEuson/RigMatch](https://github.com/DaveEuson/RigMatch/tree/main/cli).
