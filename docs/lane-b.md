# Lane B — systems & UI: status

Written by Chat B only. Plan and rules: `docs/coordination.md`.

## Status

- [x] Review the plan and reply in coordination §6 (4 non-blocking points + optional audio-hook Request in §7;
      waiting for A's answer)
- [x] M3d data: `gameplay/content.ts` + `gameplay/progression.ts` (implements `ProgressView`), objective + notices HUD
- [ ] M4 Procedural audio (`audio/audio.ts`), volume + mute
- [ ] M5a Title/continue, intro cinematic, pause menu (journal / settings / controls), end screen
- [ ] M5b Touch controls, perf overlay, auto-quality
- [ ] M6 prep (README checklist, known limitations)

## As built (read before touching Lane B code)

- `gameplay/content.ts`: every player-facing string, in tables keyed by the shared IDs: `REGIONS` (name, subtitle,
  journal), `FRAGMENTS` (region, title, speaker, text, `pulseOnly`: f02 f04 f06 f07 f09), `SECRETS`, `ITEMS`,
  `PUZZLES` (name, solved line, 3 hints), `OBJECTIVES` + `ObjectiveId`, `PROMPTS` (for A's `interactPrompt`),
  `NOTICE_TEXT`, `INTRO`, `TITLE_SCREEN`, `PAUSE`, `JOURNAL`, `SETTINGS_TEXT`, `CONTROLS` (keyboard + touch),
  `ENDING`; runtime ID lists `REGION_IDS` … `PUZZLE_IDS`.
- `gameplay/progression.ts` `Progression` (`Game.progression`, created before `World`): records A's events; save key
  `echo.save.v1` (version 1, sanitised on load, unknown IDs dropped). Saves on every discovery, every 20 s of play,
  on pause / ending, `pagehide` and tab hide. `fails` per puzzle (wrong `puzzleStep`) unlocks journal hints.
  `objectiveFor()`: awaken (until the 1st pulse) → find-hall → choir (once the hall is visited) → cross-vale →
  bridge (once the chasm is visited) → grid → heart-key → spire → free. `discard()` = new journey (erase, stop
  writing, then remount the game). `Progression.hasSave()` for the title screen's Continue.
- UI bridge: `uiStore.progress` (`ProgressSnapshot`, refreshed on changes and saves, not per frame) and
  `uiStore.notices` (max 4; the HUD removes each after 6–11 s, timers stop while paused).
  `components/echo/progress-hud.tsx`: top-left objective (detail collapses after 12 s) + notice cards (body clamped
  to 3 lines below `sm`). `@keyframes echo-rise` in `app/globals.css`.
- `ids.ts`: `ProgressView` gained `checkpoint` and `completed` (coordination §6, point 1).

## Next steps

1. Check coordination §6 / §7 for A's answer.
2. **M4 audio** (`game/audio/audio.ts`, new). `AudioEngine`: `AudioContext` created / resumed on the first
   pointerdown or keydown (autoplay policy); master gain → compressor → destination; buses ambience / sfx / ui.
   Ambience: per-region drone chords crossfaded on `regionEnter` (3–4 detuned oscillators, slow filter LFO) and wind
   (looped noise buffer → bandpass, slow random gusts). SFX: pulse (sub thump + rising shimmer), crystal resonance on
   `reactiveHit` kind `crystal` (FM bell through a `PannerNode` at the hit position), reveal shimmer for the other
   reactive kinds, footsteps per `Surface` (filtered noise bursts), `land`, `puzzleStep` ok / wrong, `puzzleSolved`
   chord, discovery chime for fragment / secret / item, duck on pause. Listener: `audio.update(dt, camera)` in
   `Game.update`. Settings: `volume` (0–1) + `muted` in `core/settings.ts`; `M` toggles mute (check `input.ts` for an
   action, add one if missing); volume slider + mute in the pause menu.
3. Then M5a and M5b as in the status list.

If you stop mid-step, write here exactly what is unfinished (file, function, what is left).

## Log

| Step | Date | Summary |
| --- | --- | --- |
| review | 2026-10-30 | Replied in coordination §6: 4 non-blocking points (`ProgressView.checkpoint` / `completed` added, no runtime reset, all text in content.ts, optional audio hooks requested in §7). |
| M3d-data | 2026-10-30 | `content.ts` (all text), `progression.ts` (events → save, objective, hints, notices), Game.ts wiring, store fields, HUD objective + notices. tsc clean; browser-verified (objective, fragment + secret notices, save written). |
