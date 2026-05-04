---
name: Bakarr
description: A self-hosted anime library manager with a precise, neutral, and confident interface.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  sidebar: "oklch(0.985 0 0)"
  sidebar-foreground: "oklch(0.145 0 0)"
typography:
  display:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.1
  body:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.05em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "0px 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0px 10px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0px 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.none}"
    padding: "16px 16px"
---

# Design System: Bakarr

## 1. Overview

**Creative North Star: "The Vault"**

Bakarr is a secure, precise archive. Every element sits exactly where it belongs, with sharp edges and neutral tones. The anime artwork is the only color in the room. The interface does not compete for attention; it frames the content with clinical confidence.

The system rejects clutter, decoration, and warmth that does not serve a functional purpose. There are no rounded corners, no drop shadows at rest, and no chromatic accents. Density is calm but high — information is always visible, never hidden behind gratuitous whitespace. The emotional register is neutral confidence: the UI knows what it is doing and does not need to persuade you.

**Key Characteristics:**

- **Sharp geometry** — zero border radius on all surfaces. Architecture, not furniture.
- **Neutral purity** — chroma near zero everywhere. Artwork provides all color.
- **Tactile feedback** — interactive elements respond with immediate, physical state changes (translate-y-px on press, ring focus).
- **Flat depth** — elevation is conveyed through tonal shifts and 1px rings, never shadows.
- **Compact scale** — default type size is 12px (`text-xs`). UI chrome stays small so content dominates.

## 2. Colors

The palette is purely neutral. Every surface is a shade of grey, with the sole exception of the destructive role (a muted red for errors). Dark mode inverts the lightness scale while preserving zero chroma.

### Primary

- **Vault Black** (`oklch(0.205 0 0)`): The primary action fill in light mode, and the primary text color in dark mode. Used for buttons, active nav states, and headings. Its inverse is **Vault White** (`oklch(0.985 0 0)`).

### Neutral

- **Background** (`oklch(1 0 0)`): The canvas. Pure white in light mode, near-black (`oklch(0.145 0 0)`) in dark mode.
- **Card** (`oklch(1 0 0)`): Surface color for cards, popovers, and dialogs. One step above background in tonal layering.
- **Muted** (`oklch(0.97 0 0)`): Secondary surfaces — hover states, secondary buttons, subtle backgrounds.
- **Muted Foreground** (`oklch(0.556 0 0)`): Placeholder text, disabled labels, metadata, timestamps.
- **Border** (`oklch(0.922 0 0)`): The 1px ring that defines edges. In dark mode, this becomes a low-opacity white (`oklch(1 0 0 / 10%)`).
- **Ring** (`oklch(0.708 0 0)`): Focus indicator color. A mid-grey that is visible against both light and dark backgrounds.
- **Sidebar** (`oklch(0.985 0 0)`): Slightly off-white for the navigation rail in light mode.

### Destructive

- **Alert Red** (`oklch(0.577 0.245 27.325)`): The only chromatic accent color. Reserved for errors, destructive actions, and invalid states. Used sparingly.

### Semantic Status

Functional state indicators that require chroma for quick visual parsing at small sizes. These are not decorative accents; they communicate actionable status.

- **Success** (`oklch(0.62 0.17 145)`): Downloaded, up to date, completed, active.
- **Info** (`oklch(0.6 0.18 250)`): Upcoming, in progress, metadata match.
- **Warning** (`oklch(0.7 0.16 85)`): Missing episodes, pending, retry needed.

Status colors are used at low opacity backgrounds (`bg-* /10` or `/20`) with full-opacity text or icons. They never appear as large surface fills.

### Named Rules

**The Zero Chroma Rule.** Every neutral surface token must have chroma ≤ 0.01. Background, card, muted, border, ring, and sidebar tokens must be pure greys. The artwork provides all hue.

**The One Voice Rule.** Alert Red is the only chromatic accent for actions and errors. Semantic status colors (success, info, warning) are functional state indicators, not accents. Never introduce a second accent hue for decorative purposes.

## 3. Typography

**Display Font:** Geist Variable (system-ui fallback)
**Body Font:** Geist Variable (system-ui fallback)
**Label/Mono Font:** Geist Mono Variable (monospace fallback)

**Character:** Technical, compact, and unemotional. Geist's geometric clarity reinforces the vault aesthetic. Monospace is reserved for data-dense or technical contexts (logs, file paths, metadata).

### Hierarchy

- **Display** (500, clamp(1.5rem, 4vw, 2.5rem), line-height 1.1): Page titles and major section headers. Rarely used; Bakarr favors density over hero typography.
- **Headline** (500, 1rem, line-height 1.25): Card titles, modal headers, sidebar section labels.
- **Title** (500, 0.875rem, line-height 1.25): Subsection headers, table column labels.
- **Body** (400, 0.75rem, line-height 1.5): The default reading size. All body copy, descriptions, and form labels. Max line length 65ch.
- **Label** (500, 0.75rem, letter-spacing 0.05em, uppercase): Navigation groups, badges, chip text, and any UI chrome that needs to recede.

