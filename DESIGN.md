# Design System: RSS Lobster

## 1. Visual Theme & Atmosphere

RSS Lobster sites channel the **handmade web** — the era when personal sites had visible structure, text was king, and every page felt like someone built it by hand. Dense with content, light on decoration. The aesthetic is warm, readable, and honest: no hero images, no parallax, no JavaScript animations. Pages load instantly and get out of the way.

This is **retro web with modern rigor**. We bring back the warmth and clarity of early personal publishing — but with WCAG AA contrast ratios, responsive layout, system font performance, and touch-target compliance. The mood is: "I care about what I'm saying, not how flashy the container looks."

Every generated site is **zero-dependency vanilla HTML + CSS**. No frameworks, no build steps, no external requests. The output is the product.

## 2. Color Palette & Roles

Colors are assigned by **function**, not decoration. Every preset defines these roles:

| Role | Purpose | Example (Minimal Preset) |
|------|---------|--------------------------|
| **Text** | Primary body copy | `#222222` — soft black, easy on eyes |
| **Background** | Page canvas | `#FFFFF0` — cream, takes the clinical edge off white |
| **Accent** | Emphasis, highlights | `#0000EE` — classic web blue |
| **Link** | Unvisited hyperlinks | `#0000EE` — the color the web trained us on |
| **Visited** | Visited hyperlinks | `#551A8B` — purple, distinct from unvisited |
| **Muted** | Timestamps, metadata, secondary text | `#666666` — quiet but legible |
| **Border** | Separators, card edges, horizontal rules | `#CCCCCC` — visible structure |

### Preset Palettes

**Minimal** (personal homepage, circa 1999–2003): Cream background, classic blue links, purple visited. Warm and familiar.

**Brutalist** (raw HTML energy): Pure black on pure white. Red accents (`#CC0000`) for things that demand attention. Zero decoration.

**Magazine** (literary webzine): Aged paper background (`#FAF6F1`), dark red accents (`#8B0000`). Editorial, authoritative.

**Terminal** (BBS/shell): Amber phosphor (`#FFB000`) on near-black (`#0D0D0D`). Cyan (`#00CCCC`) for links. VT220 authenticity.

All palettes meet **WCAG AA contrast minimums** for their text/background combinations.

## 3. Typography Rules

**System fonts only.** No external font requests, no FOIT, no layout shift. Fonts render instantly because they're already on the user's device.

| Stack | Used For | Fonts |
|-------|----------|-------|
| **System Serif** | Body text (Minimal, Magazine) | Charter, Bitstream Charter, Sitka Text, Cambria, serif |
| **System Sans** | Headings (Minimal), meta text | system-ui, -apple-system, Segoe UI, sans-serif |
| **System Mono** | Body + headings (Terminal), code blocks | SFMono-Regular, Consolas, Liberation Mono, Menlo, Courier, monospace |
| **Times** | Body + headings (Brutalist) | Times New Roman — the browser default, the font of the raw web |

### Weight & Sizing

- **Headings**: Bold weight, tight `letter-spacing: -0.02em` for h1, balanced text wrapping
- **Body**: Regular weight, generous line-height (1.5–1.7 depending on preset)
- **Font size**: 15–20px base depending on preset; all optimized for sustained reading
- **Hierarchy**: Created through font-family contrast (serif body + sans heading) and size, not through color or weight tricks

## 4. Component Stylings

### Buttons & Interactive Elements
- **Shape**: Sharp corners (`border-radius: 0px`) — rectangles are honest, retro web uses no rounded corners
- **Touch targets**: Minimum 44×44px per WCAG 2.5.8
- **Focus**: 2px solid outline in link color with 2px offset — visible, not decorative

### Cards / Containers
- **Corners**: Zero border-radius across all presets
- **Background**: Inherits page background — no card elevation theater
- **Borders**: 1px solid in the border color role — visible structure, not shadow
- **Link cards**: Border highlights to link color on hover/focus

### Links
- **Always underlined** — underlines are the universal hyperlink affordance
- **Thickness**: 1px default, 2px on hover — subtle interaction feedback
- **Offset**: `text-underline-offset: 0.15em` — breathing room between text and underline
- **Visited state**: Always visually distinct — users deserve to know where they've been

### Inputs / Forms
- Minimal styling, inherits document fonts and colors
- Borders use the border color role
- Background matches page background

### Tags
- Small (`0.75rem`), quiet, inline-block
- 1px border, heading font family
- Muted color — tags support content, they don't compete with it

### Articles
- Bottom border separates entries (except the last)
- `2.5rem` vertical rhythm between posts
- Timestamps and metadata in muted color, smaller size, heading font

## 5. Layout Principles

**Single-column, content-width constrained.** No sidebars, no grids, no multi-column layouts. The content is the layout.

- **Max-width**: 580–720px depending on preset (optimized for line length per font choice)
- **Centered**: `margin: 0 auto` — content floats in the middle of the viewport
- **Padding**: `2rem 1rem` body padding; `1.5rem 0.75rem` on mobile
- **Whitespace**: Generous — `1.5em` top margin on headings, `1em` bottom margin on paragraphs, `2rem` around horizontal rules
- **Responsive**: Single breakpoint at 480px — font size reduces by 1px, padding tightens
- **Print**: Full width, black on white, URLs shown after links, navigation hidden

### Spacing Rhythm

Content uses a consistent vertical rhythm based on `rem` and `em` units:
- Headings: `1.5em` above, `0.5em` below
- Paragraphs: `1em` below
- Articles: `2.5rem` bottom margin and padding
- Horizontal rules: `2rem` above and below
- Lists: `1.5em` left padding, `0.25em` between items

## 6. Accessibility Standards

Accessibility is not optional. Every generated site includes:

- **WCAG AA contrast** on all text/background combinations
- **44×44px touch targets** on all interactive elements (WCAG 2.5.8)
- **Skip navigation link** — hidden until focused, then visible
- **Reduced motion support** — `prefers-reduced-motion: reduce` disables all animation
- **Semantic HTML** — `<article>`, `<header>`, `<nav>`, `<footer>`, `<time>`
- **Visible focus indicators** — 2px outline on all focusable elements
- **Underlined links** — never rely on color alone to indicate a link
- **Distinct visited state** — always visually separate from unvisited links

## 7. Customization

### Using Presets

Choose a preset during `rsslobster init`. Each preset provides a complete, tested design:

| Preset | Vibe | Best For |
|--------|------|----------|
| `minimal` | Classic personal homepage | General-purpose blogs and microblogs |
| `brutalist` | Raw, no-nonsense | Text-heavy sites, developers |
| `magazine` | Literary, editorial | Long-form writing, essays |
| `terminal` | Hacker, retro CRT | Technical blogs, nostalgia |

### Overriding Styles

Pass `overrides` in your `rsslobster.json` style config to tweak any CSS variable without abandoning your preset foundation. Every property in the color palette, typography, and layout sections above can be overridden individually.

### Bringing Your Own DESIGN.md

This file itself is customizable. Fork it, change the palette, adjust the typography rules, redefine the component styles — then drop your version into the project root. The presets provide the foundation; your DESIGN.md captures the intent.

Keep these principles consistent:
- **TDD-focused UX** — design decisions are testable assertions (contrast ratios, touch target sizes, font size ranges)
- **Zero dependencies** — vanilla HTML, CSS, JS only in output; no frameworks, no CDN links
- **Best practices** — WCAG AA, semantic HTML, progressive enhancement, system fonts
