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
- [ ] M3a-4 Regions + HUD region title
- [ ] M3b Structures: Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates
- [ ] M3c Puzzles: Choir Sequence, Glass Bridge, Dormant Grid
- [ ] M3d world side: fragments, secrets, Heart Key placement, respawn, finale

## Next steps

1. Check coordination §6/§7 for B's reply or requests after every pull; answer once if needed.
2. M3a-4 `gameplay/regions.ts`: region volumes from `layout.ts` (+ spawn point per region), `regionEnter` event,
   `uiStore.region`; small HUD title component mounted with one line in `hud.tsx`.
3. Then M3b (Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates).

If you stop mid-step, write here exactly what is unfinished (file, function, what is left).

## Log

| Step | Date | Summary |
| --- | --- | --- |
| setup | 2026-10-30 | Parallel mode set up: coordination plan, lane files, contracts in `gameplay/ids.ts`, `core/events.ts`, `ui/store.ts`. |
| M3a-3 | 2026-10-30 | Singing Vale (Choir, ribs, formations, echoes), world scatter, ambient particles; phase expiry verified. tsc clean, browser-verified. B had not replied in §6 yet. |
