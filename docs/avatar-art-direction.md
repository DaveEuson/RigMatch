# Contestant avatar art direction

House style for RigMatch's model portraits, derived from the existing seven
(`src/assets/model-avatar-*.webp`). Follow this so new families read as
siblings, not strangers.

## Fixed elements — keep identical across every avatar

- **Canvas:** 512 × 512, square, exported as `.webp`.
- **Frame:** thick rounded-square bezel (app-icon shape) with a metallic
  gradient and a soft inner bevel. Pure black outside the rounded corners.
- **Setting:** a game-show stage. Deep magenta/burgundy velvet curtains behind
  the subject, softly out of focus.
- **The heart marquee:** a large heart outline made of glowing round marquee
  bulbs, centered behind the robot's head. This is the signature motif — every
  avatar has it.
- **Subject framing:** a single robot, chest-up portrait, centered, facing
  forward, filling roughly the middle 60% of the frame.
- **The face:** a dark rounded rectangular screen with simple glowing
  dot-matrix features — two curved "happy" eyes and a smile. Friendly and
  minimal; never a realistic face, never a mouth with teeth.
- **Rendering:** polished 3D-render / painterly hybrid. Glossy surfaces, warm
  rim lighting from the marquee bulbs, gentle bloom, shallow depth of field.
- **Mood:** charming, warm, a little retro-futuristic. Cute, not menacing.

## The naming rule — what varies per family

**Every robot literally embodies its model's name, logo, or etymology.** That's
the joke, and it's what makes the set feel designed rather than decorated:

| Existing | Why it looks like that |
|---|---|
| Llama | Ollama → an actual llama: fluffy wool coat, llama ears, snout-shaped smile |
| DeepSeek | Their logo is a whale → a whale robot with a spout and tail fin |
| Mistral | A *mistral* is a French wind → a swept, flowing wind-crest |
| Phi | The Greek letter **Φ** → a ring-and-stem antenna forming the symbol |
| Qwen | Mint-green bot with a glowing heart on its chest panel |
| Generic | Unknown contestant → a **?** on its face screen |

Keep that rule. When in doubt, ask "what is this model *named after*?" and build
the robot from that.

### Robots still to make

**1 · `granite` — IBM Granite** (`granite3.2`, `granite3.3`, `granite-code`)
Carved from polished speckled granite — a stone robot, solid and unhurried.
IBM's logo is eight horizontal bars, so etch subtle horizontal striations into
the stone. *Slate grey, mineral speckle, IBM-blue glow.*

**2 · `cohere` — Cohere** (`command-r`, `command-r-plus`, `aya`)
Aya speaks 100+ languages, so give it a halo of small glowing glyphs from
different scripts (あ ع ñ д) orbiting its head; Command-R earns a small
commander's epaulette on one shoulder. *Coral-to-violet gradient.*

**3 · `vision` — the models that can see** (`llava`, `bakllava`, `moondream`, `minicpm-v`)
One eye is a real camera lens with visible aperture blades; a small crescent
moon floats at its temple for moondream. *Teal and brass.*

**4 · `yi` — 01.AI** (`yi`)
"Yi" is 一, the Chinese character for **one**, from a company called 01. A
minimal, zen robot with a single glowing horizontal stroke on its chest and a
faint 0/1 pattern in its plating. *Deep indigo and silver.*

**5 · `solar` — Upstage** (`solar`)
Solar → the sun. Give it a golden solar-panel collar that fans behind the
shoulders and a small sun emblem on the chest. Warmest robot of the set.
*Amber and burnished gold.*

**6 · `falcon` — TII, UAE** (`falcon`, `falcon2`)
A falcon robot: swept beak-like visor, feathered wing plates at the shoulders,
and a nod to falconry with a small leather-and-brass hood detail. *Desert sand
and bronze.*

**7 · `starcoder` — BigCode** (`starcoder2`)
Star + coder. A starfield glitters across its dark face screen, and glowing
`{ }` brackets frame it like earmuffs. *Violet and cyan.*

**8 · `smollm` — Hugging Face** (`smollm2`)
"Smol" is the whole personality: the tiniest, roundest, most chibi robot in the
set — noticeably smaller in frame than the others — with both little hands
raised in a Hugging Face hug. *Soft HF yellow.*

**9 · `stablelm` — Stability AI** (`stablelm2`)
Stability → perfect balance. The composition is flawlessly symmetrical and the
robot sits utterly serene, with a glowing spirit-level bubble centered in its
chest panel and small balance-scale pans on its shoulders. (Don't reach for a
one-footed balancing pose — these are chest-up portraits, so feet never show.)
*Muted sage and pearl.*

**10 · `imagegen` — the image models** (`x/flux2-klein`, `x/z-image-turbo`)
The artist of the troupe: holds a glowing paint palette, a brush tucked behind
its antenna, and light refracting into a prism-rainbow across its chassis —
"flux" as flowing light. *Rainbow-prism accents over warm neutral.*

## Lessons from the first batch

Three things went wrong generating granite/cohere/vision. Guard against them:

1. **Demand a pure black background, explicitly.** Gemini returned Cohere on
   white with a wide margin — which reads as a glowing white box in the dark UI.
   It had to be auto-trimmed, masked and flattened onto black to be usable.
2. **Forbid readable text.** The first Cohere's "many scripts" halo spelled out
   the word DREAM. Ask for *decorative, unreadable* glyphs, and add a negative
   (`--no text, letters, words`) if the tool supports one.
3. **Name the bezel warm.** Say "warm gold and copper"; left unspecified, tools
   drift to cool silver, which reads as foreign beside the others.

Also remember these are **chest-up portraits** — anything below the ribcage
(feet, stance, legs) will be cropped out, so don't build a concept on it.

## Prompt template

Paste into an image generator, replacing the bracketed part:

> A cute retro-futuristic robot portrait, chest-up, centered, facing forward.
> [CHARACTER CONCEPT AND PALETTE FROM THE LIST ABOVE]. The robot's face is a dark
> rounded rectangular screen showing simple glowing dot-matrix eyes (curved,
> happy) and a small smile. Behind it: deep magenta velvet stage curtains, and a
> large heart outline made of glowing round marquee light bulbs framing the
> robot's head. Warm rim lighting from the bulbs, soft bloom, shallow depth of
> field. Polished glossy 3D render, painterly, charming and friendly. Framed in
> a thick rounded-square **warm gold and copper** metallic bezel like an app
> icon. The area outside the rounded corners is **pure black, edge to edge — no
> white background, no margin, no drop shadow.** No readable text, letters or
> words anywhere. Square 1:1 composition.

## Wiring a finished avatar

1. Save as `src/assets/model-avatar-<family>.webp` (512 × 512).
2. Import it in `src/lib/modelAvatars.ts`.
3. Swap it into `MODEL_AVATAR_ASSETS` in place of `modelAvatarGeneric`.

Family detection already exists in `getModelFamily` (`src/lib/modelOrigins.ts`)
and is covered by `tests/modelFamily.test.mjs` — no other change is needed.

## Not getting custom art

Community fine-tunes (`zephyr`, `vicuna`, `openhermes`, `nous-hermes2`,
`neural-chat`, `starling-lm`, `orca-mini`, `wizardlm2`, `mistral-openorca`)
intentionally keep the generic robot. They aren't distinct vendors, and mapping
them onto a base family would mislabel their organization in the "By" column.
