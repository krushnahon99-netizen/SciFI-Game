# Lane B — systems & UI: status

Written by Chat B only. Plan and rules: `docs/coordination.md`.

## Status

- [x] Review the plan and reply in coordination §6 (4 non-blocking points + optional audio-hook Request in §7;
      waiting for A's answer)
- [x] M3d data: `gameplay/content.ts` + `gameplay/progression.ts` (implements `ProgressView`), objective + notices HUD
- [x] M4 Procedural audio (`audio/*.ts`), volume + mute, A's four audio hooks
- [x] M5a Title/continue, intro cinematic, pause menu (journal / settings / controls), end screen
      (M5a-1 by Chat B; M5a-3 and M5a-2 by Chat A)
- [x] M5b Touch controls (M5b-1), auto-quality + perf overlay polish (M5b-2)
- [ ] M6 prep (README checklist, known limitations)

## As built (read before touching Lane B code)

- `gameplay/content.ts`: every player-facing string, in tables keyed by the shared IDs: `REGIONS` (name, subtitle,
  journal), `FRAGMENTS` (region, title, speaker, text, `pulseOnly`: f02 f04 f06 f07 f09), `SECRETS`, `ITEMS`,
  `PUZZLES` (name, solved line, 3 hints), `OBJECTIVES` + `ObjectiveId`, `PROMPTS` (for A's `interactPrompt`),
  `NOTICE_TEXT`, `INTRO`, `TITLE_SCREEN`, `PAUSE`, `JOURNAL`, `SETTINGS_TEXT`, `CONTROLS` (keyboard + touch),
  `TOUCH` (touch button names), `ENDING`; runtime ID lists `REGION_IDS` … `PUZZLE_IDS`.
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
- **Audio** (`game/audio/`, all procedural, no files). `audio.ts` `AudioEngine` (`Game.audio`): the AudioContext is
  built on the first pointer/key/touch gesture (or at once if `navigator.userActivation` says the page was already
  clicked, e.g. after a remount) and suspended while the tab is hidden. Graph: buses sfx / ambience / reverb
  (convolver, generated IR) / echo (damped feedback delay) → pause duck (`PAUSE_DUCK` 0.35) → master (volume²) →
  compressor; the ui bus skips the duck. Cues run only while the context is running. `kit.ts`: `createVoice()`
  (optional `PannerNode` at a world position, reverb / echo sends, voice count; non-essential voices are skipped above
  `MAX_VOICES` 28), `envelope()`, noise buffers, IR. `ambience.ts`: `REGION_TONES` (root, chord, scale, filter cutoff,
  wind per region; every melodic cue uses the current region's key) and `Ambience` (drone chord crossfaded on
  `regionEnter` / `respawn`, wind gusts). `sfx.ts`: pulse, reveal per `ReactiveKind` (spatial; crystal bells keep one
  note per formation; `REVEAL_SPACING` stops stacking), footsteps per `Surface`, land, puzzle step (per-pillar / node
  note when `index` is set, else a climbing streak; wrong = buzz), solved, discovery chimes, pause open / close, and
  A's hooks: `choirNote` (sung pillar note + bell, essential), `phaseWarn` (wavering tone, one per 0.4 s),
  `finaleStart` (long swell + choir, non-spatial). `endingStart` plays a big solved arpeggio.
  Settings `volume` (default 0.8) + `muted` (`echo.settings.v1`); `Game.setVolume()` (raising it un-mutes),
  `setMuted()`, `toggleMute()` (`M`, input action `mute`); `uiStore.volume` / `.muted`. Pause menu has a volume slider
  + mute toggle; `components/echo/audio-indicator.tsx` = "Muted" chip above the pulse ring while muted.
  Dev: `__echo.audio.graph.kit.voices` (live voices), `__echo.audio.running`.
- **Title + intro** (M5a-1). `Game.start({ intro? })` opens on phase `'title'`: camera on `titleShot()`
  (`gameplay/intro.ts`: high behind the spawn, looking at the Cradle stones), `uiStore.canContinue` =
  `Progression.hasSave()`. `continueJourney()` (blend back to the gameplay camera + pointer lock), `beginJourney()`
  → `'intro'`, `skipIntro()` (button; Esc also skips, without pointer lock). `Intro` runs on game time: 4 lines ×
  4.6 s (`uiStore.introLine`, −1 between lines); on the last line `clearCinematic(0.35)` glides down to the
  explorer, whose first pulse fires 1.8 s later; ends at 18.7 s → `'playing'`. Echo, reactives and player physics
  run during `'intro'`; the avatar animates in every phase except `'paused'`. `title-screen.tsx`: Continue / Begin,
  New journey → confirm → `EchoGame.newJourney()` = `discard()` + remount with `start({ intro: true })`.
  `intro-overlay.tsx`: letterbox, crossfading lines, sr-only live line, Skip. Leaving the title plays the close cue.
  Continue spawns at `SPAWN` until A's M3d load-spawn uses `checkpoint` (coordination §4; nothing for B to do).
  Dev: `__echo.intro.time = 13.7` jumps to the descent (headless runs ~5 FPS, so game time is ~half wall time).
- **End screen + return to title** (M5a-3, done by Chat A). `components/echo/end-screen.tsx` (phase `'ending'`):
  over the finale's wide shot, a bottom-heavy scrim fades in (`@keyframes echo-fade`), then ornament + `ENDING.title`,
  the two lines, a stats `<dl>` (time as `<time dateTime>`, memories / secrets / places as found/total with sr-only
  "of N", pulses) and two buttons rise in sequence (`REVEAL`). The buttons are `inert` until visible (~8 s, 0.6 s with
  reduced motion; a stray click can't skip the ending), then the primary one takes focus. Keep exploring →
  `Game.keepExploring()`; Return to title → new `Game.returnToTitle()` (from `'paused'` or `'ending'`, refused while
  `Finale.running`: save, drop free cam, title shot, `cinematic` false, `canContinue` refreshed, phase `'title'`).
  Shared button classes + `dropFocus()` moved to `components/echo/menu.ts` (title screen uses them).
  Dev: `__echo.finale.begin()` near the Stone, then `__echo.finale.elapsed = 12.75` skips to `endingStart`
  (headless runs the world pulse at ~1 FPS); or `__echo.events.emit('endingStart', {})`.
- **Pause menu tabs** (M5a-2, Chat A). `components/echo/menu-panels.tsx`: `SettingsPanel` (the old pause controls:
  mute switch, volume, quality radios, render scale), `ControlsPanel` (`CONTROLS` keyboard + touch as `<dl>` rows,
  headings `CONTROL_GROUPS`), `JournalPanel` (current objective; "What the stone suggests" = the first `fails` hints
  of each unsolved puzzle; memories / places / secrets with found/total, unknown entries dashed, a memory's region
  shown once visited). `pause-menu.tsx`: fixed-height dialog, ARIA tablist (arrow keys move between tabs), scrolling
  tabpanel, footer Resume + Return to title (hidden while `uiStore.cinematic`, i.e. paused mid-finale). The tab lives
  in `uiStore.menuTab` (default journal); `J` (`Game.toggleJournal()`, debounced like Esc): playing → pause on the
  journal; paused on another tab → journal; paused on the journal → resume. Title screen: Settings / Controls buttons
  open the same panels in a card with Back (`TITLE_SCREEN.back`).
- **Touch controls** (M5b-1). `components/echo/use-touch-mode.ts` `useTouchMode()`: true on `(pointer: coarse)` or
  after the first finger touch on the page (touch-screen laptops). `touch-controls.tsx` (z-20, only in `'playing'`
  without `cinematic`): floating joystick on the left half (`Stick`: base appears under the thumb, knob travel 48 px,
  dead zone 0.12, analog `input.setVirtualMove()`, ≥ 0.9 holds `run`), `LookPad` on the right half (`input.addLook()`
  × 1.6), `PadButton`s acting on pointer-down with capture (Jump holds `jump`, Pulse taps `pulse` with the `PulseRing`
  charge ring as its face + a 12 ms vibrate when ready, Interact taps `interact` only while `interactPrompt`), Menu
  button top-right → `Game.pause()`. Unmounting (pause, cinematic) releases every held input (source `'touch'`). In
  touch mode the HUD hides the keyboard hint and the centre `PulseIndicator`, `InteractPrompt` shows a hand instead of
  E, and the FPS chip moves left of the Menu button. `input.ts`: `requestPointerLock()` is skipped when the last
  pointer-down on the page was a finger (menus tapped on a phone never try to capture the mouse).
  Testing: agent-browser's `set device` gives no coarse pointer; `window.dispatchEvent(new PointerEvent('pointerdown',
  { pointerType: 'touch' }))` switches the UI to touch mode, and synthetic touch `PointerEvent`s on the zones /
  buttons drive it. Its real clicks land offset under device emulation (use `element.click()` for small buttons).
- **Auto quality + perf overlay** (M5b-2). `game/render/autoQuality.ts` `AutoQuality.sample(frameSeconds, level)`:
  only while `'playing'` and `!settings.qualityExplicit`; 4 s settle after a start / preset change / resume, then 3 s
  windows of real frame time; 2 windows in a row under 28 FPS step the preset down one level (never up; Low is the
  floor); gaps over `STALL_SECONDS` (5 s: hidden tab, dialog) restart the window. It must stay far above real frame
  times: SwiftShader at High takes ~2 s per frame (a 0.5–1 s cutoff made Auto ignore exactly the devices that need it).
  `Game.setAutoQuality()` (the **Auto** radio in `SettingsPanel`, `SETTINGS_TEXT.autoNote` as its title) resets to
  `detectDefaultQuality()` (Low on a software GPU); `uiStore.qualityAuto` (Lane B block) drives the radio; while Auto,
  the level in use gets a dashed outline. A step-down saves settings, so the next session starts at the lower level.
  `Game.frame` now passes the real (uncapped) frame time to `samplePerf` (the readout no longer overstates FPS below
  10); the compact FPS chip shows only while playing (F3 stats in every phase) and the stats say `Quality: Medium · Auto`.
  Test hook: `__echo.settings.qualityExplicit = false; __echo.settings.quality = 'high'; __echo.applyQuality()` while
  playing in the headless browser steps to Medium in ~25 s.

## Save path

Since the M4 chat (wvSLwZ4KYnz), B's chats are imported from SciFI-Game itself and push there normally (coordination
§5: lane branch `v0/echo-b-<step>`, then `git push origin HEAD:main`). Old fallback, only if a B account again has no
write access (as GitHub `tspencer164-5346` had, whose work went to its own repo `tspencer164-5346/v0-fvADj3yECIo`):
- B pulls A's work anonymously (public repo): `git remote add scifi https://github.com/krushnahon99-netizen/SciFI-Game.git`
  then `git fetch scifi main && git merge scifi/main`.
- B's work reaches SciFI-Game `main` only when someone with access merges it, e.g. Chat A after the owner makes the B repo
  public: `git fetch https://github.com/tspencer164-5346/v0-fvADj3yECIo.git v0/lane-b && git merge FETCH_HEAD`, push.

## Next steps

0. **Owner, 2026-10-31: no Chat B any more; Chat A does Lane B from here.** M5a is complete.
1. **M5b is done** (M5b-1 touch controls, M5b-2 auto-quality + perf overlay). Optional polish, only if cheap: touch
   users can't open the F3 stats (no key; a tap on the FPS chip could toggle them); touch pinch-to-zoom for the camera.
2. Then M6 (README checklist, known limitations; fold lane files back into AGENTS.md, end parallel mode).
4. Not testable yet: footsteps / land / puzzle / discovery cues fire only once Lane A emits those events (M3c / M3d);
   the M4 check fired them by hand through `__echo.events.emit(...)`.

If you stop mid-step, write here exactly what is unfinished (file, function, what is left).

## Log

| Step | Date | Summary |
| --- | --- | --- |
| review | 2026-10-30 | Replied in coordination §6: 4 non-blocking points (`ProgressView.checkpoint` / `completed` added, no runtime reset, all text in content.ts, optional audio hooks requested in §7). |
| M3d-data | 2026-10-30 | `content.ts` (all text), `progression.ts` (events → save, objective, hints, notices), Game.ts wiring, store fields, HUD objective + notices. tsc clean; browser-verified (objective, fragment + secret notices, save written). |
| save | 2026-10-30 | Push to SciFI-Game blocked (B's account has no access); work backed up to `tspencer164-5346/v0-fvADj3yECIo` (`main` 3ffdcf4, branch `v0/lane-b`). Stopped at LOW credits before M4. |
| M4 | 2026-10-30 | Chat wvSLwZ4KYnz: procedural audio (`kit`, `ambience`, `sfx`, `audio`), volume + mute settings, pause-menu audio controls, Muted chip. tsc clean; browser-verified (context starts on click, all cues fire, voices drain to 0, mute saved, pause duck). Ran out of credits ($5) before saving: v0 auto-committed it as `09822f2` on `v0/continue-v0-project-a8245fce`, never on `main`. |
| M4-save | 2026-10-30 | Next B chat: merged `09822f2` plus A's unpushed M3a-4 save (`1691bda` on `v0/echo-a-m3b`; Game.ts conflict = both fields kept), subscribed audio to A's hooks (`puzzleStep.index`, `choirNote`, `phaseWarn`, `finaleStart`), docs. tsc clean, hooks browser-verified. |
| M5a-1 | 2026-10-30 | Title phase over the live world (Continue / Begin / New journey + confirm → remount into the intro), letterboxed skippable intro (`gameplay/intro.ts`: lines, descent to the explorer, first pulse). Game.ts: `start({ intro })`, `continueJourney` / `beginJourney` / `skipIntro`, world live during `'intro'`. tsc clean; browser-verified at 432×632 (title, remount, lines, descent, pulse → `'playing'` in the Cradle, Esc skip). |
| M5a-3 | 2026-10-31 | Chat A (no Chat B any more): end screen (`end-screen.tsx`: staged reveal, stats, inert-until-visible buttons), `Game.returnToTitle()`, `Finale.running`, shared `menu.ts`. tsc clean; browser-verified at 1280×800 (finale → ending, Return to title → Continue, Keep exploring → playing). |
| M5a-2 | 2026-10-31 | Chat A: pause menu tabs (`menu-panels.tsx`: journal / settings / controls), Return to title, `J` journal toggle (`uiStore.menuTab`), title Settings / Controls panels. M5a complete. tsc clean; browser-verified (journal hints + entries, tabs, J open / switch / resume, title settings at 432×632). |
| M5b-1 | 2026-10-31 | Lane B by a single chat (no Chat A / B split any more): touch controls (`touch-controls.tsx`: floating joystick with run at full tilt, look pad, Pulse / Jump / Interact / Menu), `useTouchMode()`, touch-aware HUD, no pointer lock after a touch. tsc clean; browser-verified at 390×844 (layout, move axis, run, look delta, jump hold, pulse, Menu → pause). |
| M5b-2 | 2026-10-31 | Auto graphics quality (`render/autoQuality.ts`, Auto radio, `qualityAuto`), real frame time for perf stats, FPS chip only while playing, `· Auto` in the F3 stats. tsc clean; browser-verified (High → Medium → Low on SwiftShader while Auto; settings panel at 432×632). Found and fixed: a 0.5 s stall cutoff made Auto ignore 2 s software frames. |
