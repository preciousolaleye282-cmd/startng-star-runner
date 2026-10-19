# 🌟 StartNG Star Runner

A 3D endless runner set on a neon-lit Lagos bridge at night. Steer your hover-boarding rider across 11km of traffic, dodge cones, barriers and danfo buses, leap over obstacles, grab stars to charge your boost, and chase combos, missions and leaderboard glory. Your StartNG login becomes your rider — username floating overhead, portal theme colours live on your suit.

**Live demo:** https://startng-threejs-game-m8fhzcz5k-dynamic-5d57.vercel.app/

**Controls:** steer `←/→` or `A/D` (swipe on mobile) · jump `Space` (buffered + coyote time) · boost `Shift` at 10★ · pause `P` · fast restart `R`

**Stack:** Three.js 0.160.0 via CDN importmap · vanilla JS + CSS variables · no build step

**StartNG integration:** production login gate (no guest bypass) · origin-checked `postMessage` user/theme handshake · central theme re-skins the 3D avatar live (~300ms lerp) · score submit with runId + offline queue · `?dev=1` / `?prod=1` test modes · `mock-portal.html` iframe harness

See [README.md](README.md) for the full spec, verification checklist, and publish guide.
