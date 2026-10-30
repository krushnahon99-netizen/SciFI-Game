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
  - [ ] **M1b** World look: `world/layout.ts`, `world/terrain.ts` (analytic height → cached heightmap → chunked LOD meshes + skirts), `world/materials.ts`, `render/shaderChunks.ts` (height fog + shared uniforms), `world/sky.ts` (gradient, ringed planet, sun, stars, clouds), `world/mountains.ts`, bloom (`EffectComposer` + `UnrealBloomPass` + `OutputPass`, off on Low).
  - [ ] **M1c** Player: `physics/collision.ts` (heightmap ground, circle/box colliders, spatial hash, camera ray), `player/player.ts` (walk/run/jump, slope limit), `player/avatar.ts` (model + procedural animation), `player/camera.ts` (orbit, collision, cinematic mode), basic HUD.
- **M2 — Echo pulse**
  - [ ] **M2a** `echo/echoSystem.ts`: 2 pulse slots in shared uniforms, `onBeforeCompile` wavefront + glyph reveal, expanding shell, Q/click input + cooldown, HUD cooldown.
  - [ ] **M2b** `echo/reactive.ts` registry: glyph path markers, memory ghosts, past-state overlays, reactive crystals, phase objects.
- **M3 — World, puzzles, progression**
  - [ ] **M3a** Structures: Cradle + Sundered Monolith, Hall of Echoes, Singing Vale (`world/structures/*.ts`), scatter, particles, `gameplay/regions.ts`.
  - [ ] **M3b** Structures: Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates.
  - [ ] **M3c** Puzzles: Choir Sequence, Glass Bridge, Dormant Grid (`gameplay/puzzles.ts`, `interactables.ts`).
  - [ ] **M3d** Progression: `content.ts` (all text), memory fragments, 3 secrets, objectives, journal data, save/load (`progression.ts`), respawn, ending.
- [ ] **M4** Procedural audio (`audio/audio.ts`): drones, wind, crystal resonance, pulse, UI/puzzle cues, footsteps, volume + mute.
- **M5 — UI**
  - [ ] **M5a** Title/continue, skippable intro cinematic, pause menu (journal / settings / controls), end screen.
  - [ ] **M5b** Touch controls, perf overlay (F3), auto-quality.
- [ ] **M6** Optimization, browser testing, README checklist (implemented / tested / untested), known limitations.

## 4. Next steps (ordered — start at the top)

1. **M1b** (see §3). Replace `World.buildTestScene()` and the flat `World.heightAt()` with real terrain/sky;
   keep the `World` API (`applyQuality`, `update(dt, time, focus)`, `heightAt`, `dispose`) and the sun/hemi lights.
   Bloom params can be tuned via `RenderSystem.setBloom()`. Then M1c → M2a → … one sub-milestone at a time.
2. If you stop mid-step, write here exactly what is unfinished: file, function, what is left.
   **2026-10-30: three sessions stopped before writing code** (the 3rd spent ~$3.2 of $5 on reading files plus one
   long planning pass that was never written down). No M1b files exist yet. The design and notes below are final.
   **Don't re-derive or re-plan; write code in the first step.** Order: `noise.ts` + `layout.ts` → commit/push →
   `terrain.ts` → `render/shaderChunks.ts` → `materials.ts` → `sky.ts` → `mountains.ts` (commit/push after every
   1–2 files; unimported files are fine if `tsc` passes) → wire into `world.ts`, `Game.ts` (spawn) and `quality.ts`
   (viewDistance) → one browser check → tune → save.

**M1b design (decided — implement as written, tune visually):**
- **Sun moves to the west** (side-light at spawn, shadows fall east): `SUN_DIRECTION = normalize(-0.92, 0.30, -0.25)`
  (~17° up). Planet NNE, low: dir `(0.42, 0.29, -0.86)`, sin(angular radius) 0.165, rings tilted/opened ~0.32.
  Put both in `layout.ts`. Outer rim is **low (~24 m) toward the sun azimuth, ~72 m elsewhere**, so the rim
  doesn't shadow the valleys.
