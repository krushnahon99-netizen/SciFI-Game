# Lane B — systems & UI: status

Written by Chat B only. Plan and rules: `docs/coordination.md`.

## Status

- [x] Review the plan and reply in coordination §6 (4 non-blocking points + optional audio-hook Request in §7;
      waiting for A's answer)
- [x] M3d data: `gameplay/content.ts` + `gameplay/progression.ts` (implements `ProgressView`), objective + notices HUD
- [x] M4 Procedural audio (`audio/*.ts`), volume + mute, A's four audio hooks
- [ ] M5a Title/continue, intro cinematic, pause menu (journal / settings / controls), end screen
      (M5a-1 title + intro done; M5a-2 pause tabs and M5a-3 end screen left)
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

## Save path

Since the M4 chat (wvSLwZ4KYnz), B's chats are imported from SciFI-Game itself and push there normally (coordination
§5: lane branch `v0/echo-b-<step>`, then `git push origin HEAD:main`). Old fallback, only if a B account again has no
write access (as GitHub `tspencer164-5346` had, whose work went to its own repo `tspencer164-5346/v0-fvADj3yECIo`):
- B pulls A's work anonymously (public repo): `git remote add scifi https://github.com/krushnahon99-netizen/SciFI-Game.git`
  then `git fetch scifi main && git merge scifi/main`.
- B's work reaches SciFI-Game `main` only when someone with access merges it, e.g. Chat A after the owner makes the B repo
  public: `git fetch https://github.com/tspencer164-5346/v0-fvADj3yECIo.git v0/lane-b && git merge FETCH_HEAD`, push.

## Next steps

0. **Owner, 2026-10-31: no Chat B any more; Chat A does Lane B from here.** Since M3d-3 the finale reaches phase
   `'ending'` (HUD empty there), so do **M5a-3 first**: `Game.keepExploring()` already exists (ending → playing,
   camera back, `uiStore.cinematic` false). Progression now also saves `spireOpen` (`spireOpened` event).
1. After every pull, check coordination §7 for requests to B. (A answered everything in §6 / §7: plan AGREED.)
2. **M5a** UI, in this order, saving after each part (M5a-1 title + intro is done):
   - M5a-2 pause menu tabs: journal (fragments, places, secrets, hints from `fails`) / settings / controls (`CONTROLS`),
     plus `PAUSE.toTitle` (save, `setPhase('title')`, title shot, `canContinue` true) and the title's Settings /
     Controls buttons (`TITLE_SCREEN.settings` / `.controls`) opening the same panels.
   - M5a-3 end screen on `endingStart` (stats from progression, "keep exploring" → free roam).
3. Then M5b (touch controls, perf overlay polish, auto-quality).
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
