# Design Brief · Arduino Emotion-Detection Live Display Page

> **v4 (currently in effect): "Emotional Weather" — a light, avant-garde direction** — porcelain-white `#FAFAF7` base + ink `#141412`; a full-page living pastel color field (4 drifting light blobs, blur 80px, quadrant-mapped: excited coral `#FFA08C` / anxious lavender `#BEA0EB` / low powder blue `#A0BEE6` / calm mint `#A0E1C8`); Archivo Black giant headline; the mood verdict word shares the headline's saturated quadrant text colors (`#E0573A`/`#7A4FD0`/`#3A6FC0`/`#1F9E78`). All-English UI. v1–v3 were all rejected and are kept below for the archive only.

## v4 Final Implementation Parameters (finalized 2026-07-20, consistent with the code)

**Font stack**: Archivo Black (giant headline + mood verdict word) / Fraunces italic (the single serif accent line "your body is quietly repainting this sky.") / Space Grotesk (display) / Inter (body) / JetBrains Mono tabular-nums (readouts). Google Fonts loads the full Fraunces variable range `ital,opsz,wght@0/1,9..144,100..900`.

**First-screen layout (everything at a glance)**: left column, 5 grid columns = eyebrow (EMOTIONAL WEATHER — REAL-TIME BIO-SIGNAL + LIVE light) → Archivo Black headline (EMOTIONAL in ink / WEATHER in quadrant color, clamp 44–80px) → serif accent line → sensor description row → RIGHT NOW oversized verdict word (STEADY/EXCITED/TENSE/LOW/CALM, SENSING while calibrating) → three signal rows (label + mono large number + waveform, separated by hairlines) → VALENCE/AROUSAL row; right column, 7 grid columns = borderless emotion plane fused into the color field.

**Mood verdict word = emotion particle letters**: Archivo Black uppercase; each letter independently translated + rotated, amplitude scaling with arousal: translation 1.5+|a|×5 px, rotation ±(0.6+|a|×2.4)°, 1.2s ease transition; on word change letters float in one by one (45ms stagger, 0.7s cubic-bezier(0.22,1,0.36,1), blur→sharp). Orderly when calm, shaking when excited — the type itself expresses emotional intensity.

**Emotion plane (borderless)**: cross-axis fades out at both ends, fadeLen 0.12, axis alpha capped at 0.55; inner padding pad=64 (prevents halo clipping); point smoothing τ0.9s. **Trail** = smoothed cursor position history (sampled at 60ms/0.6px, 60s window) drawn segment by segment, alpha 0.5×flowing wave (accS×0.045 − now/850), line width 3px, color interpolating toward the quadrant pastel with τ1.2s. **Cursor** = soft pastel core r9 (center alpha 1) + 13×13 rectangular dot-grid halo (step 0.17, radially expanding pulse sin(ph1×2 − rn×4), radius R=46+5sin).

**Waveforms**: midpoint-Bézier smoothed, 1.5px, alpha 0.55, quadrant color.

**Engineering**: backend stays resident on port 8100; `server/index.js` detects EADDRINUSE and silently reuses the existing instance (both the HTTP server and the WSS have error handlers; it exits 0 without dragging down the Vite instance started alongside it by dev.mjs). The legacy serial-dashboard and the duplicated "codes" copy directory have been deleted.

---

# (v1–v3 Archive · Rejected)

> Temperament: **an instrument with body temperature in a late-night lab** — a futuristic dark instrument skeleton (precision readouts, hairline grid, monochrome signal light) overlaid with a warm, human breathing rhythm (amber glow, organic smooth interpolation, micro-pulses in sync with the heartbeat). Restrained, trustworthy, alive.
> Page language: primarily Chinese, dark throughout. Low saturation. All charts hand-drawn in SVG/Canvas.

---

## 1. Color (all low-saturation, hex values given)

### 1.1 Base surface ladder (hierarchy via lightness steps + 1px hairlines, no drop shadows)

