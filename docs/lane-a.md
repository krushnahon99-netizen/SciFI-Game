# Lane A — world & gameplay: status

Written by Chat A only. Plan and rules: `docs/coordination.md`. Engine notes: AGENTS.md §4.

## Status

- [x] M3a-1 Sundered Monolith, M3a-2 Hall of Echoes (details in AGENTS.md §3).
- [x] Quick checks: phase stone expiry verified in the browser (player stood on a Ghost Garden stone at y 3.67 and
  dropped to the ground ~10 s of game time after the pulse). Still untested: slope limit at the ridge, monolith
  collider push, camera pull-in (low risk; check when convenient).
- [x] M3a-3 Singing Vale + world scatter + ambient particles:
  - `world/structures/vale.ts` `buildVale()`: the Choir (`CHOIR` in layout: two-tier octagonal dais with 0.38 m risers,
    glyph inlay ring, 7 broken hex crystal pipes `brokenPrism()`, hovering energy heart + halo animator), 3 crystal ribs
    over the trail (`VALE_RIBS`, `crystalTube()` faceted + twisted, side-vector frames; spikes and broken-end caps via
    `shard()`; middle rib snapped), 8 big reactive `CrystalCluster`s (`VALE_FORMATIONS`, new `shape: 'prism'`),
    echoes: intact Choir past-state (pipes 17–30 m, crown rings, core) + 6 ghost singers (`sing` pose).
  - `world/scatter.ts` `Scatter`: one InstancedMesh per kind (2 boulder variants with colliders, pebbles, alien tufts,
    lantern stalks, Vale crystal sprigs), seeded placement with slope/splat rules, clumps and `CLEARINGS` (structures,
    trails, chasm, Hall corridor). Vertex hook `SCATTER_VERTEX`: wind sway + distance collapse. `setDensity()` draws a
    prefix (boulders always full so colliders match). Plants glow teal inside the Vale (splat `g`).
  - `world/particles.ts` `AmbientParticles`: GPU-wrapped dust + spores in a 48×20×48 m box around the camera, spores
    dense in the Vale, wavefront flare + outward shove; `setBudget()` = `particleBudget`.
  - `materials.ts`: `createCrystalMaterial()`, `MaterialVariant` (extra vertex hooks) for stone/crystal variants.
  - Browser-verified on Low (SwiftShader): ribs, Choir, formations, lanterns, pulse → past-state + ghost choir + flare.
- [x] M3a-4 Regions + HUD region title:
  - `layout.ts`: `REGION_AREAS` (priority-ordered circle / box / band volumes; Undervault before Works; the chasm band
    covers only the stretch north of the ridge) and `REGION_SPAWNS` (one per region on the arrival trail, built with
    `spawnFacing()`; the Undervault one is provisional until M3b). All 7 spawns browser-checked: inside their own
    volume, slope ≤ 24°, no collider push.
  - `gameplay/regions.ts` `RegionTracker` (`Game.regions`, updated every playing frame from the player position): first
    containing area wins, the current area is widened by `EXIT_MARGIN` (4 m), gaps keep the last region. On change it
    sets `uiStore.region` and emits `regionEnter` (fires for the Cradle on the first frame).
  - `components/echo/region-title.tsx` (one line in `hud.tsx`): Michroma name card, rules grow out of a diamond, 5.2 s
    WAAPI fade (opacity only with reduced motion), `role="status"`. Name + subtitle come from B's `REGIONS`
    (`gameplay/content.ts`).
  - Browser-verified: Cradle title at start, Hall title on teleport, a gap keeps Hall, then Vale (log `hall, vale`).
