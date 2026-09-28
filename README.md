# NEON ARENA .IO

**English** · [Türkçe](README.tr.md)

> **An agar.io-style game** — movement, growth, devouring and map scale stay
> faithful to the classic formulas; on top of that sits a deep economy
> (coins / XP / rank), 15 skins, a 5-slot effect market and a premium HUD.
> Runs in the browser, no server, no account.

[![Play now](https://img.shields.io/badge/play-neon--arena.io.vercel.app-22d3ee?style=for-the-badge)](https://neon-arena-io.vercel.app)
[![Code](https://img.shields.io/badge/code-GitHub-181717?style=for-the-badge)](https://github.com/JaynusHUB/neon-arena-io)
[![License: MIT](https://img.shields.io/badge/license-MIT%20(code)-brightgreen?style=for-the-badge)](LICENSE)
[![CC BY-NC-SA 4.0](https://img.shields.io/badge/assets-CC%20BY--NC--SA%204.0-orange?style=for-the-badge)](LICENSE-ASSETS)

> ### 🎮 [Play now → neon-arena-io.vercel.app](https://neon-arena-io.vercel.app)
>
> Runs in the browser. No install, no account. Fully open source.

![Gameplay](docs/screenshot-gameplay.png)

<sub>Score readout + rank badge (left), live leaderboard (right), 60 bots,
6 000 food pellets, 20 000×20 000 px map.</sub>

---

## Effects

![Effects](docs/screenshot-fx-split.png)

<sub>The moment of splitting: a violet sonic ring plus 14 radial energy lines,
with planets orbiting the cell along three elliptical paths (amber / violet /
pink).</sub>

**5 slots, 8 effects** — all five can be equipped at the same time:

| Slot | Effects |
|---|---|
| **TRAIL** | Neon Trail · Star Trail · Rune Trail · **Galactic Trail** |
| **DEVOUR** | Shockwave |
| **SPLIT** | Sonic Boom |
| **AURA** | Orbit |
| **SHOOT** | Fire Pellet |

Effects are two-layered. The **signature** layer (split/devour rings, radial
lines) is a separate system with 16 fixed slots that runs **independently** of
the particle pool — it stays readable even when the pool is 240/240 full during
a food storm. The **texture** layer (debris, embers, flame trails) draws from
the game's shared particle pool. The aura produces no particles at all; it is
pure drawing.

---

## Setup

```bash
git clone <repo-url>
cd neon-arena-io
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc --noEmit` + production build |
| `npm run typecheck` | Type check only |
| `npm run test:visual` | 108-check visual/functional test suite |

**Two things are needed to run the test suite:**

```bash
npx playwright install chromium   # browser binary (the suite errors if it is missing)
npm run dev                      # must stay open in a SEPARATE terminal
npm run test:visual
```

If you would rather not download the Playwright browsers, target your system
Chrome instead: change the `chromium.launch()` call in `test/visual-test.mjs`
to `chromium.launch({ channel: 'chrome' })`.

## Controls

| Input | Action |
|---|---|
| **Mouse** | Drag the cell with the cursor |
| **Space** | Split (up to 16 pieces) |
| **W** | Eject mass |
| **K** | Skin / effect market |
| **F** | Fullscreen |
| **F3** | Virus diagnostics overlay |

---

## Highlights

- **Game logic faithful to the reference** — mass grows linearly, radius grows
  as `100×√(mass/100)`, the devour rule is ×1.15, food pull is 150 ms
- **60 fps loop independent of React** — the game advances on
  `requestAnimationFrame` and the HUD pulls its data on its own schedule; React
  never re-renders per frame
- **Zero-GC particle pool** — 240 slots created once in the constructor, no
  objects allocated at runtime
- **Single-source theme** — every colour/size/animation number lives in
  `src/theme/visualTheme.ts`; no hardcoded values in the UI
- **Layered architecture** — `logic/` never imports `render/`; the game rules
  are completely independent of drawing
- **Measurable visuals** — the 108-check suite resolves screenshots to PNG and
  counts pixels; it asserts not "exists" but **"is visible"**
- **15 skins + 8 effects + a coin/XP/rank economy** — all of it in `localStorage`

---

## Documentation

📖 **[progress.md](progress.md)** — the entire game: architecture, theme system,
cell physics, bot AI, virus mechanics, effect market, economy, HUD, test
system and a file map.

## Project structure

```
src/
├── game/Game.ts        Main loop, event consumption, test hooks
├── logic/              Game rules (pure — importing render is FORBIDDEN)
├── render/             Canvas drawing (read-only)
│   └── fx/             Effect layer (signature / texture / draw)
├── ui/                 React HUD and menus
├── skins/              Skin + effect catalogs, market
├── progression/        XP curve
├── input/              Cursor → world target
└── theme/              Single source of the visual identity
```

## Notes

- **There is no server and it makes no network requests.** There is no `fetch`
  or `WebSocket` in the code; progression data lives only in the browser's
  `localStorage`. The game works completely offline, on its own.
- **No accounts.** All progress is kept in `localStorage`.
- **It is not multiplayer.** 60 bots run through the **same** physics engine as
  the player. There is no separate code path for bots versus the player —
  everything goes through the same `updatePlayer`, `Growth` and `Devour`
  functions.
- **Skin sprites** live under `public/skins/` (~28 MB, 14 PNGs). The generator
  script is `tools/gen-skins.py`, the prompts are in `tools/SKIN_PROMPTS.md`.
- **Tests** use Playwright + system Chrome. The dev server must be running; if
  the browser binary is not downloaded, use
  `chromium.launch({ channel: 'chrome' })`.

---

## Deployment

**Vercel** needs no extra configuration — Vite is detected automatically. The
repo ships a ready-made `vercel.json`: build command, output directory, cache
headers and security headers (see below).

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # deploy
```

`framework` and `outputDirectory` are written out explicitly — Vercel would
auto-detect them, but spelling them out removes the ambiguity. The game is
entirely static: no serverless function, no database, no build step required.
A `.vercelignore` can also keep `test/` and `tools/` out of the deployment.

**Netlify / GitHub Pages**: `npm run build` → publish the `dist/` folder. It is
a single-page app, so no rewrite rules are needed.

### Security status

| Item | Status |
|---|---|
| Dependency vulnerabilities (`npm audit`) | **0** — only React ships at runtime |
| Third-party requests / SDKs / analytics | **None** — no CDN, fonts or telemetry; the game runs entirely same-origin |
| Embedded keys / passwords | **None** — `GEMINI_API_KEY` is read from the environment |
| Dangerous DOM APIs (`innerHTML`, `eval`, `dangerouslySetInnerHTML`) | **None** |
| Personal file path / absolute path | **None** |
| Content-Security-Policy | **Active** in `vercel.json` (verified against the production build) |
| Other headers | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS |
| Test hooks (`window.test_*`) | **Disabled in production** — only enabled in `DEV` mode or with `VITE_TEST_HOOKS=1` |

CSP is strict (`default-src 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`). The headers were verified on `dist/` before
publishing: the game opens, the skins load, the console is clean.

---

## License

**Code: MIT** · **Assets (skin sprites): CC BY-NC-SA 4.0**

The split license is a deliberate choice: the code should be liberal (so that
community contributions come in), while the assets stay closed to commercial
redistribution.

What MIT grants: anyone may use, modify and distribute the code commercially —
the only requirement is keeping the copyright notice. If you want contributions
and forks, this is the right choice.

For the assets, CC BY-NC-SA: the sprites were generated with an AI tool. The
terms of the tool you used in production may already restrict your own rights,
so **check the terms of the tool you use**; the NC (non-commercial) clause is a
safeguard against that uncertainty. If you do not want the NC clause, CC BY 4.0
(without NC) is also suitable.

If you want a copyleft license: **GPL-3.0** requires your derivatives to stay
open, and **AGPL-3.0** extends that to network use as well. For a browser game
like this that is generally too heavy, and it blocks corporate contributions.

License files in the repo:

| File | Scope | License |
|---|---|---|
| [`LICENSE`](LICENSE) | `src/**` source code | **MIT** |
| [`LICENSE-ASSETS`](LICENSE-ASSETS) | `public/skins/*.png`, `docs/*.png`, `tools/SKIN_PROMPTS.md` | **CC BY-NC-SA 4.0** |

### About agar.io

This project references agar.io's **gameplay rules** (movement, growth, devour
ratio, map scale); the code, visuals and branding are **entirely original**. A
reference clone of the code is **not** present in this repo.

That said: as a ".io" game its resemblance to agar.io is noticeable at first
glance. Saying **"an agar.io-style game"** rather than "a clone" keeps claims
about the name and the game branding (trademark / trade dress) from opening up
a disagreement that isn't needed. It is recommended to keep this framing.
