---
name: RigMatch
description: A 1974 broadcast studio rendered in software — warm, theatrical framing around measurements that stay exact.
colors:
  bg: "#171523"
  panel: "#211b2b"
  panel-2: "#2d2638"
  line: "#5b4e62"
  line-bright: "#8b7588"
  text: "#efe5dc"
  text-strong: "#fff9ef"
  muted: "#b9aaa2"
  pink: "#e37185"
  gold: "#efbc5a"
  green: "#95b46a"
  blue: "#69a7b7"
  red: "#d9674f"
typography:
  display:
    fontFamily: "Segoe UI, Inter, system-ui, sans-serif"
    fontSize: "clamp(24px, 3.4vw, 44px)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "normal"
  headline:
    fontFamily: "Segoe UI, Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.08em"
  metric:
    fontFamily: "Cascadia Mono, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
rounded:
  sm: "7px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  xxl: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  base: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  xxl: "16px"
  gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "#24170f"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  button-primary-pill:
    backgroundColor: "{colors.gold}"
    textColor: "#27190a"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "rgba(255, 249, 239, 0.07)"
    textColor: "{colors.text-strong}"
    rounded: "9px"
    padding: "0 10px"
    height: "30px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    typography: "{typography.label}"
  chip-active:
    backgroundColor: "{colors.gold}"
    textColor: "#27190a"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "14px"
  card-selected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "14px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0"
  input:
    backgroundColor: "#0b1013"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "30px"
  table-header-cell:
    backgroundColor: "rgba(45, 38, 56, 0.9)"
    textColor: "{colors.text-strong}"
    rounded: "0"
    padding: "10px"
    height: "42px"
  table-row-hover:
    backgroundColor: "rgba(239, 188, 90, 0.1)"
    textColor: "{colors.text}"
    padding: "10px"
    height: "40px"
---

# Design System: RigMatch

## Overview

**Creative North Star: "The 1974 Broadcast"**

RigMatch looks like a daytime television studio that was built in 1974 and has been running ever since. Not a pastiche of one — an actual one, lit and warm and slightly worn. The palette is a deep plum auditorium under stage light, with a gold that never changes no matter which theme you pick, because the bulbs above the set are the same bulbs in every episode. The themes are named for that era on purpose — Avocado Green, Mustard Yellow, Retro Teal, Velvet Chocolate — alongside Stage Plum, the default, which is the auditorium itself. Every one of them is a warm dark room, never a cool one.

The system holds one deliberate tension: **theatre frames, data leads.** The show is the container — the stage, the host, the marquee, the reveal — and it is allowed to be as theatrical as it wants at the edges. But the moment a number appears, the costume comes off. Scores, tables, speeds, and hardware readouts are rendered plainly and precisely, because the entire product is a claim that these measurements are trustworthy. A decorated measurement is a compromised one. When the show and the data disagree about a pixel, the data wins.

Interactive things are **warm and tactile** — gold-gradient pills that lift a single pixel and brighten slightly when you touch them, like the illuminated buttons on a period console. Nothing bounces, nothing springs. The response is small, immediate, and physical.

**Key Characteristics:**
- Warm dark: a plum auditorium, never slate, never neutral grey
- Gold is the constant across all five themes; it is the stage light itself
- Two densities in one product: the wizard runs roughly 1.4–2.8× looser than the Advanced table
- Pills for choices, soft rectangles for containers
- Type runs entirely in the 600–950 weight range; there is no light or regular voice
- Theatrical effects are confined to the stage; the data surfaces stay plain

**Anti-references — RigMatch must never be mistaken for:**
- **Generic dark-mode SaaS.** Slate-and-indigo, Inter everywhere, purple gradient buttons. The look every AI tool converged on.
- **Gamer RGB / cyberpunk.** Neon on black, angular clip-paths, glitch effects, monospace as a personality. The benchmarking-tool cliché, and the closest trap to fall into.
- **Enterprise BI dashboard.** Dense grey tables, default chart-library colors, no point of view. Correct and forgettable.

## Colors

A warm dark palette: a plum auditorium lit by a gold that never changes, with a coral pink for the romance premise and three functional signal colors.

### Primary

