# AGENTS.md — PROJECT ECHO (READ THIS FIRST)

> **To any AI assistant opening this repo (v0, Claude, GPT, Cursor, Copilot, …):**
> This file is your complete briefing. Read it top to bottom before touching code.
> The owner runs out of credits often and switches accounts, so **every session must leave this file accurate**.
> Requirements source of truth: [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) (the owner's original brief, verbatim).

**Repo:** https://github.com/krushnahon99-netizen/SciFI-Game (public, branch `main`)

---

## 0. Resume protocol (do this EVERY session)

1. Read this file fully. Read `docs/GAME_SPEC.md` only for the section your current step needs.
2. Follow **§0.1 Credit budget protocol** for the whole session (mandatory).
3. Look at **§3 Current status** and **§4 Next steps**. Continue from the first unchecked item.
   Do **not** restart, re-plan, or rewrite finished systems unless they are broken.
4. `pnpm install` and check the build/console before changing anything.
5. Work in **sub-milestones** (M1a, M1b, …). After **each** one:
   - update §3, §4 and append a line to **§9 Milestone log**;
   - commit + push to **`main`** (see **§7 Saving work**). A step is not done until it is on `main`.
6. Never commit a broken build. Unfinished files may be committed if nothing imports them yet.

**Owner's resume prompt** (paste into a fresh chat after importing this repo; edit the budget):

```
Budget: $5.00. Read AGENTS.md first and follow its resume protocol and credit rules (§0.1).
Continue PROJECT ECHO from "Next steps". I authorize pushing each finished sub-milestone
directly to main. Keep AGENTS.md updated.
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
| Each tool step | $0.02–0.06 (grows with context size) |
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
| 3D | `three` (plain, **no** react-three-fiber) | Full control of the game loop and systems; framework-agnostic engine in `game/`. |
| Post FX | three's built-in `EffectComposer` + `UnrealBloomPass` + `OutputPass` | Version-matched with three; disabled on Low. |
| UI | React components in `components/echo/` reading a tiny external store (`useSyncExternalStore`) | Engine never re-renders React per frame; UI updates on events / throttled stats. |
| Styling | Tailwind v4 tokens in `app/globals.css` | Fonts: Michroma (display) + Geist (body). |
| Audio | Web Audio API, fully procedural (no files) | Starts only after a user gesture (autoplay policy). |
| Save | `localStorage` with in-memory fallback | Spec forbids a backend. |
| Terrain | Analytic height function → cached heightmap → chunked meshes with LOD + skirts | Physics samples the same heightmap the mesh uses (no mismatch). |
| Collision | Custom: heightmap ground + circle/box colliders in a spatial hash | Cheap, deterministic, no physics library needed. |
| Echo pulse | Two global pulse "slots" in shared uniforms injected into world materials via `onBeforeCompile`; CPU registry triggers reactive objects by distance/time | One uniform update per frame drives every surface effect; no world duplication. |
| Fog | Global `ShaderChunk` override → height-aware exponential fog with sun in-scatter tint | Applies to every material consistently. |

## 3. Current status

Sub-milestones are sized to cost ~$1–1.5 each (about 2–3 per $5 account). Save after every one.

- [x] **M0** — Repo, handoff docs (`AGENTS.md`), original spec (`docs/GAME_SPEC.md`), README stub.
- [x] **M0.1** — Credit budget protocol (§0.1), sub-milestone plan, save-to-`main` rule (§7).
- **M1 — Engine foundation**
  - [x] **M1a** Bootstrap (three r186). `EchoGame` lazy-imports the engine client-side; `Game.ts` loop + phase machine (`playing`/`paused`, pause on pointer-lock loss); `input.ts` (actions by `KeyboardEvent.code`, pointer lock with automatic drag-to-look fallback for sandboxed iframes, virtual API for touch); `renderer.ts` (ACES, PCF shadows, EffectComposer bloom with MSAA target, GPU name + software-GPU detection → Low); `quality.ts` presets; `settings.ts`/`storage.ts` (localStorage + memory fallback); `ui/store.ts` + `useUI`; HUD (FPS chip, F3 stats), boot overlay, minimal pause menu (quality + render scale). Temporary test scene in `world/world.ts` and free-fly `player/spectator.ts`. Verified in browser: renders, F3, pause, quality switch, settings saved.
  - [x] **M1b** World look (details: §4 Engine notes). `noise.ts`, `layout.ts`, `terrain.ts` (analytic height → 361² heightmap → LOD chunks + skirts, splat + baked sun-shadow textures), `render/shaderChunks.ts` (height fog, `patchWorldMaterial`), `materials.ts`, `sky.ts` (ringed planet, sun, stars, clouds), `mountains.ts`, placeholder monolith in `world.ts`, bloom on Medium+. Tuned: `PLANET_NOTCH` (low rim + ranges under the planet), ranges rise with distance, softer trail edges. Browser-verified on Low and High.
  - [x] **M1c** Player. `physics/collision.ts` (`Collision`, owned by `World`: heightmap ground + normal, cylinder / yaw-box colliders in a 16 m hash, `resolveCharacter()` with walkable tops, `clearance()` sphere march for the camera); `player/player.ts` (walk 4.5 / run 8 m/s, jump with coyote + buffer, 40° slope limit with sliding, ground snap); `player/avatar.ts` (primitive explorer, glowing visor + backpack core, procedural idle/walk/run/air/landing); `player/camera.ts` (`CameraRig`: orbit, shoulder offset, wheel zoom, pull-in on hits, `setCinematic()`/`clearCinematic()`); `Game.ts` wiring (F4 = free-fly debug camera; shadow focus = player). Monolith has box colliders. Browser-verified: spawn view, running + camera follow. Not yet exercised in the browser: jumping, slope limit, collider push, camera pull-in.
- **M2 — Echo pulse**
  - [x] **M2a** `echo/pulseShader.ts` (tuning constants + world-material GLSL `echoPulseEmission`: wavefront band, Truchet circuit-glyph reveal fading over 6 s), `echo/echoSystem.ts` (2 slots in `sharedUniforms.uEchoPulses`, play clock `uEchoClock` frozen while paused, 2.5 s cooldown, additive fresnel shell per slot, `pulse` event `{ origin, time, slot }`), avatar core flare, HUD charge ring (`components/echo/pulse-indicator.tsx`). Browser-verified + tuned (shell is rim-only so it doesn't veil the view from inside; glyphs use a saturated tint so they stay cyan). Jump verified.
  - [x] **M2b** `echo/reactive.ts` (`ReactiveRegistry`: per-pulse bounding-sphere test → hits queued by arrival time → `hit()`, per-frame `update()` only while active; `RevealTimer`; `arrivalAt()`; emits `reactiveHit`), `hologram.ts` (additive memory material: fresnel, scanlines, sweep build-up, noise dissolve), `glyphs.ts` (`GlyphTrail`, instanced ground glyphs, 2 arrival slots per instance in shader), `crystals.ts` (`CrystalCluster`, instanced, flare + climbing band), `ghosts.ts` (`GhostScene`: robed figures, poses walk/kneel/sing/reach along paths), `pastState.ts` (`PastStateOverlay`), `phase.ts` (`PhaseObject`: collider `enabled` toggled, 7 s hold, flicker warning, `stabilize()`). Content in `world/structures/cradle.ts` (intact-monolith hologram, 3 pilgrim ghosts, hidden glyph path to Ghost Garden, 2 crystal clusters, Ghost Garden phase steps). Dev handle `window.__echo` (teleport: `__echo.player.position.set(x,y,z)`). Browser-verified: all trigger; standing on a solid phase stone works. NOT confirmed: phase stone expiry (player should fall after ~7 s) — SwiftShader ran the game clock ~4× slower than real time.
- **M3 — World, puzzles, progression**
  - [ ] **M3a** Structures: Cradle + Sundered Monolith, Hall of Echoes, Singing Vale (`world/structures/*.ts`), scatter, particles, `gameplay/regions.ts`.
    - [x] **M3a-1** `world/structures/context.ts` (`StructureContext { scene, collision, reactives, animate }`, `Animator`);
      `cradle.ts` `buildCradle()` = `buildSunderedMonolith()` (two-tier octagonal dais, `fracturedHalf()` split slab with
      `runeInlay()`, broken ring turning in the gap, climbable fallen top, half-sunk capstone, dark ring arc, merged rubble,
      9 standing stones on a 19 m ring; colliders for all) + `buildCradleEchoes()`. Placeholder removed from `world.ts`;
      `PastStateOverlay` intensity 1.1 → 0.8. tsc clean; not browser-checked yet.
    - [x] **M3a-2** Hall of Echoes: `world/structures/hall.ts` `buildHall()` returns `Hall { altar, pillars[4] (position +
      own glyph material, dim until lit), gate: HallGate }`, kept as `World.hall` for M3c. South portal (z 118, snapped
      lintel with glyph band), ruined colonnade (`RUIN` table, fallen drums + lintel), masonry wall facing, sanctum
      (2-tier dais, altar, hovering resonator, 4 glyph pillars with distinct sigils), sealed north gate (z 76;
      `open(instant?)` slides the leaves into the pylons and disables the door collider past 45 %), rubble, intact-temple
      `PastStateOverlay`, 2 crystal clusters. Shared helpers: `world/geometry.ts` (`mergeParts`, `block`).
      Browser-verified: portal, sanctum + pulse hologram, open gate. Until M3c the closed gate seals the north half;
      dev: `__echo.world.hall.gate.open()`.
  - [ ] **M3b** Structures: Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates.
  - [ ] **M3c** Puzzles: Choir Sequence, Glass Bridge, Dormant Grid (`gameplay/puzzles.ts`, `interactables.ts`).
  - [ ] **M3d** Progression: `content.ts` (all text), memory fragments, 3 secrets, objectives, journal data, save/load (`progression.ts`), respawn, ending.
- [ ] **M4** Procedural audio (`audio/audio.ts`): drones, wind, crystal resonance, pulse, UI/puzzle cues, footsteps, volume + mute.
- **M5 — UI**
  - [ ] **M5a** Title/continue, skippable intro cinematic, pause menu (journal / settings / controls), end screen.
  - [ ] **M5b** Touch controls, perf overlay (F3), auto-quality.
- [ ] **M6** Optimization, browser testing, README checklist (implemented / tested / untested), known limitations.

## 4. Next steps (ordered — start at the top)

1. Quick checks first (cheap): phase stone expiry at the Ghost Garden (teleport onto the first stone right after a pulse,
   read `__echo.player.position.y` once `echo.clock` > pulse + 8). Note: the HUD FPS is computed from capped dt, so it
   overstates FPS on SwiftShader. Still untested from M1c: slope limit at the ridge, monolith collider push, camera pull-in.
2. **M3a** (see §3): M3a-1 (monolith) and M3a-2 (Hall) are done; next **M3a-3** the Singing Vale
   (`world/structures/vale.ts`: crystal formations, scatter, particles), then **M3a-4** `gameplay/regions.ts`
   (area discovery + HUD region title).
3. Then M3b → M3c → … one sub-milestone at a time. If you stop mid-step, write here exactly what is unfinished
   (file, function, what is left).

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
app/
  layout.tsx            metadata, viewport, fonts
  page.tsx              mounts <EchoGame/> (client only)
  globals.css           Tailwind v4 theme tokens + game UI styles
components/echo/        React UI overlay: echo-game.tsx (mounts engine, GameContext), use-ui.ts (store hook),
                        hud.tsx, perf-overlay.tsx, boot-overlay.tsx, pause-menu.tsx (+ touch, intro, end screen later)
game/                   Framework-agnostic engine (plain TypeScript + three)
  core/                 Game.ts (init/loop/state machine, public UI API), events.ts, input.ts, settings.ts, storage.ts
  render/               renderer.ts (renderer/composer/resize/stats), quality.ts (presets/auto), shaderChunks.ts (fog override, shared uniforms, material injection)
  world/                layout.ts (ALL world coordinates — single source of truth), terrain.ts, sky.ts, mountains.ts, scatter.ts, particles.ts, materials.ts, geometry.ts, structures/*.ts (one builder per region)
  physics/collision.ts  colliders, spatial hash, player resolution, camera ray tests
  player/               player.ts (controller), avatar.ts (model + procedural animation), camera.ts (third-person rig, cinematic mode)
  echo/                 echoSystem.ts (pulses, uniforms, shell visuals), reactive.ts (reactive object types)
  gameplay/             interactables.ts, puzzles.ts, progression.ts (state, save/load), content.ts (all story text), regions.ts (area discovery)
  audio/audio.ts        procedural Web Audio engine
  ui/store.ts           engine → React bridge (external store)
docs/GAME_SPEC.md       original brief (verbatim)
```

## 6. Game design (as built / planned — keep in sync with code)

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

**Secrets (≥3)**: Ghost Garden (phase stones), Sleeping Giant (buried statue), Drowned Bell (crater).
**Memory fragments**: ~10 (some only visible after a pulse). Journal lists fragments, places, secrets.
**Ending**: Heart Key from the Undervault lowers the Spire barrier; pulse at the Listening Stone on the
summit → world-wide pulse, the past fully revealed, end screen with stats; free roam after.

**Controls**: WASD/arrows move, Shift run, Space jump, mouse look (click to lock), Q / left click = Echo
Pulse, E = interact, Esc = pause, J = journal, M = mute, F3 = perf stats, F4 = free-fly debug camera, wheel = zoom. Touch: left joystick, right-side
look area, Pulse / Jump / Interact / Pause buttons.

**Quality presets**: Low (no shadows/bloom, DPR ≤ 1), Medium, High, Ultra (+ Auto, which only steps
down when measured FPS stays low). Render-scale slider, FPS/draw-call overlay.

## 7. Saving work (git) — every sub-milestone must reach `main`

Every new chat starts from `main`, so work that isn't on `main` is invisible to the next chatbot.
The owner has authorized pushing finished sub-milestones directly to `main` (also stated in the resume prompt).

**In v0 (chat imported from this repo):**
1. `SyncGit` with a commit message like `M1a: engine bootstrap` (first time in a chat: `branchName: "v0/echo-dev"`).
   It commits and pushes to the `v0/...` working branch only. Note: `v0/echo-dev` exists on the remote at an old
   commit (behind `main`), so in a new chat use a fresh name (e.g. `v0/echo-<milestone>`). That way the branch starts from current `main`.
2. Then fast-forward `main`: `git push origin HEAD:main`. v0 shows the owner a permission prompt for this push
   (platform rule for pushes to the default branch); the owner approves it. If it fails or is declined, ask the
   owner to merge the branch (v0 → Settings → Git) before opening a new chat.

**Elsewhere (plain git):** `git add -A && git commit -m "M1a: …" && git push origin HEAD:main`
(if `origin` isn't GitHub: `git remote add github https://github.com/krushnahon99-netizen/SciFI-Game.git`).

- Never commit secrets. `.env*` files must stay ignored (check `git status` before committing).
- 401/403 on push, or SyncGit says "no write access" (`gh api repos/krushnahon99-netizen/SciFI-Game` shows
  `push: false`): the chat's GitHub access is missing or stale; ask the owner to reconnect/verify GitHub
  (v0 → Settings → Git), then retry once.
- **Unsaved work from an earlier chat?** Run `git ls-remote origin` first: a chat that ran out of credits may have
  pushed its `v0/echo-*` branch without reaching `main`. If that branch is ahead of `main`
  (`git merge-base --is-ancestor main <branch>`), check it out, run tsc, and fast-forward `main` from it.

## 8. Known issues & limitations

- Anti-aliasing is MSAA on the bloom composer target only, so **Low** (no bloom) has no AA.
- Pointer lock is refused in sandboxed iframes; input then switches to drag-to-look (click = pulse).
- Headless test browser uses SwiftShader (software GL): it auto-selects Low; its FPS says nothing about real GPUs.
- three r186: `PCFSoftShadowMap` was removed (use `PCFShadowMap`); `THREE.Clock` is deprecated (loop uses rAF time).
- Untested so far: real GPUs, mobile devices, Safari/Firefox.

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
| M2a-wip | 2026-10-30 | Same session, credits ran out mid-check. M2a written: `game/echo/pulseShader.ts` (constants + world-material GLSL: wavefront band, Truchet glyph reveal), `game/echo/echoSystem.ts` (2 slots, play clock `uEchoClock`, 2.5 s cooldown, additive shell meshes, `pulse` event), avatar core flare + release pose, HUD charge ring (`components/echo/pulse-indicator.tsx`). tsc clean; NOT visually verified. **Next session: open the game, press Q, check wavefront/glyphs/shell/ring, tune, then tick M2a in §3 and move §4 to M2b.** |
| M2a | 2026-10-30 | 6th session: browser-verified the pulse. Shell was a view-filling veil from inside (angle-independent wall term) → now fresnel-rim only with near-camera fade; glyphs got their own saturated tint and a sparser mask; front ×1.6. Jump verified. |
| M2b | 2026-10-30 | 6th session: reactive registry + 5 reactive types + Cradle echo content (see §3). tsc clean, browser-verified except phase expiry. Saved at $0.27 left. |
| M3a-1 | 2026-10-30 | 7th session (chat h1YhUrArccr) built the Sundered Monolith (see §3) but ran out of credits right after pushing `v0/echo-m3a`, so it never reached `main` and these docs weren't updated. 8th session: tsc clean, fast-forwarded `main`, updated docs. |
| M3a-2 | 2026-10-30 | 8th session: Hall of Echoes (see §3). tsc clean, browser-verified. |
