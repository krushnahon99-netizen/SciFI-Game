# AGENTS.md — PROJECT ECHO (READ THIS FIRST)

> **To any AI assistant opening this repo (v0, Claude, GPT, Cursor, Copilot, …):**
> This file is your complete briefing. Read it top to bottom before touching code.
> The owner runs out of credits often and switches accounts, so **every session must leave this file accurate**.
> Requirements source of truth: [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) (the owner's original brief, verbatim).
> Player-facing docs (install, controls, settings, feature checklist, limitations): [`README.md`](README.md).

**Repo:** https://github.com/krushnahon99-netizen/SciFI-Game (public, branch `main`)

> **State (2026-10-31): every planned milestone (M0–M6) is done; the game is playable start to finish.**
> Parallel mode (two chats, Lane A / Lane B) ended with M6: one chat works on the whole project again and
> `docs/coordination.md` is history only. The detailed as-built notes are [`docs/lane-a.md`](docs/lane-a.md) (world,
> player, echo, puzzles, fragments, secrets, finale) and [`docs/lane-b.md`](docs/lane-b.md) (content, progression,
> audio, title / intro / menus / end screen, touch, auto quality). Read the section for the system you are about to
> change, and keep it accurate.

---

## 0. Resume protocol (do this EVERY session)

1. Read this file fully. Read `docs/GAME_SPEC.md` only for the section your current step needs.
2. Follow **§0.1 Credit budget protocol** for the whole session (mandatory).
3. Look at **§3 Current status** and **§4 Next steps**. Continue from the first open item, or do what the owner asks.
   Do **not** restart, re-plan, or rewrite finished systems unless they are broken.
4. `pnpm install`, `pnpm exec tsc --noEmit`, and check the console before changing anything.
5. Work in **sub-milestones**. After **each** one:
   - update §3, §4, append a line to **§9**, update the as-built notes (lane file) of the system you changed and, if a
     feature changed, the README checklist;
   - commit + push to **`main`** (see **§7 Saving work**). A step is not done until it is on `main`.
6. Never commit a broken build. Unfinished files may be committed if nothing imports them yet.

**Owner's resume prompt** (paste into a fresh chat after importing this repo; edit the budget and the task):

```
Budget: $5.00. Read AGENTS.md first and follow its resume protocol and credit rules (§0.1).
Continue PROJECT ECHO from "Next steps" (or: <what you want changed>). I authorize pushing each
finished sub-milestone directly to main. Keep AGENTS.md updated.
```

### 0.1 Credit budget protocol (MANDATORY)

The owner works on small budgets (usually **$5 of v0 credits per account**) and switches accounts when they
run out. Credits running out mid-step lose all unpushed work. Rule of thumb: **save often, check rarely.**

**Budget.** The owner's first message says `Budget: $X`. If not, assume $5.00. Note the session start time (UTC).

**Prices** (measured 2026-10-29 in v0 with Claude Opus 5.5: input $4, output $20, cache-read $0.20,
cache-write $5 per 1M tokens):

| Action | Approx. cost |
| --- | --- |
| Each new owner message (context load / re-cache) | $0.30–0.70 before any work |
| Each tool step | $0.02–0.06 (grows with context size; the M6 session paid ~$1.5 for its first ~25 steps) |
| Model output, including reasoning | $0.02 per 1k tokens |
| Writing ~1,000 lines of code | ~$0.35 all-in |
| One credit check, cheap way (below) | ~$0.03–0.05 |
| One credit check, naive way (broad tool searches, listing chats, paging events) | ~$0.50 |
| Long planning kept only in the model's reasoning (no files written) | ~$1.5–2.5, lost at session end |

**When to check: by time and checkpoints, never by guessing.** Cost depends on effort, length and
complexity, so estimates are unreliable (a guess in the M0.1 chat said $3.00 left; the real number was $1.63).
Do a real check:
1. after every save (commit + push to `main`), and
2. whenever **~20 min** of work has passed since the last check (**~10 min** once `left` is LOW).

Track time for free: run `date -u +%H:%M` at session start, and add `; date -u +%H:%M` to Bash commands you
already run (installs, builds). No extra steps needed. Only tell the owner a balance from a real check.

**Cheap real check (v0 only):**
1. Once per session: `tool_search_tool_bm25` with query `usage getSummary` and **`limit: 1`**
   (the query `credit usage summary` surfaced `listEvents` instead, costing an extra step).
   Broad searches dump ~10 huge tool schemas into context; that is what made the first check cost $0.50.
2. Call the surfaced `v0_usage_getSummary_*` with `start` = session start (ISO UTC). It is read-only.
3. `left = Budget − credits.total − 0.20` (data lags ~1 min; the running reply isn't fully counted).
   Don't list chats, don't page usage events, don't discuss the numbers at length.

**Thresholds (`left`):**
- **> $1.50**: keep working.
- **$0.75–1.50 (LOW)**: finish only the current small step, then save. Start nothing big.
- **< $0.75 (CRITICAL)**: stop now and save. Never drop under ~$0.50; the save itself costs ~$0.25.

**Save** = update §3/§4/§9 (exact file, function, what is left) → commit → push to `main` → short final message.

**Spend less in general:** batch independent writes/edits into one step; don't re-read files you just wrote;
no broad tool searches; keep reasoning and replies short; one browser check per sub-milestone.
**Owner:** send one detailed message instead of several small ones (each message has a fixed startup cost) and
avoid Q&A in a build chat. A cheaper model stretches the budget but is weaker on complex 3D code.

---

## 1. What this project is

**ECHO — "THE WORLD REMEMBERS EVERYTHING."** An original third-person sci-fi exploration /
environmental-puzzle game that runs in the browser (Three.js + WebGL), with desktop (keyboard/mouse)
and mobile (touch) controls. The player wakes alone on an alien world whose stone "remembers".
The core mechanic is the **Echo Pulse**: an expanding energy wave that travels through the world,
revealing hidden glyph paths, ghosts of past events, the intact past state of ruins, and
"phase" objects (e.g. an invisible bridge) that only exist between two states of reality.

Full requirements: `docs/GAME_SPEC.md` (sections 1–12). No backend, no paid APIs, no big asset
downloads: geometry, textures and audio are procedural.

## 2. Tech stack & key decisions

| Area | Decision | Why |
| --- | --- | --- |
| Host | Next.js 16 (App Router) + React 19, pnpm | v0 preview + one-click Vercel deploy. The page only mounts the game. |
| 3D | `three` r186 (plain, **no** react-three-fiber) | Full control of the game loop and systems; framework-agnostic engine in `game/`, lazy-loaded. |
| Post FX | three's built-in `EffectComposer` + `UnrealBloomPass` + `OutputPass` | Version-matched with three; disabled on Low. |
| UI | React components in `components/echo/` reading a tiny external store (`useSyncExternalStore`) | Engine never re-renders React per frame; UI updates on events / throttled stats. |
| Styling | Tailwind v4 tokens in `app/globals.css` | Fonts: Michroma (display) + Geist (body). |
| Audio | Web Audio API, fully procedural (no files) | Starts only after a user gesture (autoplay policy). |
| Save | `localStorage` with in-memory fallback | Spec forbids a backend. |
| Terrain | Analytic height function → cached heightmap → chunked meshes with LOD + skirts | Physics samples the same heightmap the mesh uses (no mismatch). |
| Collision | Custom: heightmap ground + circle/box colliders in a spatial hash | Cheap, deterministic, no physics library needed. |
| Echo pulse | Two global pulse "slots" in shared uniforms injected into world materials via `onBeforeCompile`; CPU registry triggers reactive objects by distance/time | One uniform update per frame drives every surface effect; no world duplication. |
| Fog | Global `ShaderChunk` override → height-aware exponential fog with sun in-scatter tint | Applies to every material consistently. |
| Quality | Presets Low…Ultra + Auto (steps down on sustained low FPS) + render scale | Spec §9: adaptive rendering, measured not promised. |

## 3. Current status

All planned milestones are done. Details for M3a-3 onwards: `docs/lane-a.md` / `docs/lane-b.md`.

- [x] **M0** — Repo, handoff docs (`AGENTS.md`), original spec (`docs/GAME_SPEC.md`), README stub.
- [x] **M0.1** — Credit budget protocol (§0.1), sub-milestone plan, save-to-`main` rule (§7).
- **M1 — Engine foundation**
  - [x] **M1a** Bootstrap (three r186). `EchoGame` lazy-imports the engine client-side; `Game.ts` loop + phase machine; `input.ts` (actions by `KeyboardEvent.code`, pointer lock with automatic drag-to-look fallback for sandboxed iframes, virtual API for touch); `renderer.ts` (ACES, PCF shadows, EffectComposer bloom with MSAA target, GPU name + software-GPU detection → Low); `quality.ts` presets; `settings.ts`/`storage.ts` (localStorage + memory fallback); `ui/store.ts` + `useUI`; HUD, boot overlay, pause menu; free-fly `player/spectator.ts`.
  - [x] **M1b** World look (details: §4 Engine notes). `noise.ts`, `layout.ts`, `terrain.ts`, `render/shaderChunks.ts` (height fog, `patchWorldMaterial`), `materials.ts`, `sky.ts` (ringed planet, sun, stars, clouds), `mountains.ts`, bloom on Medium+.
  - [x] **M1c** Player. `physics/collision.ts` (`Collision`, owned by `World`: heightmap ground + normal, cylinder / yaw-box colliders in a 16 m hash, `resolveCharacter()` with walkable tops, `clearance()` sphere march for the camera); `player/player.ts` (walk 4.5 / run 8 m/s, jump with coyote + buffer, 40° slope limit with sliding, ground snap); `player/avatar.ts` (primitive explorer, procedural animation); `player/camera.ts` (`CameraRig`: orbit, shoulder offset, wheel zoom, pull-in on hits, `setCinematic()`/`clearCinematic()`); F4 free-fly debug camera. Jump, slope limit (ridge foot), collider push (Monolith) and camera pull-in (5.2 → 0.5 m) all browser-verified by M6.
- **M2 — Echo pulse**
  - [x] **M2a** `echo/pulseShader.ts` (tuning constants + world-material GLSL `echoPulseEmission`: wavefront band, Truchet circuit-glyph reveal fading over 6 s), `echo/echoSystem.ts` (2 slots in `sharedUniforms.uEchoPulses`, play clock `uEchoClock` frozen while paused, 2.5 s cooldown, additive fresnel shell per slot, `pulse` event), avatar core flare, HUD charge ring (`components/echo/pulse-indicator.tsx`).
  - [x] **M2b** `echo/reactive.ts` (`ReactiveRegistry`: per-pulse bounding-sphere test → hits queued by arrival time → `hit()`, per-frame `update()` only while active; `RevealTimer`; `arrivalAt()`; emits `reactiveHit`), `hologram.ts`, `glyphs.ts` (`GlyphTrail`), `crystals.ts` (`CrystalCluster`), `ghosts.ts` (`GhostScene`), `pastState.ts` (`PastStateOverlay`), `phase.ts` (`PhaseObject`: collider `enabled` toggled, 7 s hold, flicker warning, `stabilize()`). Content in `world/structures/cradle.ts`. Dev handle `window.__echo` (dev builds only). Phase expiry verified (lane-a).
- **M3 — World, puzzles, progression**
  - [x] **M3a-1** Sundered Monolith (`world/structures/context.ts` `StructureContext`, `Animator`; `cradle.ts` `buildCradle()`: two-tier dais, fractured slab with rune inlay, broken ring, fallen top, 9 standing stones, colliders; echoes).
  - [x] **M3a-2** Hall of Echoes (`world/structures/hall.ts` `buildHall()` → `World.hall { altar, pillars[4], gate: HallGate }`; portal, colonnade, sanctum, sealed north gate `open(instant?)`; `world/geometry.ts` helpers).
  - [x] **M3a-3 / M3a-4** Singing Vale, scatter, particles; regions + region title (lane-a).
  - [x] **M3b** Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, all gates (lane-a).
  - [x] **M3c** Puzzles: Choir Sequence, Glass Bridge, Dormant Grid; interactables + HUD prompt (lane-a).
  - [x] **M3d** `content.ts` + `progression.ts` (all text, save/load, objectives, journal data; lane-b); fragments, secrets (Ghost Garden, Sleeping Giant, Drowned Bell), Heart Key, Spire barrier, finale, load spawn (lane-a).
- [x] **M4** Procedural audio (`game/audio/`), volume + mute (lane-b).
- [x] **M5** UI: title / continue, skippable intro, pause menu tabs (journal / settings / controls), end screen (M5a); touch controls, auto quality, perf overlay (M5b) (lane-b).
- [x] **M6** Test pass + polish + docs: M1c leftovers verified, draw calls per preset measured, production build built and served, pinch zoom + Settings "Performance stats" switch (touch users had no F3), README deliverables (install, controls, settings, checklist, limitations), parallel mode ended.

## 4. Next steps (all optional: the planned game is finished)

1. Ask the owner what to improve, or pick one of these (each is one sub-milestone):
   - **Real-device pass (owner):** play on a desktop GPU and a phone; report FPS (F3 or Settings → Performance stats)
     and anything broken. Everything else builds on that feedback.
   - Camera: fade or hide the avatar when the camera is pulled in under ~1 m (it then fills the view).
   - Gamepad support (`game/core/input.ts`: Gamepad API → move / look / actions) and key rebinding.
   - Auto quality: step back up after a long smooth stretch (today it only steps down).
   - Cradle dais: its risers (~0.47 m) exceed the step height; lower them or add steps if players find it awkward.
2. If you stop mid-step, write here exactly what is unfinished (file, function, what is left).

**Engine notes (as built in M1b — read before touching rendering/world code):**
- `layout.ts` holds every coordinate. `terrain.ts` `sampleTerrain()` is the single analytic height definition; mesh,
  physics (`Terrain.heightAt`, same triangle split as the mesh), splat and sun-shadow textures are all baked from it.
- Terrain: 361² heightmap (2 m cells), 9×9 chunks × 4 LODs (shared index buffers, switched with `setIndex`), skirts.
  Splat RGBA8 = path, vale, works-ash, sediment. Terrain-texture UV = `xz / 722 + 0.5`.
- Baked terrain sun shadow (R16F "shadow height", O(N) sweep toward the sun): every patched material multiplies
  `directLight.color` by `echoSunVisibility`. The terrain doesn't cast into the shadow map; the shadow frustum follows
  `World.update(…, focus)` (texel-snapped), so objects only cast shadows near the focus.
- `render/shaderChunks.ts`: global height-fog chunk override (sun direction and in-scatter baked in as constants; handles
  the sRGB-encoded fog colour on Low). `patchWorldMaterial(material, { key, color, roughness, normal, emissive, vertex…,
  sunVisibility })` — **every distinct shader needs a unique `key`** (it becomes `customProgramCacheKey`). Shared
  uniforms: `uEchoTime`, `uEchoNoise`, `uTerrainShadow`, `uTerrainSplat` (their textures are disposed in `World.dispose`).
- `materials.ts`: 256² tileable noise (R fbm 8 cells, G fbm 32, B Worley 16, A ridged 8); terrain / stone / energy
  materials. Bump via `echoPerturbNormal(-vViewPosition, normal, height)`.
- `sky.ts`: analytic ringed planet + HDR sun disk (blooms) + stars + clouds; its horizon uses the shared
  `echoAtmosphere()` so fogged terrain meets the sky without a seam.
- `mountains.ts`: polar ring r 340→1250 that rises with distance, lower toward the sun and inside `PLANET_NOTCH`
  (which also lowers the rim through `rimHeight()`), so the planet's lower limb stays visible from the main areas.
- Gotchas: `DataTexture` defaults to `NearestFilter`; the 361-wide R16F texture needs `unpackAlignment = 2`; GLSL
  `smoothstep` with reversed edges is undefined; three r186 light units have no π (sun 5, hemi 1.2); `PCFSoftShadowMap`
  was removed (use `PCFShadowMap`).

## 5. Architecture / file map

```
app/                    layout.tsx (metadata, viewport, fonts), page.tsx (mounts <EchoGame/>), globals.css (tokens, keyframes)
components/echo/        React overlay: echo-game.tsx (mounts engine; remount = new journey), game-context.tsx (useGame),
                        use-ui.ts, hud.tsx, perf-overlay.tsx, boot-overlay.tsx, region-title.tsx, progress-hud.tsx,
                        interact-prompt.tsx, pulse-indicator.tsx, audio-indicator.tsx, title-screen.tsx,
                        intro-overlay.tsx, pause-menu.tsx, menu-panels.tsx, menu.ts, end-screen.tsx,
                        touch-controls.tsx, use-touch-mode.ts
game/                   Framework-agnostic engine (plain TypeScript + three)
  core/                 Game.ts (init/loop/phases, public UI API), events.ts, input.ts, settings.ts, storage.ts
  render/               renderer.ts, quality.ts (presets, device guess), autoQuality.ts, shaderChunks.ts
  world/                layout.ts (ALL coordinates), world.ts, terrain.ts, noise.ts, sky.ts, mountains.ts, scatter.ts,
                        particles.ts, materials.ts, geometry.ts, structures/ (context, cradle, hall, vale, bridge,
                        works, undervault, spire, giant, bell)
  physics/collision.ts  colliders, spatial hash, player resolution, camera clearance
  player/               player.ts (controller), avatar.ts, camera.ts (third-person rig, cinematics), spectator.ts (F4)
  echo/                 echoSystem.ts, pulseShader.ts, reactive.ts, hologram.ts, glyphs.ts, crystals.ts, ghosts.ts,
                        pastState.ts, phase.ts, glow.ts
  gameplay/             ids.ts (shared IDs + ProgressView), content.ts (ALL player-facing text), progression.ts (save),
                        regions.ts, interactables.ts, puzzles.ts, fragments.ts, secrets.ts, finale.ts, intro.ts
  audio/                audio.ts (AudioEngine), kit.ts, ambience.ts, sfx.ts
  ui/store.ts           engine → React bridge (external store)
docs/                   GAME_SPEC.md (brief), lane-a.md + lane-b.md (as-built notes), coordination.md (history)
```

## 6. Game design (as built — keep in sync with code)

**World**: ~720 m × 720 m heightmap (2 m cells), playable radius ~300 m, unclimbable outer cliffs, layered
distant mountain silhouettes beyond. A giant ringed planet dominates the sky; a low, dying amber sun.
Coordinates for everything live in `game/world/layout.ts`.

**Route (gated)**: The Cradle (start, Sundered Monolith landmark) → **Hall of Echoes** (ruined temple in a
ridge pass) → **Singing Vale** (crystal valley) → **Glass Bridge** over the chasm → **Conduit Works**
(abandoned facility) → **Undervault** (sunken hidden chamber, Heart Key) → **Listening Spire** (finale).
Gates: terrain ridges/cliffs (slope limit, no jumping on steep ground), the Hall gate, the chasm, the
facility door, the Spire energy barrier.

**Puzzles (all use the Echo Pulse)**
1. *Choir Sequence* (Hall): pulse at the altar → ghost singers replay an order across 4 glyph pillars;
   activate the pillars in that order (E). Wrong = reset. Success opens the gate to the Vale.
2. *Glass Bridge* (chasm): bridge planks are phase objects — solid only while revealed by a pulse
   (~7 s, flicker warning). Crossing it stabilizes the bridge permanently.
3. *Dormant Grid* (Conduit Works): 3 power nodes too far apart for one pulse. Each pulse charges nodes
   in range for a limited time; all 3 charged at once completes the circuit and opens the sealed door.

**Secrets (3)**: Ghost Garden (phase stones), Sleeping Giant (buried statue), Drowned Bell (crater).
**Memory fragments**: 10 (5 only visible after a pulse). Journal lists fragments, places, secrets, hints.
**Ending**: Heart Key from the Undervault lowers the Spire barrier; pulse at the Listening Stone on the
summit → world-wide pulse, the past fully revealed, end screen with stats; free roam after.

**Controls**: WASD/arrows move, Shift run, Space jump, mouse look (click to lock), Q / left click = Echo
Pulse, E = interact, Esc = pause, J = journal, M = mute, F3 = perf stats (also Settings → Performance stats),
F4 = free-fly debug camera, wheel = zoom. Touch: left joystick, right-side look area (pinch = zoom),
Pulse / Jump / Interact / Menu buttons.

**Quality presets**: Low (no shadows/bloom, DPR ≤ 1), Medium, High, Ultra (+ Auto, which only steps
down when measured FPS stays low). Render-scale slider, FPS/draw-call overlay. Table: README "Graphics settings".

## 7. Saving work (git) — every sub-milestone must reach `main`

Every new chat starts from `main`, so work that isn't on `main` is invisible to the next chatbot.
The owner has authorized pushing finished sub-milestones directly to `main` (also stated in the resume prompt).

**In v0 (chat imported from this repo):**
1. `SyncGit` with a commit message like `M7a: gamepad input` and a fresh branch name per chat
   (`v0/echo-<step>`; old names exist on the remote at old commits), so the branch starts from current `main`.
2. Fast-forward `main`: `git push origin HEAD:main`. v0 shows the owner a permission prompt for this push; the owner
   approves it. Rejected because `main` moved? `git pull --no-rebase --no-edit origin main`, `pnpm exec tsc --noEmit`,
   commit, push again, then `SyncGit` once more so v0 follows the branch.

**Elsewhere (plain git):** `git add -A && git commit -m "M7a: …" && git push origin HEAD:main`
(if `origin` isn't GitHub: `git remote add github https://github.com/krushnahon99-netizen/SciFI-Game.git`).

- Never commit secrets. `.env*` files must stay ignored (check `git status` before committing).
- **Never** force-push, rebase commits that are already pushed, or reset `main`.
- 401/403 on push, or SyncGit says "no write access" (`gh api repos/krushnahon99-netizen/SciFI-Game` shows
  `push: false`): the chat's GitHub access is missing or stale; ask the owner to reconnect/verify GitHub
  (v0 → Settings → Git), then retry once.
- **Unsaved work from an earlier chat?** A chat that ran out of credits may have pushed (or v0 auto-committed) a
  `v0/...` branch that never reached `main`. Fetch all heads (`git fetch origin '+refs/heads/*:refs/remotes/origin/*'`)
  and list branches with commits not on `main` (`git rev-list --count origin/main..<branch>`). Checked in M6: the only
  ones left (`v0/develop-scifi-game-*`, `v0/echo-m1b`, `v0/m3c-puzzles-implementation-86ba37e3`) are superseded.

## 8. Known issues & limitations

- Anti-aliasing is MSAA on the bloom composer target only, so **Low** (no bloom) has no AA.
- Pointer lock is refused in sandboxed iframes; input then switches to drag-to-look (click = pulse).
- Auto quality only steps down; the Cradle dais needs a jump (risers ~0.47 m > step height).
- three r186: `PCFSoftShadowMap` was removed (use `PCFShadowMap`); `THREE.Clock` is deprecated (loop uses rAF time).
- Untested: real GPUs, mobile devices, Safari/Firefox, the production build in a browser (built + served only).

**Testing tips (headless agent-browser):**
- It renders with SwiftShader (software GL): fresh profiles start on Low; at 1280×800 it runs ~1 FPS, so game time
  crawls. For behaviour tests use a small viewport (`set viewport 480 320`) plus `__echo.setQuality('low');
  __echo.setRenderScale(0.5)` (~8 FPS). Its FPS says nothing about real GPUs.
- HMR does not swap engine class instances: after editing a class in `game/`, reload the page before testing (in M6 a
  new `Input` method was `undefined` on the live instance until a reload).
- `agent-browser` commands run in a separate sandbox: only the dev server on port 3000 is reachable and `curl` is
  missing there. Check other ports from a plain Bash call (e.g. `node -e "fetch('http://localhost:3100')…"`).
- Steering: `__echo.input.setVirtualMove(x, y)` (camera-relative), teleport with `__echo.player.position.set(x, y, z)`,
  ground height `__echo.world.terrain.heightAt(x, z)`, colliders in `__echo.world.collision.cells`.

## 9. Milestone log (append-only)

| Milestone | Date | Summary |
| --- | --- | --- |
| M0 | 2026-10-29 | Created handoff system: AGENTS.md, docs/GAME_SPEC.md (verbatim brief), README stub. |
| M0.1 | 2026-10-29 | Credit budget protocol (§0.1), sub-milestone plan M1a…M6, save-to-`main` rule (§7). This chat: ~$1.5 spent on Q&A before any code, incl. ~$0.50 for one naive credit check. |
| M1a | 2026-10-29 | Engine bootstrap: three r186, loop/phases, input (pointer lock + drag fallback), renderer + bloom composer, quality presets, settings persistence, HUD/perf/pause UI, test scene. tsc clean, browser-verified. |
| M1b-plan | 2026-10-30 | Owner stopped the session early: no code written. Full M1b design saved in §4 (layout coordinates, terrain/fog/sky/shadow approach). |
| M1b-notes | 2026-10-30 | 2nd session also ended before any code (owner: "save all"). Saved M1b implementation notes in §4: fog colour-space handling, O(N) terrain shadow sweep, chunk/skirt/LOD layout, program cache key, sky/mountain details, concrete ridge/trail coordinates. Lesson: design is done, so the next session should go straight to code. |
| M1b-notes3 | 2026-10-30 | 3rd session, still no code: ~$3.2 spent on reading files + an unsaved planning pass, then the owner said "save". Added gotchas (DataTexture filters, R16F `unpackAlignment`, Spire/Hall formulas, faster mountain shadows, dither) and fixed the credit-check query. Lesson: write files in the first step and push every 1–2 files. |
| M1b | 2026-10-30 | 4th session: M1b code was already on `main` (M1b-1, M1b-3) but the docs weren't updated. Browser-verified; tuned the planet notch, layered ranges and trail edges; condensed the M1b design/notes into §4 "Engine notes". |
| M1c | 2026-10-30 | Player: collision (hash, colliders, camera clearance), controller (run/jump/slope limit), procedural avatar + animation, third-person camera rig with cinematic API, F4 free cam. tsc clean; browser-verified spawn + running. |
| M1c-save | 2026-10-30 | 5th session (new account): the M1c chat ran out of credits while fighting a push-access error, so M1c (`9a88f7a`) was only on branch `v0/echo-m1c`, not `main`. Verified tsc, fast-forwarded `main` to it, added the recovery steps to §7. |
| M2a-wip | 2026-10-30 | Same session, credits ran out mid-check. M2a written: `game/echo/pulseShader.ts` (constants + world-material GLSL: wavefront band, Truchet glyph reveal), `game/echo/echoSystem.ts` (2 slots, play clock `uEchoClock`, 2.5 s cooldown, additive shell meshes, `pulse` event), avatar core flare + release pose, HUD charge ring (`components/echo/pulse-indicator.tsx`). tsc clean; NOT visually verified. |
| M2a | 2026-10-30 | 6th session: browser-verified the pulse. Shell was a view-filling veil from inside (angle-independent wall term) → now fresnel-rim only with near-camera fade; glyphs got their own saturated tint and a sparser mask; front ×1.6. Jump verified. |
| M2b | 2026-10-30 | 6th session: reactive registry + 5 reactive types + Cradle echo content (see §3). tsc clean, browser-verified except phase expiry. Saved at $0.27 left. |
| M3a-1 | 2026-10-30 | 7th session (chat h1YhUrArccr) built the Sundered Monolith (see §3) but ran out of credits right after pushing `v0/echo-m3a`, so it never reached `main` and these docs weren't updated. 8th session: tsc clean, fast-forwarded `main`, updated docs. |
| M3a-2 | 2026-10-30 | 8th session: Hall of Echoes (see §3). tsc clean, browser-verified. |
| parallel | 2026-10-30 | 9th session: switched to two chats in parallel. `docs/coordination.md` (lanes, file ownership, contracts, saving, discussion, requests, start prompts), `docs/lane-a.md`, `docs/lane-b.md`; contracts as types in `gameplay/ids.ts`, `core/events.ts`, `ui/store.ts`. Further status goes to the lane files. |
| Lane A | 2026-10-30/31 | M3a-3 Vale + scatter + particles, M3a-4 regions, M3b bridge / works / undervault / spire, M3c puzzles, M3d fragments / secrets / Heart Key / finale. Several chats ran out mid-step; their auto-commits were recovered each time. Per-step log: `docs/lane-a.md`. |
| Lane B | 2026-10-30/31 | M3d content + progression, M4 audio, M5a title / intro / pause tabs / end screen, M5b touch + auto quality. From 2026-10-31 there was no Chat B: Chat A finished Lane B. Per-step log: `docs/lane-b.md`. |
| M6 | 2026-10-31 | Test pass: slope limit, Monolith collider push and camera pull-in verified; draw calls per preset measured; production build built and served (HTTP 200, all chunks, security headers). Polish: pinch zoom on the touch look pad (`Input.addZoom`), Settings "Performance stats" switch. README deliverables (install, controls, walkthrough, graphics settings, feature checklist, limitations). Parallel mode ended; status folded back here. tsc clean. |