- **Heartbeat Pink** (`#e37185`): the romance signal and the app's accent. It marks the active, the selected, and the chosen — the contestant you picked, the card you're on. Its remit is broader than selection alone: work in progress, live activity, and ordinary emphasis all belong to the accent, not to gold. It is also the default value of `--primary-rgb`, the RGB triplet the whole app composites accent tints from as `rgba(var(--primary-rgb), α)`. Each theme re-points that triplet at its own accent, so pink is the default voice, not the universal one — which is exactly why accent work must stay on the accent. Moving it to gold would freeze that element at one color in four of the five themes.

### Secondary

- **Studio Gold** (`#efbc5a`): the stage light. Gold is the one color **identical in all five themes** — the marquee bulbs, the winner's halo, the primary call to action, the active wizard step. Gold means *this is the thing that won, or the thing to do next*. Nothing else may claim it.

### Tertiary

- **Avocado** (`#95b46a`): success, completion, and confirmation. A finished step, a passed check, a model that fits comfortably. Also the global keyboard focus ring.
- **Broadcast Blue** (`#69a7b7`): information and provenance. Model-family badges, counts, secondary metrics, the door to Advanced Mode.
- **Signal Red** (`#d9674f`): failure and out-of-reach. A model too large for the machine, a run that errored, a destructive action.

### Neutral

The plum ladder, three steps from the auditorium to the riser:

- **Stage Plum** (`#171523`): the page itself. The dark of the room.
- **Curtain Plum** (`#211b2b`): panels, cards, docks — every surface that sits on the page.
- **Riser Plum** (`#2d2638`): the step above a panel, for a card nested inside one.
- **Seam** (`#5b4e62`) / **Seam Lit** (`#8b7588`): dividers and borders. Seam Lit is the interactive-affordance border — inputs, filter triggers, anything you can act on.
- **Cream** (`#efe5dc`): body text. Warm, never pure white.
- **Cream Bright** (`#fff9ef`): headings, values, and anything that must read as the strongest thing in its container.
- **Dust** (`#b9aaa2`): secondary and de-emphasized text, placeholders, disabled labels.

### Named Rules

**The Constant Gold Rule.** Gold is `#efbc5a` in all five themes, without exception. Themes may re-point the accent, the background, and the neutrals; gold is the stage light and the stage light does not change between episodes. A theme that recolors gold has broken the set.

**The Gold Is the Verdict Rule.** Gold marks exactly two things: the thing that won, and the single next action. A screen with two gold elements competing has one too many. If everything is lit, nothing is.

**The Warm Dark Rule.** Every background in every theme is a warm dark — plum, olive, or chocolate. No cool greys, no blue-blacks, no `#0f172a`. The moment a surface reads as slate, the room has become a SaaS dashboard.

## Typography

**Display Font:** Segoe UI (falling back to Inter, then system-ui)
**Body Font:** Inter (falling back to Segoe UI, then system-ui)
**Label/Mono Font:** Cascadia Mono (falling back to Consolas)

**Character:** Deliberately unglamorous system type doing theatrical work through weight and case rather than through a display face. The whole system runs heavy — no weight below 600 is declared anywhere — so hierarchy comes from size and case, not from the contrast between light and bold. `--display` and `--ui` resolve to the same two families in swapped order; the distinction is semantic, marking which text is *announcing* something.

### Hierarchy

- **Display** (900, `clamp(24px, 3.4vw, 44px)`, line-height 0.98): the stage. The show sign, the round question, the winner's name. Fluid, because it is sized to the stage and not to the reading column. Frequently uppercase.
- **Headline** (700, 22px, line-height 1.1): panel and modal titles, the setup heading, the brand block. The strongest thing inside a container.
- **Title** (700, 17–19px, line-height 1.25): contestant card names, door labels, the question being asked. Where the wizard does its talking.
- **Body** (400, 12–13px, line-height 1.35): running text, table cells, descriptions. 12px in Advanced Mode, 13px in the wizard — the density split is real and intentional. Cap measure at 46–72ch; the winner explanation caps at 46ch and the compatibility copy at 72ch.
- **Label** (900, 10px, uppercase, letter-spacing 0.08em): eyebrows, badges, chips, step names. The single most systematic pattern in the codebase and the workhorse of the whole visual voice.
- **Metric** (Cascadia Mono, 10–12px): score pills, question IDs, model IDs, host addresses. Monospace is how numerals align, since the system defines no tabular-figure setting.

