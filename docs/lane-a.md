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
- [ ] M3b Structures: Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates
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
- [ ] M3c Puzzles: Choir Sequence, Glass Bridge, Dormant Grid
- [ ] M3d world side: fragments, secrets, Heart Key placement, respawn, finale

## Next steps

1. Check coordination §6/§7 for B's reply or requests after every pull; answer once if needed.
2. M3b structures, one sub-milestone each (M3b-1 Glass Bridge is done): M3b-2 Conduit Works (facility, 3 power-node
   plinths for the Dormant Grid, sealed door gate), M3b-3 Undervault (sunken chamber; then fix its volume and spawn in
   `layout.ts`), M3b-4 Listening Spire (ramp top, energy barrier).
3. M3c: the Glass Bridge puzzle only needs `World.bridge` (crossing while solid → `stabilize()` + `puzzleSolved`).

If you stop mid-step, write here exactly what is unfinished (file, function, what is left).

## Log

| Step | Date | Summary |
| --- | --- | --- |
| setup | 2026-10-30 | Parallel mode set up: coordination plan, lane files, contracts in `gameplay/ids.ts`, `core/events.ts`, `ui/store.ts`. |
| M3a-3 | 2026-10-30 | Singing Vale (Choir, ribs, formations, echoes), world scatter, ambient particles; phase expiry verified. tsc clean, browser-verified. B had not replied in §6 yet. |
| M3a-4 | 2026-10-30 | Region volumes + spawn points (`layout.ts`), `RegionTracker` (`regionEnter`, `uiStore.region`), HUD region title. tsc clean, browser-verified. Still no reply from B in §6. |
| M3a-4-save | 2026-10-30 | Next session: the M3a-4 chat (EVt1YlLaLFM) had pushed only to `v0/check-saved-content-7c6445ae` because B's merge reached `main` first. Merged it (Game.ts / hud.tsx: kept both sides), region title now uses B's `REGIONS`, answered B in §6 (AGREED) and §7, typed B's audio hooks in `events.ts`. |
| M3b-1 | 2026-10-31 | Recovered the Glass Bridge from orphan `d402724` and merged it with B's M4/M5a-1 (Game.ts: kept B's avatar line + A's fall check; `respawn` event). tsc clean, browser-verified. |