- [x] M3b Structures: Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates
  - [x] M3b-1 Glass Bridge chasm: `world/structures/bridge.ts` `buildBridge()` returns `GlassBridge { planks (10
    `PhaseObject`s, west → east), west, east (pier-tip x), stable, stabilize() }`, kept as `World.bridge` for M3c.
    `findRim()` marches the heightmap to the cliff edge; per rim an octagonal dais, a gate block with two glyph pylons
    (west intact with lintel + bobbing beacon, east snapped, its crown lying on the dais) and a pier jutting 2.6 m over
    the void on a buttress. The span arches 0.8 m (`deckAt()`); each plank + glass fins is its own phase object, so the
    wavefront reveals them in order. Two broken depth columns, ghost pilgrims stepping onto the span, 2 crystal clusters.
    Respawn: below `FALL_LIMIT` (layout) `Game.respawn()` teleports to `REGION_SPAWNS[regions.current]` and emits
    `respawn`. Recovered from the M3b chat's auto-commit `d402724` (`v0/echo-a-m3b`, never on `main`); its extra
    `playerRespawn` event was replaced by the existing `respawn`. Browser-verified: reveal order, standing mid-span
    (y 5.14), fall → respawn on the west landing.
  - [x] M3b-2 Conduit Works: `world/structures/works.ts` `buildWorks()` returns `ConduitWorks { nodes (3 `GridNode`:
    `position` = plinth-top centre, `charge`, `setCharge(0..1)` lights cell + plinth ring + floor conduit), core
    (Vector3), setPower(0..1) (core, hub rings, main conduit to the vault), door: VaultDoor }`, kept as `World.works`.
    Hub dais (r 7.2) with a leaning reactor cage (6 beams, 2 snapped, crown + mid ring arcs) and a floating dormant
    core; nodes at `GRID_NODES` (layout; 26–48 m apart, so one pulse can't charge two); two hyperboloid cooling towers
    (`LatheGeometry`, one snapped + shell fragments), twin tanks, pipe run, fallen beam, crates. Undervault vault house
    at `UNDERVAULT` (layout `VAULT` + `vaultPoint()`, local +z faces the hub): roofless 8 m walls, buttresses, door
    pylons, three-node seal; `VaultDoor.open(instant?)` sinks the slab 5.7 m in 5 s, the collider top follows it down
    and is disabled at the end. Echoes: whole cage + tower, vault roof, live arcs node → core (the puzzle hint), 5 ghost
    crew, 2 crystal clusters. Shared: `Batch` moved to `world/geometry.ts`, `createMetalMaterial()`, plateau dead-flat
    out to r 26. Recovered the previous chat's partial edits from `553768f` (`v0/echo-a-m3b-bridge`).
    Browser-verified: layout, pulse (past state, arcs, ghosts), nodes + core lit, door sinks and its collider turns off.
  - [x] M3b-3 Undervault: `world/structures/undervault.ts` `buildUndervault()` returns `Undervault { key: HeartKey
    (position, taken, take() hides the core, darkens the shrine and the chamber glow) }`, kept as `World.undervault`.
    Chamber sunk 6 m (`UNDERVAULT_FLOOR`) inside the vault walls: landing inside the door, grand stair (0.3 m risers,
    0.45 m treads) between stepped parapets, lining whose top is a ledge at door level, shrine at the back (stepped
    dais, pedestal, floating Heart Key + 2 rings, glyph wheel), obelisks, crystal clusters (`CrystalCluster` got
    `baseY`). Echoes: `PastStateOverlay` + a `GhostScene`. **Terrain hole** instead of a heightmap carve (a 2 m carve
    left a trench outside the walls): layout `UNDERVAULT_HOLE` / `inUndervaultHole()` / `vaultLocal()` /
    `VAULT_THRESHOLD`; `Terrain.heightAt` returns `UNDERVAULT_HOLE.ground` inside, and the one chunk overlapping it uses
    `createTerrainMaterial(true)` (fragment discard), so the chamber's colliders carry the player. The pit is in baked
    terrain shadow, so the chamber shaders add their own fill (`CHAMBER_GLOW`, `uUndervaultHeart`: Heart glow +
    skylight; no real light). Physics: `resolveCharacter` lets boxes whose top is within step reach be stepped onto
    (stairs work), and `Player.onCollider` (standing on a collider top, or terrain flush under it) skips the steep-slope
    slide, which fixed the player sticking at the door sill. Undervault spawn moved onto the landing; the r 9 region
    circle already fits inside the walls. Partial edits recovered from two auto-commits (`d7ac0ed`, `0b1f7c4`).
    Browser-verified: stair down/up, shrine readable, walk out through the open door onto the hub without sticking.
  - [x] M3b-4 Listening Spire: `world/structures/spire.ts` `buildSpire()` returns `ListeningSpire { stone (top centre
    of the Listening Stone), gate (summit point just outside the barrier gate, where the ramp arrives), barrier:
    SpireBarrier (isOpen, open(instant?): colliders off at once, curtain dissolves in 3.2 s), setAwake(0..1) (Stone
    core + crown glow, for the finale) }`, kept as `World.spire`. Summit (flat y 45): two tiers with inlays, the Stone
    (octagonal pedestal, floating core + 2 rings), 3 vanes leaning in (one snapped) under a floating crown at +26.5 m,
    a ring of 12 pylons at r 10.5 (taller gate pair + lintel with the Heart sigil facing `SPIRE.ramp.end`) holding 12
    additive gold curtain panels (own ShaderMaterial, one box collider each). Ramp: 7 waystones on the outer edge, a
    ruined gate at the foot. Echoes: whole Spire (`PastStateOverlay`: 6 vanes, needle, 3 crown rings), `GhostScene`
    (2 climbing the last stretch, 1 kneeling at the Stone, 2 singing), 2 crystal clusters. A ring (not a gate across
    the ramp) because the ramp's last metres can be left sideways onto the plateau. Gates overall: Hall north gate
    (M3a-2), vault door (M3b-2), Spire barrier (here) — all built, all closed until M3c/M3d open them.
    Browser-verified: closed barrier stops the player at r 10.7; after `open()` the player walks through the gate, up
    both tiers to the Stone; summit and far silhouette readable. Dev: `__echo.world.spire.barrier.open()`.
- [x] M3c Puzzles: `gameplay/puzzles.ts` `Puzzles` (`Game.puzzles`) + `gameplay/interactables.ts` `Interactables`
  (`Game.interactables`):
  - `Interactables`: closest usable item within its `reach` (ground plane, ±2.6 m in height) → `uiStore.interactPrompt`;
    E runs `interact()`. Off while not playing, in a cinematic or in free cam. HUD: `components/echo/interact-prompt.tsx`
    ("E · prompt" above the pulse ring, one line in `hud.tsx`).
  - Choir Sequence: a pulse within 9 m of `hall.altar` starts a replay (`CHOIR_ORDER` 2, 0, 3, 1 = SE, NW, SW, NE): one
    `GhostScene` singer per pillar (not in the registry; the puzzle drives it with a short `timing`), glyph flare and
    `choirNote` per voice, 1.8 s apart. Pillars are interactables (`PROMPTS.attunePillar`): right = lit + `puzzleStep`
    ok; wrong = all silenced, reset, `puzzleStep` ok:false; the 4th → `gate.open()` + `puzzleSolved`. Pulses during a
    replay are ignored; the replay still plays after solving (a memory).
  - Glass Bridge: stepping onto the span at one pier and leaving it past the other → `stabilize()` + `puzzleSolved`.
    A `respawn` in the chasm while unsolved = `puzzleStep` ok:false (unlocks journal hints).
  - Dormant Grid: a pulse charges the nodes within 11 m of its origin when the wavefront arrives (`puzzleStep` ok +
    index); full for 5 s, fades over 13 s, flickers below 35 %; a node going dark near the Works = `puzzleStep`
    ok:false; all three lit → nodes held at 1, `setPower` ramps over 2.5 s, `door.open()`, `puzzleSolved`.
  - Load: solved puzzles are restored at construction from `Game.progression` (gate and door open instantly, bridge
    stable, nodes + power on, glyphs lit).
  - `phaseWarn`: `PhaseObject.onWarn`, wired to the event by `ReactiveRegistry.add()`, fires when a flicker starts
    (bridge planks, Ghost Garden stones). `GhostScene` got an optional `timing` (hold / fades) parameter.
  - Browser-verified: replay order + singers, prompt + E press, wrong-note reset, solve + gate, grid solve + door,
    `phaseWarn`, bridge crossing, all three restored after a reload. Dev: `__echo.emitPulse()`,
    `__echo.puzzles.choir.attune(i)`.
- [ ] M3d world side: fragments, secrets, Heart Key placement, load spawn, finale
  - [x] M3d-1 Memory fragments + load spawn: `gameplay/fragments.ts` `Fragments` (`Game.fragments`, `list` of
    `MemoryFragment`: `id`, `center`, `recovered`). Spots in layout `FRAGMENT_SPOTS` (anchor = max(ground, collider
    top) + hover, measured before the plinth collider is added; all 10 checked flat, no wall within 1.5 m; f09 on the
    Undervault floor, f10 inside the Spire barrier on a summit tier). Visible ones: stone plinth (cylinder collider) +
    glyph inlay, shard (energy material) in 2 orbiting rings, slim additive light column (`echo.fragmentBeam`, own
    ShaderMaterial, never fully fades with distance = beacon). Pulse-only ones (f02 f04 f06 f07 f09): no plinth,
    registered as `'trigger'` reactives, invisible until the wavefront arrives, then shown for 16 s (`RevealTimer`) and
    only usable above 35 %. E (`PROMPTS.recoverMemory`) → `fragmentFound`, lift-and-dissolve over 1.5 s, inlay dims.
    Found ones (`progress.has`) are built hidden. Per-frame call is `tick()` (not `update`: the registry would call it).
    Load spawn: `Game.continueJourney()` → `placeAt(progression.checkpoint)` (shared with `respawn()`).
    Browser-verified: look on Low, prompt + recovery + notice + save, f02 hidden → pulse → prompt, reload + Continue
    → Vale spawn with f01 still recovered.
  - [x] M3d-2a Secrets discovery (partial): `gameplay/secrets.ts` `Secrets` (`Game.secrets`, `update(reach)` after
    interactables; `pulse` listener disposed in `Game.dispose`). Ghost Garden = stand within 7 m of `GHOST_GARDEN`;
    Drowned Bell = pulse origin within 0.75 × crater radius → `secretFound` (progression notice + save); found ones
    skipped via `progress.has`. Browser-verified both (+ notices). Sleeping Giant: no trigger yet (statue not built).

## Next steps

1. **Owner, 2026-10-31: there is no Chat B any more.** Chat A finishes Lane A, then continues Lane B from
   `docs/lane-b.md` "Next steps" (M5a-2 pause tabs, M5a-3 end screen, M5b), then M6. B's files may be edited freely.
2. **M3d world side** next (M3d-1 fragments + load spawn and M3d-2a secrets discovery are done):
   - M3d-2b: the **Sleeping Giant** is NOT built (only a scatter clearing, r 18, at layout `SLEEPING_GIANT`): build the
     buried colossal figure facing the ringed planet (new `world/structures/giant.ts`), a pulse reveals it (reactive),
     then interact → add `'sleeping-giant'` to `gameplay/secrets.ts` `Secrets` (it has no trigger yet). The **Drowned
     Bell** mesh is also missing (crater only, terrain.ts): add a great bell at the crater bottom; its discovery
     (pulse inside the crater) already works.
   - M3d-3: Heart Key: interact at `World.undervault.key`
     (`take()`, `PROMPTS.takeHeartKey`) → `itemFound`; barrier: holding the key within ~4 m of `World.spire.gate`
     (`PROMPTS.placeHeartKey`) → `barrier.open()`; finale: `PROMPTS.touchStone` at `World.spire.stone` → `finaleStart`,
     world-wide pulse, `spire.setAwake` ramp, then `endingStart`. Restore all of it on load (key taken, barrier open).

If you stop mid-step, write here exactly what is unfinished (file, function, what is left).

## Log

| Step | Date | Summary |
| --- | --- | --- |
| setup | 2026-10-30 | Parallel mode set up: coordination plan, lane files, contracts in `gameplay/ids.ts`, `core/events.ts`, `ui/store.ts`. |
| M3a-3 | 2026-10-30 | Singing Vale (Choir, ribs, formations, echoes), world scatter, ambient particles; phase expiry verified. tsc clean, browser-verified. B had not replied in §6 yet. |
| M3a-4 | 2026-10-30 | Region volumes + spawn points (`layout.ts`), `RegionTracker` (`regionEnter`, `uiStore.region`), HUD region title. tsc clean, browser-verified. Still no reply from B in §6. |
| M3a-4-save | 2026-10-30 | Next session: the M3a-4 chat (EVt1YlLaLFM) had pushed only to `v0/check-saved-content-7c6445ae` because B's merge reached `main` first. Merged it (Game.ts / hud.tsx: kept both sides), region title now uses B's `REGIONS`, answered B in §6 (AGREED) and §7, typed B's audio hooks in `events.ts`. |
| M3b-1 | 2026-10-31 | Recovered the Glass Bridge from orphan `d402724` and merged it with B's M4/M5a-1 (Game.ts: kept B's avatar line + A's fall check; `respawn` event). tsc clean, browser-verified. |
| M3b-2 | 2026-10-31 | Chat UZLjCTVV9He ran out of credits mid-step (partial edits auto-committed as `553768f`, off `main`). Next chat: wrote `works.ts` (hub, grid nodes, towers, tanks, vault house + sinking door, echoes), `World.works`, toned down metal rust. tsc clean, browser-verified. |
| M3b-3 | 2026-10-31 | Two chats (uyj6eVOtBnp, Y2KvllYEyFb) ran out mid-step; their auto-commits `d7ac0ed` + `0b1f7c4` held the whole Undervault (chamber, Heart Key, terrain hole, chamber glow, step-up + `onCollider` physics). Next chat verified the door walk-out fix and saved it. tsc clean, browser-verified. |
| M3b-4 | 2026-10-31 | Listening Spire summit (Stone, vanes, crown, barrier ring with Heart gate), ramp waystones + foot gate, echoes; `World.spire`. M3b done. tsc clean, browser-verified. |
| M3c | 2026-10-31 | Interactables + HUD prompt, Choir Sequence (ghost replay, attune, gate), Glass Bridge (crossing → stable), Dormant Grid (timed node charges → door), `phaseWarn`, restore on load. tsc clean, browser-verified. Owner: no Chat B any more; A continues Lane B afterwards. |
| M3d-1 | 2026-10-31 | Memory fragments (`gameplay/fragments.ts`, `FRAGMENT_SPOTS`): plinth + shard + beacon, pulse-only reveal, recovery → `fragmentFound`, restore on load; Continue spawns at the saved checkpoint. tsc clean, browser-verified. |
| M3d-2a | 2026-10-31 | Secrets discovery for the Ghost Garden (stand in it) and Drowned Bell (pulse in the crater). Stopped at LOW budget (~$3.0 of $5 spent after M3d-1): Giant statue, bell mesh, Heart Key / barrier / finale left (see Next steps). No Chat B: Lane B work continues here afterwards. |
