# Wispucci — interactive demo

> An interactive demo / prototype site for **Wispucci**, an EdTech AI tutoring product
> for young learners (Gen Z + young Millennials).

This is a single-page static prototype that walks a user through the full product
flow: Welcome → Subject → Topic → Skill level → Lesson generation → Lesson with
AI companion (Wispucci orb) → Celebration.

It is intentionally a static, self-contained prototype (no build step, no
framework) so it can be iterated on visually as fast as possible.

## Stack

- HTML / CSS / JS (no build, no bundler)
- [GSAP](https://gsap.com/) — orb animations, FLIP transitions, generation timeline, celebration overlay
- Custom Canvas — embers background, generation particle stream, celebration ember rain
- SVG — orb face (eyes, eyebrows, mouth, eye-shine, cheeks) — state-driven via
  CSS class on the `.orb` element

## Run locally

No install. Just serve the directory:

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

…or open `index.html` directly in a browser (most browsers will work, but a few
features like cache-busting query params behave better with a local server).

## File layout

```
.
├── index.html      # all markup (welcome → onboarding → lesson → overlays)
├── style.css       # design tokens (:root) + every screen + orb states + animations
├── app.js          # view switching, orb state machine, embers canvas,
│                   # generation timeline, celebration FX, Explică-mi popover
├── README.md
└── .gitignore
```

## Design system

**Palette (v5 — Midnight Violet + Light Gold):**

| Token | Hex | Role |
|---|---|---|
| `--bg-base` | `#210124` | Midnight Violet — main background |
| `--bg-card` | `#2A0930` | card / panel surface |
| `--bg-elev` | `#340F3C` | elevated surface |
| `--accent` | `#EFDD8D` | Light Gold — primary CTA, active tabs, highlights |
| `--accent-soft` | `#F4FDAF` | Lime Cream — hover, secondary accents, primary text |
| `--accent-deep` | `#C9B86A` | gradient bottoms, deep gold |
| `--accent-spark` | `#FFFFD9` | brightest cream highlight (orb gradient peak) |
| `--line` | `#65743A` | Fern — borders that have life, dividers |
| `--line-soft` | `#2A2F18` | faint olive line |
| `--text` | `#F4FDAF` | primary text |
| `--text-2` | `#D9D196` | secondary text |
| `--text-3` | `#8B8453` | muted / placeholder |

**Typography:**
- Display: Instrument Serif (italic, weight 400) — headings, accents
- Body: Inter (400 / 500 / 600 / 700) — UI and reading text
- Mono: JetBrains Mono — code blocks, labels, meta

**Orb states (8):** `idle`, `listening`, `thinking`, `speaking`,
`celebrating`, `confused`, `sad`, `happy` — switched via the `is-*` class on
the `.orb` element. Each state morphs eyes, mouth, eyebrows, eye-shine, cheeks
and the surrounding glow.

## Demo controls

- **Top-right ⭐** in lesson view → celebration overlay
- **Dev jump bar** (bottom-right, fixed) → 1-6 to skip to any view
- **Emotion buttons** (under orb on lesson view) → cycle through orb states
- **Select any text in lesson** → "Explică-mi" popover