### Named Rules

**The Small-By-Default Rule.** The default font size across the application is 12px (`text-xs`). Larger sizes must be justified by hierarchy, not habit. The UI is chrome; the artwork is the content.

## 4. Elevation

Bakarr is flat. Shadows are forbidden at rest. Depth is communicated exclusively through tonal layering (background → muted → card → popover) and 1px hairline borders (`ring-1 ring-foreground/10`).

This is an architectural system, not a material one. Surfaces do not float. They abut.

### Shadow Vocabulary

- **None.** Shadows are not part of the design language.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. The only permitted depth cue is a 1px ring border or a background tone shift. If you are reaching for `box-shadow`, use `ring-1` instead.

## 5. Components

### Buttons

- **Shape:** Perfectly square corners (`0px` radius).
- **Primary:** Vault Black fill (`oklch(0.205 0 0)`), Vault White text, height 32px, padding 0px 10px. Font: 12px, weight 500.
- **Hover / Focus:** Primary darkens slightly on hover (`bg-primary/80`). Focus reveals a 1px ring (`ring-1 ring-ring/50`). Active state physically depresses (`translate-y-px`).
- **Outline:** Transparent background, 1px `border-border`, Vault Black text. Hover fills with `bg-muted`.
- **Ghost:** Transparent background and border. Hover fills with `bg-muted`.
- **Destructive:** Alert Red at 10% opacity background, Alert Red text. Hover increases to 20% opacity.
- **Sizes:** xs (24px), sm (28px), default (32px), lg (36px). Icon variants are square at each size.
- **Base constraint:** The base button class must not enforce `min-height` or `min-width` larger than the declared size variant. Size variants determine exact dimensions.

### Inputs / Fields

- **Shape:** Perfectly square corners (`0px` radius), height 32px.
- **Style:** Transparent background, 1px `border-input`, Vault Black text. Placeholder uses `muted-foreground`.
- **Focus:** Border shifts to `ring`, with `ring-1 ring-ring/50`.
- **Error:** Border and ring switch to `destructive`. Dark mode reduces destructive border opacity to 50%.
- **Disabled:** Background fades to `input/50`, cursor not-allowed.

### Cards / Containers

- **Corner Style:** `0px` radius.
- **Background:** `bg-card`.
- **Shadow Strategy:** None. Edge is defined by `ring-1 ring-foreground/10`.
- **Border:** No traditional border. The ring serves as a 1px hairline.
- **Internal Padding:** 16px horizontal, 16px vertical (12px for `size=sm`).

### Navigation

- **Style:** Sidebar rail with icon + label items. Collapsible to icon-only.
- **Typography:** 12px body weight for labels. Section headers are 12px uppercase with `tracking-widest` and `muted-foreground`.
- **Default:** Transparent background, `sidebar-foreground` text.
- **Hover:** `bg-muted` fill.
- **Active:** `bg-muted` fill with `sidebar-foreground` text. No accent color for active states — neutrality is preserved.
- **Mobile:** Sidebar becomes a drawer triggered by a hamburger toggle. Content gains a sticky top bar.

### Badge / Chip

- **Shape:** `0px` radius, height 20px, padding 0px 8px.
- **Style:** `bg-muted` fill, `foreground` text, 12px weight 500.
- **Border:** Transparent by default. Invalid state switches to `destructive`.

## 6. Do's and Don'ts

### Do:

- **Do** use `ring-1 ring-foreground/10` to define card and popover edges.
- **Do** keep all corners sharp (`rounded-none`) on every component.
- **Do** use Alert Red exclusively for errors and destructive actions.
- **Do** respect `prefers-reduced-motion` — the system already uses minimal transitions.
- **Do** let anime artwork be the only source of color and warmth on any screen.
- **Do** use Geist Mono for technical data (file paths, timestamps, logs).

### Don't:

- **Don't** use rounded corners on any UI element. Cards, buttons, inputs, badges, and dialogs must all be sharp.
- **Don't** use `box-shadow` for elevation. The Flat-By-Default Rule prohibits it.
- **Don't** introduce a second accent color. The One Voice Rule keeps Alert Red as the only chromatic element.
- **Don't** create clutter or decoration that competes with anime artwork. The UI is a frame, not a mural.
- **Don't** mimic streaming service carousels (Netflix/Disney+) — this is a library manager, not a player.
- **Don't** use generic SaaS dashboard templates with card-grid overload and blue primary buttons.
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent) on cards, list items, or alerts.
- **Don't** use gradient text (`background-clip: text`). Emphasis comes from weight and size, not decoration.