| Use | hex | Notes |
|---|---|---|
| Page canvas | `#0A0B0D` | Near-black with a hint of cool tone, the "darkroom" of the instrument dial |
| Level-1 panel surface-1 | `#121316` | Sensor panels, control bar background |
| Level-2 panel surface-2 | `#17181C` | hover / raised state (lightness change only) |
| Hairline border | `#262A31` | All 1px, replacing shadows and card borders |
| Strong hairline | `#343A44` | Input focus, emotion-plane outer frame |

### 1.2 Text ladder

| Use | hex |
|---|---|
| Primary text (headings, large readouts) | `#F7F8F8` |
| Secondary text (body, labels) | `#B8BCC4` |
| De-emphasized text (notes, units, timestamps) | `#69707A` |

### 1.3 Signal primary color (the only high-chroma color site-wide, used sparingly)

| Use | hex | Notes |
|---|---|---|
| **Signal amber** | `#FF9E40` | Current emotion point, live waveform main line, primary CTA, focus ring. Warm orange-amber — the signal-light color of a heart monitor, the meeting point of tech feel and body warmth |
| Signal glow | `#FF9E40` layered at 10%–36% opacity | Only for the current point's halo and trail decay; never used as a decorative gradient |

### 1.4 Four-quadrant zone colors (extremely low-opacity floor tint, 8%–10% opacity, complementary hues, uniformly suppressed saturation)

| Quadrant | Semantics | Base hex | Rationale |
|---|---|---|---|
| Top-right (high arousal + positive) excited/pleased | `#D9A24A` | Warm gold, same family as signal amber — "rising energy" |
| Top-left (high arousal + negative) tense/anxious | `#D85C46` | Muted coral red, a warning that doesn't sting |
| Bottom-left (low arousal + negative) low/tired | `#5F7FA8` | Grey-blue, sinking, cold, slow |
| Bottom-right (low arousal + positive) relaxed/calm | `#6FA88F` | Grey moss green, breathing, recovery |

All four colors are derived along the same saturation/lightness ladder, ensuring any two adjacent quadrants never clash. Quadrant label text uses the 90%-lightness version of its color.

### 1.5 Current point & trail

| Element | Spec |
|---|---|
| Current point core | `#FFB86B` (signal brightened one step), solid circle r=7px |
| Current point halo | Two box-shadow/glow layers: `0 0 16px rgba(255,158,64,.18)` / `0 0 32px rgba(255,158,64,.10)`, 3s breathing pulse |
| Trail | Last 60s polyline, stroke `#FF9E40`, opacity decaying from 0.55 to 0 along time, line width decaying 2px→0.5px in sync; sample points are not drawn as dots, only the line |

### 1.6 Connection status light (two states + calibration state, three colors)

| State | hex | Appearance |
|---|---|---|
| Live serial | `#FF9E40` amber | Steady small dot + slow pulse — "live data" |
| Mock demo | `#5FA8C7` grey-blue | Steady small dot, no pulse — "replay/demo", calmly distinct from live |
| Baseline calibrating (first 30s) | `#D9A24A` warm gold | 1.2s blink + side note "calibrating xs" |
| Disconnected | `#69707A` grey | Static hollow circle |

---

## 2. Typography

### 2.1 Font stack (Chinese must be declared explicitly; a pure-Latin display font must never render Chinese headings)

```css
--font-display: "Inter", "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
--font-body:    "Inter", "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
--font-mono:    "JetBrains Mono", "SF Mono", "Menlo", "PingFang SC", "Microsoft YaHei", monospace;
```

- Google Fonts loads Inter + JetBrains Mono with `font-display: swap`; Chinese falls back to system fonts.
- All numeric readouts use `font-variant-numeric: tabular-nums` so digits don't jump during live refresh.

### 2.2 Weight/size pairings