### Named Rules

**The Two Registers Rule.** The wizard and the Advanced table are deliberately different typographic densities: 13–17px on a 28px gutter versus 12px in a 40px row on 10px padding. This is not drift to be normalized. Do not make the wizard denser or the table looser to "unify" them — they serve different people doing different jobs.

**The Heavy-Only Rule.** Nothing in the interface is set below weight 600. Labels are 900. If a new element needs to recede, use Dust (`#b9aaa2`) or a smaller size — never a lighter weight, which will read as a rendering bug against everything around it.

**The Eyebrow Rule.** Small uppercase labels carry tracking (`0.08em` is the canonical value, `0.1em` for gold eyebrows). Uppercase without tracking at 10px is a legibility failure. This convention is currently applied inconsistently in the incumbent code; new work applies it every time.

## Layout

**The app shell** is a CSS grid with named areas — `top / menu stage / lineup / ticker` — at `height: 100vh`, `padding: 18px`, `gap: 16px`, with a `minmax(172px, 196px)` sidebar. Simple Mode collapses the whole shell to a single `stage` area and fills it. There is no global max-width wrapper; the app is full-bleed and constrains width per surface with `width: min(Npx, calc(100vw - Npx))`.

**Spacing** runs on a dense 2px-step scale rather than a 4pt or 8pt grid: **4 / 6 / 8 / 10 / 12 / 14 / 16**, with 8px and 10px dominant. The odd steps (3, 5, 7, 9) are systematic, not accidental — recurring pairs like `5px 7px` and `9px 14px` appear throughout Advanced Mode. The wizard uses the top of the scale plus a 28px page gutter.

**Density is two-tiered and deliberate.** An Advanced table cell is 10px padding in a 40px row at 12px type with hairline borders and `white-space: nowrap`. A wizard contestant card is 14px padding in a 16px grid gap inside a 28px gutter at 13–17px type. Roughly 1.4–2.8× looser on every axis. Preserve the gap.

**Responsive behavior is desktop-first** — every media query is `max-width`; there are no `min-width` queries. The meaningful breaks: **1280px** (wizard step labels drop to icons, card grid 3→2), **1240px** (top deck reflows), **920px** (shell stacks to a single column, side menu goes multi-column), **900px** (wizard card grid 2→1), **640px** (modals top-align and go full-width), **520px** (side menu single column). Two height breaks — **840px** and **780px** — tighten the shell and release its fixed height for short windows.

### Named Rules

**The Single Breakpoint Set Rule.** The incumbent code contains 17 distinct width breakpoints, with the same conceptual "tablet" break written as 920px in five places and 900px in two. New work uses **1280 / 920 / 640** and does not invent a new value. A layout that needs a break at 1247px is a layout with a sizing problem.

**The No-Fixed-Height Rule.** Below 1200px wide or 780px tall, the shell must release `height: 100vh` and become scrollable. A window smaller than the design target scrolls; it never clips.

## Elevation & Depth

**Depth comes from the plum ladder; shadow is reserved for genuine lift.** Stage Plum is the room, Curtain Plum is a surface in it, Riser Plum is a surface on that surface. Three steps, and three is enough — a fourth means the hierarchy is wrong, not that a tone is missing.

Shadow appears only where something actually floats above the page: docks, modals, toasts, popovers, and the active element the user is currently acting on. It is never ambient decoration on a resting surface.

> **Note on the incumbent implementation.** The code currently diverges from this: borders outnumber shadows roughly 7:1, `--panel-2` is used only five times across the entire codebase, and surface tone is improvised through 323 hardcoded `rgba()` backgrounds and 95 `color-mix()` calls rather than stepped through the ladder. The rule above is the intended direction; new work follows it, and refactors move toward it rather than adding more one-off tints.

### Shadow Vocabulary

