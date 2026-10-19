# 🌟 StartNG Star Runner — Three.js Game

> Spec: `IMPROVEMENTS_FOR_AGENTS.md` (T1–T11) is implemented. Where the spec
> conflicts with the real `src/` code, the code wins and the spec file is updated.

## 0. Hard requirements

- **R1 — logged-in users only (production):** no portal user → login gate only,
  game loop renders an idle preview but gameplay cannot start. Username on HUD
  + above the character (canvas label, sanitised).
- **R2 — central styling drives the character:** portal `STARTNG:THEME` push
  (or DEV CSS vars) recolours the suit/glow/trail live via `ThemeManager`
  with ~300 ms lerp, plus `shape` swaps the avatar form. No hardcoded colours.

## 1. Verified vs assumed (T11)

| Item | Status |
|---|---|
| Three.js 0.160.0 via CDN importmap, no build step | Verified (in repo) |
| Files `index.html`, `styles.css`, `startng.json`, `src/*.js`, `mock-portal.html` | Verified (in repo) |
| Message names `STARTNG:GET_USER/USER/THEME/SCORE/GET_THEME/READY/LOGOUT/SESSION_LOST` | **Assumed** — start.ng publishes no game SDK docs |
| Globals `__STARTNG_USER__`, `StartNG.getUser/submitScore` | **Assumed** |
| Endpoints `/api/me`, `/api/auth/me`, `/api/user`, `{apiBase}/scores` | **Assumed** |
| CSS vars `--startng-primary/accent/bg` (+ aliases) | **Assumed** |
| Portal origins `https://start.ng`, `https://www.start.ng` | **Assumed** |
| `startng.json` fields/permissions | **Assumed** — kept for convenience; delete if the platform ignores it |

All assumed values live in ONE object: `STARTNG_CONFIG` in `src/startng-bridge.js`.

## Questions for start.ng (blockers for contract lock-in)

1. How do embedded apps get the current user: global, postMessage, or cookie session + endpoint?
2. What are the theme token names, and how do theme changes reach an iframe?
3. Is there a scores endpoint, and does it need a token?
4. Which origins host the portal and the uploaded games? Zip or hosted URL?
5. Does the platform read `startng.json`, and with which fields/permissions?

## Dev vs production

- **DEV** = `localhost` / `127.0.0.1` / `?dev` in URL. Guest play, demo names,
  `?username=` / `?primary=`, localStorage identity, theme cycler + swatches.
- **Production** = anything else. postMessage (origin-checked) + cookie API only.
  No guest, no demo box, no theme cycler. `ALLOWED_ORIGINS` enforced; forged
  messages from other origins are ignored.

## Mock portal (T3)

Open `mock-portal.html` (same server): embeds `index.html?dev=1`, sends
`STARTNG:USER`, pushes 3 themes (incl. low-contrast + box shape), session-loss.
Avatar must recolour without reload.

## Controls

Steer `←/→` or `A/D` (swipe), jump `Space` (buffered + coyote), boost `Shift`
or BOOST button (needs 10 stars), pause `P`, fast restart `R`, `Enter` starts
from gate. Auto-pause on tab-hide / orientation change with 3-2-1 resume.

## Publish to start.ng

1. `python -m http.server 8000` in this folder; test `mock-portal.html`.
2. Zip contents (`index.html` at root) or host on Vercel/Netlify (allow framing).
3. Dashboard → New Game → upload/paste, entry `index.html`.
4. Confirm `ALLOWED_ORIGINS`, message names, endpoints, theme tokens with
   start.ng; then delete unused probes (spec T6) to kill console 404s.

## Verification checklist (spec §5)

- [ ] Production, no user → gate only, loop does not start gameplay (R1)
- [ ] `?dev=1` on localhost → guest/demo works
- [ ] Forged message from foreign origin → ignored
- [ ] Mock portal login + theme push → avatar recolours live (R2)
- [ ] Low-contrast theme → avatar still visible (guard)
- [ ] 50 theme swaps → no leak (pooled meshes, disposed avatar rebuilds)
- [ ] Hostile names (`<script>`, emoji, 100 chars) → safe canvas label
- [ ] Low-end phone → auto-downgrade at <40fps, touch usable