| Role | Font | Size | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Hero headline | display | 56–64px | 600 | -0.03em (Latin only) | Negative tracking is a Latin typesetting device; Chinese keeps tracking 0 |
| Section eyebrow number | mono | 13px | 500 | +0.06em | `01 / SIGNAL SOURCE`-style numbered labels, establishing an instrument-document feel |
| Section heading | display | 32–40px | 600 | -0.02em | |
| **Large numeric readouts (HR / GSR / RMSSD)** | mono | 48–64px | 500 | 0 | tabular-nums; unit shrunk to 16px grey text on the baseline |
| Quadrant labels (excited/anxious/relaxed/low) | body Chinese | 14px | 500 | +0.1em | Wide tracking on Chinese replaces italics for emphasis |
| Body / technical notes | body | 15–16px | 400 | 0 | Line height 1.6 |
| Timestamps / axis ticks | mono | 12px | 400 | 0 | `#69707A` |

**Taboo restated: no italic Chinese anywhere; Chinese emphasis uses weight, color, and tracking — never italic.**

---

## 3. Layout (single page, five sections, fixed order)

Max content width 1280px, 12-column grid, 96px vertical spacing between sections, 24px panel padding. The dark canvas itself is the whitespace — sections are separated by the surface ladder and hairlines, not by large gaps.

1. **Hero (top of first screen, ~55vh)**: left 7 columns of text stack (eyebrow number `01 / EMOTION INSTRUMENT` + headline + one-line project description + status summary row); right 5 columns a small live summary monitor window (HR large readout + mini waveform, surface-1 panel, 7s gentle float). A 64px engineering grid overlays the background, translating slowly and linearly over 38s to create a "measurement bench" feel.
2. **Connection control bar (sticky, 56px tall)**: left = status light + mode text (live serial COMx / mock demo / calibration countdown); center = serial-port dropdown + connect/disconnect buttons; right = mock mode switch. Sticky throughout — it is the instrument's power panel.
3. **Emotion-plane hero visual (core, ~90vh)**: full content width, a large surface-1 panel containing a square Canvas emotion plane + a narrow right rail (240px) of live readouts (Valence / Arousal values + the large Chinese quadrant verdict label). The plane is the protagonist; nothing else may steal the visual focus.
4. **Sensor panels**: 3 columns (desktop), one signal each: HR (bpm) / GSR (μS) / RMSSD (ms). Each column = mono large readout + 60s mini waveform (hand-drawn Canvas polyline, signal color 2px, no fill gradient). Columns separated by hairlines — no cards inside cards.
5. **Technical notes**: two columns. Left = mapping method (Arousal = HR 0.6 / GSR 0.4 weighted, Valence = RMSSD weak proxy — **must prominently state "estimate"**); right = system architecture summary and protocol contract. Eyebrow numbering continues (`05 / METHOD`).

Mobile: everything in a single column; the emotion plane stays square and full-width, with the readout rail moved below it.

---

## 4. Emotion-Plane Visual Language (the memorable element of this page)