- **Dock** (`box-shadow: 0 18px 42px rgba(7, 5, 12, 0.42)` — the `--shadow` token): the only genuinely ambient shadow. Reserved for top-level floating containers: the chat dock, the top deck, the stage content, the wizard shell.
- **Lift** (`box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4)`): a hard, spread-less drop used on lit and active elements — filled meter segments, the primary button, top-tier badges, emissive dots. Structural, not ambient.
- **Pill lift** (`box-shadow: 0 5px 12px rgba(0, 0, 0, 0.25)`): the wizard's softer equivalent, on the active step and the gold pill.
- **Modal** (`box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62)`, often with a `0 0 0 1px` gold or hairline ring): the overlay tier. Very large blur, near-black, always paired with a ring.
- **Hairline** (`box-shadow: inset 0 0 0 1px rgba(255, 249, 239, 0.06)`): an inner 1px rim in Cream Bright at low alpha, used to define a material edge without a border. Always the second half of a stack, never alone.
- **Stage bloom** (`box-shadow: 0 0 70px rgba(239, 188, 90, 0.2)`): gold light spilling off the stage. Confined to the stage, the winner's halo, and the marquee. Never on a data surface.

### Named Rules

**The Lift-Only Rule.** A shadow means the element is above the page — floating, active, or currently being acted on. A resting surface gets a tone step, not a shadow. If you cannot say what the element is floating *above*, delete the shadow.

**The Glow Stays On Stage Rule.** Gold bloom, spotlight cones, and footlights belong to the stage, the reveal, and the marquee. A table, a score readout, a settings panel, or a form field never glows. This is the "theatre frames, data leads" principle expressed in light.

## Shapes

The form language is **pills for choices, soft rectangles for containers**.

Anything the user picks from a set is a full pill (`999px`): dream-use chips, wizard steps, the primary call to action, the Back control, capability tags, fit verdicts, size badges. Anything that holds content is a soft rectangle: panels and sub-cards at 7–12px, the wizard's cards and shell at 16–18px, avatar frames at 8–14px scaling with the avatar.

The two-register split from Layout appears here too: the wizard rounds more generously (16–18px) than Advanced Mode (7–12px). Circles are reserved for genuinely round things — status dots, marquee bulbs, step marks, the winner's trophy medallion.

Borders are hairlines. The interactive border is Seam Lit; the structural border is a low-alpha Cream Bright (`rgba(255, 249, 239, 0.08)`); the accent border is the theme accent at 0.4–0.6 alpha. Avatar frames carry a gold hairline at `rgba(239, 188, 90, 0.42)`, which is what makes the contestant portraits read as framed publicity stills rather than as cropped images.

### Named Rules

**The Pill Means Pick Rule.** If it is a pill, it is a choice — selectable, toggleable, or the action to take. A pill that is purely informational and cannot be acted on is a miscue; use a soft rectangle or plain text.

## Components

### Buttons

- **Shape:** softly rounded in Advanced Mode (10px), fully pilled in the wizard (999px).
- **Primary:** a warm gold gradient (`linear-gradient(180deg, #f8d681, #efbc5a)`) with a gold hairline border at 0.72 alpha and near-black text (`#24170f`). 34px tall on 14px horizontal padding in Advanced Mode; 11px × 22px in the wizard, scaling to 15px × 34px for the Setup hero. Uppercase, weight 800–900.
- **Hover:** `translateY(-1px)` plus `filter: brightness(1.04)`, over 0.12s. Tactile and small — the button lifts toward you, it does not grow or glow.
- **Press:** two idioms, chosen by what the control does on hover. A control that lifts returns to rest when pressed (`translateY(0)`, `brightness(0.97)`); a control that is flat at rest pushes down (`translateY(1px)`, `brightness(0.95)`). Press is instant — no transition — because feedback the user is still holding should not lag.
- **Secondary:** a Cream Bright wash at 0.07 alpha with a 0.28-alpha border, 30px tall, 9px radius. Every row action and toolbar control in Advanced Mode.
- **Ghost:** transparent with a faint border, pilled; the wizard's Back control. Hovering shifts the border toward gold.
- **Danger:** Signal Red border and text on a near-black fill.
- **Disabled:** `opacity: 0.48` (0.45 in the wizard) plus `cursor: not-allowed`, and the shadow is removed.
- **Focus:** a 2px Avocado outline at 2px offset — the global focus treatment for the whole app.

### Chips

