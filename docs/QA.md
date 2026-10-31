# QA notes — Aurora Pilot

## What was tested

**Environment:** Windows 10 desktop, Chromium (in-app), 1280×720; local server via `python -m http.server`.

- Menu over live attract flight; personal-best chip reads persisted localStorage.
- Flight flow: Play → pitch control with inertia, ring threading (+10 with streak multiplier), spire dodge, parachute fuel canister, HUD (speed/altitude/streak/fuel) all live.
- Stage system: four-sky palette crossfade confirmed (Dawn verified visually; Dusk/Bright day/Starry night verified via palette code + stage timer logic).
- Fixed during review: a duplicate `mid` key in every stage palette meant the mountain color silently overwrote the sky's mid stop — the "dawn" rendered as night. Renamed the mountain key (`midM`) and rewired the layer renderer; dawn now reads correctly.
- Learning layer: flight briefing card opens on sky shifts, pauses the flight, resumes cleanly, +250 on correct; Codex lists the network bank.
- Build agent's verification (before eviction): zero console errors through load and flight; reviewer verified menu, two flights, stage hook wiring.

## What was NOT tested (honest gaps)

- Physical mobile devices (touch verified only via emulated frames by the agent).
- Audio judged by engine paths and no-error runs; no human listened in this pass.
- Firefox/Safari untested. Long runs (10+ minutes, full 4-sky loop) not soaked — stage crossfade math is periodic by construction.
- Stall mechanic verified by code reading, not by flying to stall in this pass.

## Known limitations

- The wind loop is a synthesized approximation, not a recording — it reads as air, not as weather.
- Bird flocks are cosmetic; they do not damage the hull.