- **layout.ts** (x east, z south, north = −z): spawn (-4, 242) yaw -0.12; Cradle (0,198) r70; Monolith (8,176);
  ridge polyline `[-370,140]…[-150,98],[-70,94],[10,92],[90,98]…[370,144]` halfWidth 36, height 34;
  Hall pass corridor at (-70,94) N–S, halfWidth 9, halfLength 42 (only way through the ridge);
  Vale basin (-150,-32) r100 depth 10; chasm polyline `[28,92],[22,40],[30,-10],[22,-60],[36,-120],[28,-190],[42,-260],[40,-350]`
  halfWidth 13, floor -52 (tip buried in the ridge, end cut into the rim); bridge on the chasm at (26,-38);
  Works plateau (150,-150) r48; Undervault (176,-178); Spire hill (200,25) top r12 / foot r62 / h42 with a
  spiral ramp (225°→495°, radius 51→13) as the only way up; Drowned Bell crater (100,28) r24 depth 6.5;
  Ghost Garden (-150,205); Sleeping Giant (-222,22); trails linking spawn → Hall → Vale → bridge → Works → ramp.
- **terrain.ts**: `sampleTerrain(x,z)` = base fbm → basins/plateau/crater/Spire hill+ramp → ridge → Hall corridor
  carve → rim → chasm carve → trails (also bakes splat: path/vale/works). Heightmap 361² (2 m), triangle
  interpolation matching the index diagonal for `heightAt`. Chunks 40 cells (80 m, 9×9), LOD steps 1/2/4/8 at
  ~115/230/400 m × `terrainDetail`, shared index buffers per LOD, skirts sized from edge LOD error.
  **Baked terrain sun shadow**: per sample, march toward the sun → "shadow height" → R16F texture; every world
  material does `directLight.color *= smoothstep(sh-1.6, sh+0.6, worldY)` (terrain doesn't cast into the shadow map).
- **shaderChunks.ts**: global fog chunk override = exponential height fog integrated along the ray
  (`fogDensity` from FogExp2 ≈ 0.0034, falloff ≈ 0.0115) + sun in-scatter; fog colour is tone-mapped/encoded
  because three applies fog after tonemapping. `patchWorldMaterial(material, {key, hooks…})` adds shared uniforms,
  `vWorldPos`/`vWorldNormal`, hooks after color/roughness/normal/emissive, and patches
  `getDirectionalLightInfo( directionalLight, directLight );` in `lights_fragment_begin` (verified in r186).
- **sky.ts**: BackSide sphere, `gl_Position = p.xyww`, renderOrder 1000 (drawn after opaques), horizon colour =
  fog colour + same in-scatter; analytic ringed planet (ray–sphere + ring plane, mutual shadows), stars,
  streaky drifting clouds, sun disk (HDR, blooms), far range silhouettes painted at the horizon.
- **mountains.ts**: polar ring mesh r 380→1250 (lower toward the sun), baked per-vertex sun visibility.
- **materials.ts**: 256² tileable RGBA noise DataTexture (fbm/fbm/worley/ridged); terrain material (slope rock with
  strata + biplanar, soil, trails, vale tint, ash) with derivative bump; stone + energy materials.
- Raise `viewDistance` presets to ≥1500 so mountains aren't clipped; spectator spawns at `SPAWN`.

**M1b implementation notes (worked out 2026-10-30 against the three r186 source; use as-is):**
- New `game/world/noise.ts`: mulberry32; seeded 2D gradient noise `noise(x, y, period = 256)` (lattice masked with
  `period−1`, so power-of-two periods tile); `fbm`/`ridged` (rotate ~37° and ×2 per octave); `fbmTile`/`ridgedTile`/
  `worleyTile` for the 256² noise texture; `clamp01`/`smoothstep`/`lerp`. A `Polyline` class (segment cache,
  `distance(x, z)` that also stores `along`, bbox `outside()` early reject) lives in `layout.ts`.
- Concrete layout: ridge `[-370,140],[-300,124],[-230,108],[-150,98],[-70,94],[10,92],[90,98],[170,110],[250,124],
  [310,134],[370,144]`. Trails `[-4,242],[0,222],[12,198],[20,180],[6,160],[-30,148],[-62,140],[-70,128],[-70,94],
  [-70,58],[-74,44],[-96,22],[-124,-4],[-140,-24]` → `[-140,-24],[-100,-40],[-56,-46],[-18,-42],[6,-38]` → (bridge)
  `[44,-38],[66,-58],[96,-92],[124,-124],[150,-150]` → `[162,-110],[168,-60],[164,-14]` (ramp start), plus
  `[150,-150],[176,-178]`. No trails to the 3 secrets. Hall floor 2 m, Works plateau 9 m, bridge pads 4 m at x ± 18.
- Feature formulas (`ss` = smoothstep, `d` = distance): ridge `34·(0.82+0.3·n(along))·ss(1,0.42,d/36)·(0.82+0.36·crag)`
  × `(1−corridor)`, corridor `(1−ss(9,13,|x+70|))·(1−ss(42,48,|z−94|))`. Spire hill `42·ss(0.08,0.92,(62−r)/50)`
  (max slope ~56°); ramp shelf halfWidth 3.2 (+1.4 blend), height `lerp(hill(51) ≈ 3.1, 42, s)`. Rim radius
  `300+16·n(2.3cosθ, 2.3sinθ)`, cliff `ss(0.12,0.88,(r−rimR)/30)`, top `rimHeight(θ)+14·ridged`,
  `rimHeight = 24+48·ss(0.04,0.42, 0.5−0.5cos(θ−θsun))`. Chasm `ends = ss(0,30,along)·(1−ss(L−45,L−5,along))`,
  halfWidth `13·(0.35+0.65·ends)`, walls `1−ss(hw−3,hw+1,d+2.4·n)`, floor `lerp(h−6, −52+4·fbm, ends)`. Trail mask
  `1−ss(1.2,3.4,d)` (sink 0.12 m). Splat RGBA8 = path, vale, works-ash, sediment (crater + chasm floor).
- Terrain sun shadow = O(N) sweep, no ray marching. Walk columns west→east; the point one column toward the sun is at
  row `j+dj`, with `s = CELL/−sun.x`, `dj = sun.z·s/CELL ≈ −0.272`, `drop = sun.y·s ≈ 0.652 m`;
  `O(i,j) = max(H(prev), O(prev)) − drop` (lerp in j; column 0 = −500). O excludes the point itself, so lit ground has
  O < h and stays fully lit. R16F via `DataUtils.toHalfFloat`, linear filter. Terrain-texture UV = `xz/722 + 0.5`.
- Mesh: cell tris `(v00,v01,v10),(v10,v01,v11)` (CCW seen from +y, diagonal v10–v01); `heightAt` uses the same split
  (`fx+fz < 1` → triangle v00,v10,v01). One vertex buffer per chunk (41² + 160 skirt verts), 4 shared Uint16 index
  buffers; switch LOD with `geometry.setIndex()` (three rebinds the VAO), ±10 m hysteresis. Perimeter order: north edge
  going east, east going south, south going west, west going north; skirt tris `(t1,t2,s1),(t2,s2,s1)` face outward;
  skirt depth = max edge error of the step-8 LOD + 1 m. Terrain `castShadow` false, `receiveShadow` true.
- Fog chunk: three uploads `fogColor` **sRGB-encoded when drawing straight to the canvas** (Low, no composer) and
  linear into the composer target. In `fog_fragment`, detect with `linearToOutputTexel(vec4(0.5)).r > 0.6`, decode
  sRGB→linear (`sRGBTransferEOTF` if r186's `colorspace_pars_fragment` has it, else inline the formula), add in-scatter,
  `toneMapping()` under `#ifdef TONE_MAPPING`, then `linearToOutputTexel`. `fog_vertex`:
  `vEchoFogRay = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz` (world-space camera→vertex). Factor
  `1−exp(−ρ·L·e^(−b·camY)·(1−e^(−k))/k)` with `k = b·dir.y·L` (use `1−k/2` when |k| is tiny). Built-in materials can't
  take custom uniforms (ShaderLib uniforms get cloned), so sun dir, in-scatter colour and falloff are **constants baked
  into the chunk string**; only `fogColor`/`fogDensity` come from `FogExp2`. Shared GLSL `echoAtmosphere(base, dir)`
  lives in `shaderChunks.ts`; the sky uses it for its horizon so fogged terrain meets the sky without a seam.
- `patchWorldMaterial`: **must set `material.customProgramCacheKey = () => 'echo:' + key`**. The default key is
  `onBeforeCompile.toString()`, which is identical for every patched material, so wrong programs get reused. After
  `#include <project_vertex>`: world pos = `modelMatrix` × batching/instance × `transformed`; world normal =
  `normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz)` (skip for MeshBasic). Hook `sunVisibility` is a GLSL
  expression (default `echoTerrainSunVisibility(vWorldPos)`; mountains use a vertex attribute). Inline a patched copy of
  `ShaderChunk.lights_fragment_begin` with `directLight.color *= echoSunVisibility;` after the `getDirectionalLightInfo`
  line (warn if the replace misses). Bump: `echoPerturbNormal(-vViewPosition, normal, h)` via dFdx/dFdy of a height.
  `disposeObject3D` doesn't reach textures held in `sharedUniforms`, so dispose them in `World.dispose()`.
- Sky: `SphereGeometry(1, 48, 24)`, BackSide, `depthWrite: false`, `fog: false`, `frustumCulled = false`,
  renderOrder 1000; vertex `gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww` (no need to
  follow the camera). Sun disk radius 0.021 rad, HDR 9–18 (blooms). Planet at unit distance with r = 0.165; ring normal
  `−0.32·P + 0.947·(cos0.34·up⊥ + sin0.34·right)`; ring ρ 1.32–2.4 planet radii with a gap at 1.86; planet↔ring
  shadows; haze toward the sky colour (stronger near the horizon). Stars: cells of `d·260`, ~0.5 % filled. Clouds:
  plane projection `d.xz/(d.y+0.14)`, stretched along the wind. Use `textureLod(…, 0.0)` for 1D lookups (the atan
  seam would cause mip spikes). End with `tonemapping_fragment` + `colorspace_fragment`; add a multiplicative ±1 % dither
  against banding.
- Mountains: ring r 340→1250 (inner edge buried under the rim plateau, so there's no gap at the square heightmap
  edge or corners), 288 segments × 30 rings spaced `(k/30)^1.5`, height
  `rimHeight(θ) − 6 + ss(0,0.12,t)·(60+220·ridged)·(0.35…1, lower toward the sun)`. Per-vertex sun visibility from
  marching the analytic height (18 m × 40 steps) → attribute `echoSunVis`.
- Colours are linear albedos (soil 0.085→0.19, rock 0.06→0.22, trail 0.28/0.21/0.15, vale 0.07/0.10/0.13, ash 0.035).
  three ≥ r155 has no implicit π in light units, so expect sun ≈ 4–6 and hemi ≈ 1 after tuning.
- Until M3a, a placeholder Sundered Monolith at `MONOLITH` (two leaning stone slabs + emissive ring) checks shadows and
  bloom. viewDistance presets: 1600 / 1800 / 2000 / 2400.
- Gotchas found 2026-10-30 (3rd session): `DataTexture` defaults to `NearestFilter`, so set Linear explicitly; the
  361-wide R16F shadow texture needs `unpackAlignment = 2` (722-byte rows aren't 4-byte aligned). GLSL `smoothstep`
  with reversed edges is undefined (fine in JS). Spire: `h = lerp(h, 3, 1−ss(40,80,r)) + hill(r)` so the ramp heights
  (3 + 3.1 → 45 m) match the surface; fade the ramp in with `ss(0, 0.03, s)` (avoids a wall at its start). Hall:
  `h = lerp(h, 2, corridor·core)`, where core is the ridge falloff, so the floor doesn't step at the corridor ends.
  Mountains: march a bilinear lookup of the precomputed polar height grid (fast). Quads `(a,b,c),(b,d,c)` with
  a=(s,k), b=(s+1,k), c=(s,k+1) face up. A ±1 % multiplicative dither is too weak in sRGB output: add ±0.5/255
  interleaved-gradient noise when the output is sRGB. `World.update(dt, time, focus, viewer = focus)` (viewer → LOD).

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
Pulse, E = interact, Esc = pause, J = journal, M = mute, F3 = perf stats. Touch: left joystick, right-side
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
- 401/403 on push: the chat has no GitHub credentials; ask the owner to connect GitHub (v0 → Settings → Git).

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
