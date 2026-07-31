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

## What varies per family

Each avatar riffs on the vendor's identity through **body color** and **one
character motif** — the way DeepSeek's is a whale (their logo) and Qwen's is a
mint-green bot with a heart on its chest panel.

| Family | Motif direction | Palette |
|---|---|---|
| `granite` (IBM) | Robot carved from polished granite/stone, subtle mineral speckle, solid and dependable | Slate grey, blue-steel accents |
| `cohere` (Command-R, Aya) | Multilingual/global feel — a small globe or constellation of language glyphs orbiting the head | Coral-to-violet gradient |
| `vision` (LLaVA, moondream, MiniCPM-V) | Camera-eye robot: a prominent lens iris in place of one eye, small aperture blades | Teal and brass |
| `yi` (01.AI) | Minimal, precise robot; a subtle "01" motif etched on the chest panel | Deep indigo, silver |
| `solar` (Upstage) | Sun motif — a small radiant corona or solar-panel wing behind the shoulders | Amber, warm gold |
| `falcon` (TII) | Falcon-inspired: swept head crest suggesting a beak, wing-like shoulder plates | Desert sand, bronze |
| `starcoder` (BigCode) | Code motif — brackets or a starfield of glyphs on the chest screen | Violet, cyan |
| `smollm` (Hugging Face) | The smallest, roundest robot of the set — tiny, endearing | Soft yellow |
| `stablelm` (Stability) | Calm, balanced robot; a subtle equilibrium/level motif | Muted green, pearl |
| `imagegen` (FLUX, Z-Image) | Artist robot holding a small glowing palette or brush | Rainbow-prism accents |

## Prompt template

Paste into an image generator, replacing the bracketed part:

> A cute retro-futuristic robot portrait, chest-up, centered, facing forward.
> [FAMILY MOTIF AND PALETTE FROM THE TABLE ABOVE]. The robot's face is a dark
> rounded rectangular screen showing simple glowing dot-matrix eyes (curved,
> happy) and a small smile. Behind it: deep magenta velvet stage curtains, and a
> large heart outline made of glowing round marquee light bulbs framing the
> robot's head. Warm rim lighting from the bulbs, soft bloom, shallow depth of
> field. Polished glossy 3D render, painterly, charming and friendly. Framed in
> a thick rounded-square metallic bezel like an app icon, pure black outside the
> rounded corners. Square 1:1 composition.

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