- **Style:** pilled, 8px × 14px, transparent-to-faint fill with a Cream Bright border at 0.16 alpha, label typography (weight 700–900).
- **Active:** the gold gradient with near-black text and weight 900 — the same treatment as the primary button, because in the wizard a selected chip *is* a committed choice.
- **Read-only variants** (capability tags, model-family badges, fit verdicts, size badges) use the accent at low alpha: a 0.26–0.38-alpha border over a 0.08–0.12-alpha fill, in the color that carries the meaning — Avocado for a comfortable fit, Broadcast Blue for good, Studio Gold for tight, Signal Red for out of reach.

### Cards / Containers

- **Corner Style:** 16px in the wizard, 12px for Advanced panels, 7px for sub-cards nested inside them.
- **Background:** Curtain Plum for a panel on the page; Riser Plum for a card inside a panel.
- **Shadow Strategy:** none at rest. The Dock shadow only on top-level floating containers. See Elevation & Depth.
- **Border:** a hairline in Seam, or none where the tone step alone separates the surfaces.
- **Internal Padding:** 14px in the wizard, 10–12px in Advanced Mode.
- **Selected:** a 2px Heartbeat Pink border plus a 3px pink ring at 15% alpha — the strongest selection affordance in the system, and correctly so, since picking contestants is the wizard's central act.

### Inputs / Fields

- **Style:** a near-black well (`#0b1013`) inside a Seam Lit hairline, 30px tall (38px for selects), 10px radius, Cream Bright text. Placeholders in Dust.
- **Focus:** a 2px Avocado outline at 2px offset.
- **Composite fields** (the model search) use a three-column grid — icon, field, clear button — with the border on the wrapper and the inner input transparent.

### Navigation

- **Side menu:** a 16px-radius panel of 40px items on a near-black fill, each a four-column grid of index, icon, label, and count. Active and hover swap the fill to Curtain Plum and turn the icon and label Avocado. Labels are 12px weight 900; the trailing count is 10px uppercase in Dust.
- **Wizard rail:** five pills across the top — `setup / pick / download / compare / winner`. The active step is the gold gradient with a lift shadow; completed steps are Avocado at 10% fill with a 50% border; locked steps are a near-transparent Cream Bright wash at reduced contrast with `cursor: default`. Below 1280px the labels drop and the rail becomes icon-only marks.

### Tables

- **Header:** sticky, Riser Plum at 0.9 alpha, Cream Bright text at 11px, 42px tall, 10px padding. Sortable headers are buttons filling the cell; the sorted column is signalled by an Avocado label and caret — there is no background tint on the sorted column.
- **Body:** 40px rows, 10px padding, 12px text, `white-space: nowrap` with ellipsis, hairline borders in Cream Bright at 0.08 alpha.
- **Row hover and selection:** a Studio Gold wash at 10% alpha.
- **Out of reach:** rows for models the machine cannot run drop to `opacity: 0.72` rather than being hidden — the user sees what exists and why it is dimmed.

### The Stage (signature)

The Speed Dating stage is the system's one fully theatrical surface, and it earns its complexity:

- **The proscenium** layers a warm top wash and a pink radial bloom over a plum fill, with an inner rim at 18px inset.
- **The footlights** are a `::before` apron across the bottom 34%, radius `50% 50% 0 0` — that asymmetric radius is what makes it read as a curved stage lip rather than a gradient.
- **The marquee** is 22 individually positioned 8px bulbs around the perimeter, each glowing at `0 0 15px rgba(255, 214, 111, 0.92)`, animating scale and opacity on a 1200ms alternate loop with odd bulbs delayed 380ms to imitate a chase-light sign.
- **The host spotlight** is a single radial-gradient cone, no animation.

This vocabulary is confined to the stage, the winner reveal, and the wizard's compare step. It does not travel.

### Contestant Portraits (signature)

Model avatars are 512×512 illustrated robot portraits following a documented house style (`docs/avatar-art-direction.md`) in which **every robot embodies its model's name, logo, or etymology**. In the interface they are framed by a gold hairline at 0.42 alpha over a Curtain Plum backing, at 28px / 36px / 42px / 88px with radii from 8px to 14px, plus a soft drop and an inset hairline. The winner's portrait takes a triple gold halo (`0 0 0 3px`, `0 0 28px`, `0 0 60px`). Some families override the frame color to their own brand hue.

### Motion

Two vocabularies, deliberately separate:

