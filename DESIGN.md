---
name: RigMatch
description: A 1974 dating show rendered in software, "Call sheet" edition: warm, theatrical framing around measurements that stay exact.
colors:
  bg: "#1b1726"
  panel: "#241e30"
  panel-2: "#2e2740"
  stage: "#120f1b"
  line: "#3b3349"
  line-strong: "#6d5f78"
  text-strong: "#fff9ef"
  text: "#f0e7dc"
  muted: "#bdafa6"
  gold: "#efbc5a"
  gold-ink: "#241808"
  pink: "#e37185"
  accent: "#e37185"
  green: "#95b46a"
  blue: "#6ba9b9"
  red: "#ff9278"
typography:
  display:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "clamp(32px, 4vw, 56px)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.15
  heading:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  ui:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  small:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  figure:
    fontFamily: "Spline Sans Mono, ui-monospace, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  control: "8px"
  panel: "12px"
  portrait: "12px"
  hero: "16px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
    typography: "{typography.ui}"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.text-strong}"
    padding: "0"
    height: "24px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "40px"
  chip-chosen:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "40px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "16px"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    height: "44px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
---

# Design System: RigMatch

## Overview

**Creative North Star: "The 1974 Broadcast", Call sheet edition**

RigMatch looks like a daytime television studio built in 1974 and running ever since: lit, warm and slightly worn. The 2026-10 redesign, "Call sheet", kept that world and took the costume off everything that is not the show. The stage, the host, the marquee bulbs and the reveal are allowed to be theatrical. Everything you read, pick or compare is set like a production's call sheet: plain rows, sentence case, one obvious next step.

The system holds one tension: **theatre frames, data leads.** The show is the container. The moment a number appears, it is plain, mono and exact, because the product is a claim that these measurements can be trusted. When the show and the data disagree about a pixel, the data wins. When the show and getting the job done disagree, the job wins: the audience is mostly newcomers, and a screen they can follow beats a screen that performs.

**Key characteristics:**
- Warm dark rooms only. Five themes change the surfaces, the divider line and the accent; gold, green and red are the same in every one.
- Gold is the winner and the single next action. A screen has at most one gold button, and a running show has none.
- Three typefaces with fixed jobs: Young Serif for what the show says, Atkinson Hyperlegible for what you read or press, Spline Sans Mono for figures.
- Sentence case everywhere. No uppercase labels.
- Lists are rows with hairlines, not stacks of cards.

**Anti-references. RigMatch must never be mistaken for:**
- **Generic dark-mode SaaS.** Slate and indigo, Inter everywhere, purple gradient buttons.
- **Gamer RGB or cyberpunk.** Neon on black, angular clip-paths, glitch effects. The benchmarking-tool cliché, and the closest trap.
- **Enterprise BI.** Dense grey tables and default chart colours with no point of view.

## Colors

