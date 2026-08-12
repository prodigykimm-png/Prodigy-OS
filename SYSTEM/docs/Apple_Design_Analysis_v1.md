# Apple Design Analysis — Prodigy OS Alpha Direction

## Status

- Version: `alpha`
- Name: `Apple-design-analysis`
- Approval: user-approved plan input on 2026-08-10
- Role: authoritative visual source for Task 13A
- Binding rule: preserve Prodigy OS behavior, data semantics, human approval,
  Obsidian theme compatibility, accessibility, and mobile behavior.

## Design intent

A photography-first, low-chrome interface inspired by Apple's product gallery:
edge-to-edge light and dark canvases, SF Pro system typography, one Action Blue
interactive color, quiet UI chrome, and generous whitespace. Prodigy OS remains
an information and workflow product, so data-dense surfaces adapt this language
through utility cards and configurator patterns rather than pretending to be a
marketing site.

No decorative gradients. No shadows on cards, controls, navigation, or text.
The only permitted drop shadow is
`rgba(0, 0, 0, 0.22) 3px 5px 30px 0`, and only for actual product/content
imagery resting on a surface.

## Canonical tokens

```yaml
version: alpha
name: Apple-design-analysis

colors:
  primary: "#0066cc"
  primary-focus: "#0071e3"
  primary-on-dark: "#2997ff"
  ink: "#1d1d1f"
  body: "#1d1d1f"
  body-on-dark: "#ffffff"
  body-muted: "#cccccc"
  ink-muted-80: "#333333"
  ink-muted-48: "#7a7a7a"
  divider-soft: "#f0f0f0"
  hairline: "#e0e0e0"
  canvas: "#ffffff"
  canvas-parchment: "#f5f5f7"
  surface-pearl: "#fafafc"
  surface-tile-1: "#272729"
  surface-tile-2: "#2a2a2c"
  surface-tile-3: "#252527"
  surface-black: "#000000"
  surface-chip-translucent: "#d2d2d7"
  on-primary: "#ffffff"
  on-dark: "#ffffff"

typography:
  hero-display:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: -0.28px
  display-lg:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0
  display-md:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.47
    letterSpacing: -0.374px
  lead:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: 0.196px
  lead-airy:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  tagline:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.19
    letterSpacing: 0.231px
  body-strong:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.24
    letterSpacing: -0.374px
  body:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: -0.374px
  dense-link:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 2.41
    letterSpacing: 0
  caption:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: -0.224px
  caption-strong:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: -0.224px
  button-large:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1
    letterSpacing: 0
  button-utility:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: -0.224px
  fine-print:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.12px
  micro-legal:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.08px
  nav-link:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.12px

rounded:
  none: 0px
  xs: 5px
  sm: 8px
  md: 11px
  lg: 18px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 17px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px
```

## Component grammar

| Component | Required treatment |
|---|---|
| Primary button | Action Blue, white 17px text, 11×22px padding, full pill |
| Primary focus | 2px Focus Blue outline; no hidden focus |
| Secondary pill | White/transparent surface, Action Blue text/border, full pill |
| Dark utility button | Near-black, white 14px text, 8px radius, 8×15px padding |
| Pearl capsule | Pearl surface, muted ink, 14px text, 11px radius, 8×14px padding |
| Store hero button | Action Blue, white 18px/300 text, 14×28px, full pill |
| Circular icon control | Translucent chip gray, 44×44px, circular |
| Light product tile | White canvas, near-black text, 80px section padding, square edges |
| Parchment tile | Parchment canvas, near-black text, 80px padding, square edges |
| Dark product tile | Near-black tile, white text, 80px padding, square edges |
| Utility card | White, 1px hairline, 18px radius, 24px padding, no shadow |
| Configurator chip | White, 14px text, full pill, 12×16px; selected uses 2px Focus Blue |
| Search input | White, 17px text, full pill, 44px high, 12×20px |
| Floating bar | Parchment/Obsidian frosted semantic surface, 64px high, 12×32px |
| Footer | Parchment, muted ink, 64px padding, dense-link typography |

All active/pressed buttons use `transform: scale(0.95)`. Hover is not a
documented contract. State contracts are rest, focus-visible, active/pressed,
selected, loading, empty, error, and disabled.

## Layout and responsive contract

- Full-bleed tiles stack with zero gap; surface alternation is the divider.
- Text-heavy max width is approximately 980px; utility grids cap at 1440px.
- Structural spacing follows 8/12/17/24/32/48/80px.
- Product/content imagery keeps at least 40px breathing room.
- Touch targets are at least 44×44px.
- One scroll owner per Workspace remains mandatory.

| Breakpoint | Contract |
|---|---|
| `<=419px` | Single column; 28px hero; compact sub-nav |
| `420-640px` | Single column; 34px hero; imagery about 80% tile width |
| `641-735px` | 48px tile padding; wrapped fine print |
| `736-833px` | Collapsed global nav; primary CTA remains |
| `834-1023px` | Expanded nav; utility grids reduce to two columns |
| `1024-1068px` | Small-desktop gutters; 40px hero |
| `1069-1440px` | Full layout; four/five-column utility grids |
| `>=1441px` | Content locks at 1440px |

Required QA widths: 390px, 834px, 1068px, and wide desktop. Also inspect 200%
zoom, CJK text, high contrast, reduced motion, keyboard navigation, and safe
error/retry surfaces.

## Obsidian adaptation rules

1. Action Blue is the only product accent; use `#2997ff` only on dark surfaces.
2. Map canvases, ink, borders, and state roles onto Obsidian semantic variables
   with the approved values as documented fallbacks.
3. Do not force a fixed light canvas in dark or high-contrast themes.
4. Preserve SF Pro through the system stack; use Inter only as a non-Apple
   substitute when available, never as a required remote dependency.
5. Use full-bleed gallery sections only where content hierarchy supports them.
   Data-heavy areas use the utility-card/configurator grammar.
6. Do not add remote marketing photography. Existing Object imagery may use
   the one approved image shadow.
7. Keep global navigation, WorkspaceNavigation, AppShell, error recovery, and
   approval controls accessible and behaviorally unchanged.

## Known gaps

- Form validation states beyond the neutral search input require Prodigy-owned
  semantic error treatment.
- Embedded player controls remain platform-owned.
- Dynamic imagery is content, not a token.
- Dark utility-card variants must derive from Obsidian semantic surfaces.
- Backdrop blur may use `saturate(180%) blur(20px)` only where supported and
  must degrade to an opaque semantic surface.