- **Interaction** runs at **0.12s or 0.15s** on the default `ease` curve — the only easing in the transition system. Transitions animate background, border-color, transform, and filter. Nothing else.
- **Ambient loops** run 0.9–1.6s on `ease-in-out`, for the things that are alive on the set: marquee bulbs, contestant bobs, the typing dots, the running-benchmark pulse.

The image treatment across the app is one reusable recipe: a photographic banner with a horizontal scrim (transparent at the left, 0.9 alpha at the right) plus a vertical scrim, text right-aligned into the darkest end with a soft text-shadow, framed by a gold hairline at 16px radius. Crop focus varies per surface; the recipe does not.

## Do's and Don'ts

### Do:

- **Do** keep Studio Gold (`#efbc5a`) identical across every theme, and spend it on exactly two things per screen: what won, and what to do next. Composite its tints from `rgba(var(--gold-rgb), α)`, the triplet form, rather than a literal `rgba(239, 188, 90, α)`.
- **Do** build depth from the plum ladder — Stage Plum for the room, Curtain Plum for a surface, Riser Plum for a surface on a surface — and reach for `--panel-2` before inventing another `rgba()` tint.
- **Do** keep the two densities apart: 12px type in 40px rows on 10px padding for Advanced Mode, 13–17px type on 14–28px spacing for the wizard.
- **Do** put tracking on every uppercase label (`0.08em` at 10px). Uppercase without tracking at small sizes is a legibility failure.
- **Do** use a pill for anything the user picks, and a soft rectangle for anything that holds content.
- **Do** give every interactive element a visible focus ring — the global 2px Avocado outline at 2px offset — and a press state, not just a hover.
- **Do** dim what the machine cannot run (`opacity: 0.72`) rather than hiding it. Showing the constraint is part of the product's honesty.
- **Do** frame contestant portraits with the gold hairline. It is what makes them read as publicity stills from the show rather than as generic avatars.
- **Do** use monospace for numerals that must align, since the system defines no tabular-figure setting.
- **Do** add every new animation to a `prefers-reduced-motion` block in the same commit that introduces it.

### Don't:

- **Don't** put stage lighting on a data surface. No gold bloom, spotlight, or glow on a table, a score readout, a form, or a settings panel. Theatre frames; data leads.
- **Don't** use a shadow on a resting surface. If you cannot name what the element floats above, it does not get one.
- **Don't** introduce a cool grey, slate, or blue-black background in any theme. Every RigMatch dark is a warm dark.
- **Don't** set type below weight 600, and don't add a fourth plum step. To recede, use Dust or a smaller size.
- **Don't** invent a new breakpoint. Use 1280 / 920 / 640; the incumbent 17-value sprawl is drift, not a system.
- **Don't** hardcode a theme color as a literal hex — `#211b2b` in a component will not follow a theme switch. Reference the token.
- **Don't** invent a second name for a token that exists. `index.css` defines twenty tokens and that is the whole vocabulary: `--bg`, `--panel`, `--panel-2`, `--panel-hover`, `--line`, `--line-bright`, `--text`, `--text-strong`, `--muted`, `--primary-rgb`, `--gold`, `--gold-rgb`, `--green`, `--blue`, `--pink`, `--red`, `--shadow`, `--ui`, `--display`, `--mono`. A parallel set (`--accent`, `--surface`, `--text-secondary`, `--border`) once accumulated against names that were never defined, and every rule using them silently painted nothing. Write the real token: `rgb(var(--primary-rgb))` for the solid accent, `rgba(var(--primary-rgb), α)` for its tints, `var(--panel)`, `var(--line)`, `var(--text-strong)`.
- **Don't** give a `var()` a hex fallback. A fallback hides a missing token: an entire retired palette survived in fallbacks while the tokens beside them resolved to nothing, and no one noticed for releases. Let a missing token fail loudly.
- **Don't** normalize the wizard and the Advanced table toward each other. The density gap is the product's two-audiences principle made visible.
- **Don't** let a decorated number ship. A score, a speed, or a hardware figure is rendered plainly — the credibility of the measurement is the product.
- **Don't** reach for neon, angular clip-paths, glitch effects, or monospace-as-personality. The gamer-benchmarking-tool look is the nearest and most dangerous trap.
- **Don't** suppress a focus outline without providing a replacement treatment on the wrapper.