### Surfaces
- **Room** (`--bg` #1b1726, Stage Plum): the page.
- **Panel** (`--panel` #241e30): the one lift off the page. Nothing nests deeper than one panel.
- **Panel 2** (`--panel-2` #2e2740): a raised element inside a panel, a chosen chip.
- **Stage floor** (`--stage` #120f1b): the show's stage behind the photo and bulbs.

### Lines and text
- **Line** (`--line` #3b3349): dividers and row hairlines.
- **Line strong** (`--line-strong` #6d5f78): the border of anything you can act on.
- **Text strong** (#fff9ef, 14.6:1 on the room): titles and figures.
- **Text** (#f0e7dc, 12.9:1): body.
- **Muted** (#bdafa6, 8.1:1): support text.

### Signal
- **Gold** (#efbc5a, ink #241808): the winner and the single next action. Never decoration.
- **Accent** (`--accent`, pink #e37185 in Stage Plum): chosen, in progress, the selected tab, progress bars.
- **Green** (#95b46a): OK, and the focus ring.
- **Red** (#ff9278): failure. Text and outlines only, never a fill.
- **Blue** (#6ba9b9): information.

### Themes
Stage Plum (default), Avocado Green (accent #e67553), Mustard Yellow (#df708c), Retro Teal (#68a8b8), Velvet Chocolate (#e07a6a). Each redefines only `--bg`, `--panel`, `--panel-2`, `--stage`, `--line` and `--accent`. Every theme's text tokens pass WCAG AA on every surface, measured at the worst point of each gradient.

### Named rules
**The One Gold Rule.** At most one gold button on a screen. If two things want to be gold, one of them is not the next step.

**The Plain Figure Rule.** No colour, glow or badge behind a figure. Figures are mono, `--text-strong`, on a plain surface.

## Typography

**Display font:** Young Serif 400, with Georgia as fallback
**Body font:** Atkinson Hyperlegible 400/700, with system-ui as fallback
**Figure font:** Spline Sans Mono 500, with ui-monospace as fallback

All three are bundled (`src/fonts.css`); nothing is fetched at run time.

**Character:** a warm, slightly old-fashioned serif for the host's voice and the screen titles, against a typeface designed for legibility at small sizes for everything that has to be read correctly.

### Hierarchy
- **Display** (400, clamp(32px, 4vw, 56px), 1.1): the winner's name, the welcome.
- **Title** (400, 32px, 1.15): a screen's title.
- **Heading** (400, 22px, 1.2): a section in a screen.
- **Body** (400, 16px, 1.5): paragraphs, the host's explanations. Keep lines near 65 characters.
- **UI** (400/700, 14px): controls, rows, labels. The minimum for anything read or pressed.
- **Small** (400, 12px): captions and figures only.
- **Figure** (Spline Sans Mono 500, 12–56px): scores, GB, percentages, tokens per second, model tags.

### Named rules
**The Sentence Case Rule.** Labels, buttons and headings are in sentence case. A word in capitals is shouting at a newcomer.

**The 14px Floor.** Nothing a person reads or presses is under 14px; 12px is for figures and captions.

## Layout

A 4-point spacing scale (4, 8, 12, 16, 24, 32, 48). The app shell is a 56px top bar, a 32px load strip (CPU, GPU, VRAM, RAM, free disk, and "● Running …" during a run), then the screen. Advanced screens scroll inside the stage; below 780px tall or 1200px wide the whole page scrolls instead. Breakpoints at 1280, 920 and 640; the smallest window is 1024×640.

Simple Mode is a guided path (Setup, Pick, Show, Winner) with a host strip at the top and the step's single gold action in the footer. Advanced Mode is six tabs (Models, What's New, Comparison, Labs, Results, My PC) with sub-tabs in a screen-nav row; Models adds a filter column and a detail panel.

During a run, Advanced shows Simple's show over the screen (not the window), so the top bar and load strip stay in view; Minimize tucks it into a small bar.

## Elevation & Depth

Flat by default. Depth comes from the three surface steps, not shadows. A shadow is for floating things only (toasts, menus, the minimized run bar): `0 16px 40px rgba(7, 5, 12, 0.5)`. Portraits carry a thin gold frame (`0 0 0 1px rgba(239, 188, 90, 0.45)`); the winner's is `0 0 0 3px #efbc5a, 0 0 40px rgba(239, 188, 90, 0.45)`, the one glow in the product.

### Named rules
**The Floating-Only Shadow Rule.** If it does not float above the page, it casts no shadow.

## Shapes

8px for controls, 12px for panels and portraits, 16px for the hero and stage cards. No pills for choices: chips are 8px rectangles like every other control.

## Components

### Buttons
Four kinds, all `inline-flex`, centred, sentence case, 8px radius, `white-space: nowrap`, icon 16–20px with an 8px gap (`src/styles/controls.css`):
- **Gold** (`.btn-gold`): the next step. One per screen.
- **Line** (`.btn-line`): secondary actions; 1px `--line-strong` border, a light wash on hover.
- **Link** (`.btn-link`): tertiary; underlined, 24px minimum target.
- **Danger** (`.btn-danger`): destructive; red outline and text.

40px tall, 32px compact (`.btn-sm`).

### Chips and toggles
`.chip` is one choice among a few; the chosen one gets a 2px accent border and a 16% accent wash. `.check-toggle` is a box with a title and a line under it. A setting nobody can change is plain muted text separated by dots, never a chip: drawn as a pill it reads as something to press.

### Rows and panels
Lists are 44px rows with hairlines. A panel lifts one thing off the page and never holds another panel.

### Dialogs
Every modal closes with Escape and returns focus to what opened it. Every action that runs the GPU goes through one sheet, "Before the show" or "Before the test": the questions, the judge, quick or full, and what leaves the computer.

### The stage (signature)
A lit stage: the show's photograph under a marquee of bulbs, the round's topic in Young Serif, and each contestant's portrait with its state (Answering…, Done · scored 66, Up next). Below it, a plain scoreboard: progress with time left, the current model's answer scores, and Stop. The bulbs dance to the theme music when it plays and hold still under reduced motion. The Trojan stage, earned with an achievement, redresses it as a Greek vase.

### Motion
120ms for hovers, 180ms for panels. Walk-ons, bulbs, confetti and curtains are show effects, opt-in under Settings, and stop under `prefers-reduced-motion`.

### Feedback
Toasts use `role=status` with `aria-live=polite`. Logs use `role=log`. The focus ring is 2px green with a 2px offset and is never removed.

## Do's and Don'ts

### Do:
- Give each screen one gold button, for the next step.
- Set figures in Spline Sans Mono on a plain surface.
- Use rows for lists and a single panel to lift something off the page.
- Write labels in sentence case, in words a newcomer would use.
- Check text contrast in all five themes, at the worst point of any gradient behind it.
- Keep the stage theatrical and everything else plain.

### Don't:
- Put two gold buttons on a screen, or any gold on a running show.
- Draw a fixed setting as a chip or pill.
- Use uppercase labels, or text under 14px that someone has to read.
- Fill anything red.
- Nest a panel in a panel, or give a resting surface a shadow.
- Add a glow, badge or colour behind a figure.