- **Quadrant boundaries**: no solid walls. A centered cross of two hairline axes (`#343A44` 1px); the four quadrants are floored with their zone colors at 8% opacity, letting hue transitions blend naturally through low opacity — no gradients drawn.
- **Axis treatment**: axes do not run past the plane edge, leaving 12px of breathing room at the ends; only three tick levels −1 / 0 / +1, mono 12px grey; axis names (the Chinese label followed by the Latin one, e.g. "Valence →" / "Arousal ↑") centered at the axis ends, Chinese first, Latin second.
- **Current point form**: a three-layer structure — 7px solid amber core + two static halo layers + a 3s breathing pulse ring (see §6). No label attached to the point; the quadrant verdict text appears in the right rail, keeping the plane clean.
- **Trail**: 60s decaying polyline (§1.5). The trail is "the path the emotion just walked" — the most narrative element on the page; better to shrink the point than to make the trail unreadable.
- **"Baseline calibrating" state**: the point freezes at the center while a dashed ring sweeps at a constant 12s period (stroke-dasharray animation); a 12px mono countdown "baseline calibrating 18s" overlays the plane; the waveform area keeps scrolling live (the signal is real — the mapping just isn't ready yet).
- **Plane outer frame**: 1px hairline-strong, with 12px right-angle tick marks at the four corners (like the corner marks on an oscilloscope screen), reinforcing the instrument feel.

---

## 5. Motion (keep only what is meaningful; each item includes its "why")

| Motion | Parameters | Why it exists |
|---|---|---|
| Current-point smooth interpolation | rAF 60fps, position lerp factor ~0.12 (catches up in ~300ms) | The WS delivers 1 frame per second; without interpolation the point "stair-steps". Interpolation makes motion continuous, conveying "live measurement" rather than refresh snapshots. **Core motion** |
| Current-point breathing halo | 3s ease-in-out infinite loop, glow opacity .18→.28 | An abstraction of the heartbeat rhythm — puts the page in sync with the user's heart rate; the main carrier of "warm humanity" |
| Live trail drawing | 60fps Canvas redraw, new segments fade in over 200ms | Visualization of flowing data; without it the plane is a static scatter plot |
| Waveform scrolling | 60fps, pushing right-to-left, new samples entering at the right edge | The instinctive language of an oscilloscope; direct evidence of real-timeness |
| Calibration sweep ring | 12s linear infinite, stroke-dashoffset | Communicates "the system is working but not ready yet", replacing a meaningless loading spinner |
| Grid background drift | 38s linear infinite, 64px step | Ambient micro-motion keeps the dark background from feeling "dead"; amplitude small enough not to distract |
| Hero monitor float | 7s ease-in-out, ±10px | A single "floating instrument" metaphor — the only floating element on the page |
| Entry reveal | 0.56s cubic-bezier(0.22,1,0.36,1), siblings staggered 70ms | Once at page load only, establishing a sense of order; not triggered by scrolling |
| Value changes | Mono digits replaced directly, no rolling animation; color briefly brightens 400ms when change exceeds a threshold | The digit jump itself is information; tabular-nums keeps widths stable |

**Global**: under `prefers-reduced-motion`, breathing, floating, and grid drift are disabled; data interpolation and waveforms are kept (they are function, not decoration).

---

## 6. Taboo List (explicitly excluded)

- ❌ Blue-purple gradients; any decorative gradient fills (under-waveform area fills, buttons, backgrounds — none allowed)
- ❌ Cards inside cards: sections are separated by the surface ladder + hairlines + whitespace; at most one panel layer
- ❌ Emoji icons, Font Awesome colored rounded-square icons; icons must be 1.5px-stroke linear SVG or plain text
- ❌ Meaningless hover scaling (scale-105), hover image rotation, scroll-triggered fade-in-up
- ❌ Loading spinners (the calibration state uses the sweep ring, §5)
- ❌ Marquees, parallax scrolling
- ❌ The template structure of centered Hero + dual CTAs + three-column feature cards
- ❌ Italic Chinese; pure-Latin display fonts rendering Chinese headings
- ❌ Stacked drop shadows (in dark mode hierarchy comes from the lightness ladder, not box-shadow embossing)
- ❌ A second high-chroma accent color — amber is the only signal color; all status colors stay desaturated
- ❌ Large-scale glassmorphism abuse (only the control bar may use backdrop-blur, because it floats above live data)
- ❌ Empty copy like "modern and elegant" / "clean and intuitive"; the technical notes must state real parameters (0.6/0.4 weighting, 30s baseline, 5s smoothing window, valence is an estimate)

---

## 7. Design-Rationale Summary (decision logic)

- **Dark instrument skeleton**: the data comes from real sensors, so the page should feel like a trustworthy measuring device — near-black base, mono readouts, hairline grid, numbered sections, all in service of "this instrument is telling the truth".
- **Amber as the single signal color**: the classic signal-light color of heart monitors and oscilloscopes; its warmth naturally carries a sense of body temperature and avoids the cold-blue tech template; strict scarcity of use (point, waveforms, CTA, focus) — every extra use devalues it.
- **Breathing and interpolation**: emotional data is slow, continuous, biological — the motion language is isomorphic to it (3s breathing ≈ resting heart-rate cycle); all mechanical jumps are rejected.
- **Low-saturation four-quadrant floor tint**: the four quadrants of the Russell model need a readable semantic partition, but saturated zone colors would overpower the data itself, so they are uniformly pressed down to 8% opacity, keeping the amber point the brightest element forever.
