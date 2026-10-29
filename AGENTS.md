# AGENTS.md — PROJECT ECHO (READ THIS FIRST)

> **To any AI assistant opening this repo (v0, Claude, GPT, Cursor, Copilot, …):**
> This file is your complete briefing. Read it top to bottom before touching code.
> The owner runs out of credits often and switches accounts, so **every session must leave this file accurate**.
> Requirements source of truth: [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md) (the owner's original brief, verbatim).

**Repo:** https://github.com/krushnahon99-netizen/SciFI-Game (public, branch `main`)

---

## 0. Resume protocol (do this EVERY session)

1. Read this file fully, then skim `docs/GAME_SPEC.md`.
2. Look at **§3 Current status** and **§4 Next steps**. Continue from the first unchecked item.
   Do **not** restart, re-plan, or rewrite finished systems unless they are broken.
3. Install + run (`pnpm install`, `pnpm dev`) and check the browser console before changing anything.
4. Work in small milestones. After **each** milestone:
   - update §3, §4 and append a line to **§9 Milestone log**;
   - `git add -A && git commit -m "M<n>: <summary>"`;
   - push to GitHub (see **§7 Saving work**). A milestone is not done until it is pushed.
5. Never commit a broken build. If credits/time are running low: commit + push what works now and write
   exactly what is unfinished (file, function, what is left) in §4.

**Owner's resume prompt** (paste into a fresh chat after importing this repo):

```
Read AGENTS.md in this repo first and follow its resume protocol. Continue PROJECT ECHO from
"Next steps". Commit and push to GitHub after every milestone and keep AGENTS.md updated.
```

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

- [x] **M0** — Repo, handoff docs (`AGENTS.md`), original spec (`docs/GAME_SPEC.md`), README stub.
- [ ] **M1** — Engine foundation: renderer + quality presets + bloom, height fog, sky (gradient, ringed planet, sun, clouds, stars), layered distant mountains, chunked LOD terrain, materials, third-person player (walk/run/jump, slope limits, collisions), orbit camera with collision, keyboard + mouse (pointer lock), basic HUD.
- [ ] **M2** — Echo pulse system: shader wavefront + glyph reveal, expanding shell, reactive registry, glyph path markers, memory ghosts, past-state overlays, reactive crystals.
- [ ] **M3** — World content + puzzles + progression: all regions, 3 puzzles, 3+ secrets, memory fragments, objectives, journal, save/load, respawn, ending.
- [ ] **M4** — Procedural audio: drones, wind, crystal resonance, pulse, UI/puzzle cues, footsteps, volume + mute.
- [ ] **M5** — Full UI: title/continue, skippable intro cinematic, pause menu (journal / settings / controls), end screen, perf overlay, touch controls, auto-quality.
- [ ] **M6** — Optimization, browser testing, README feature checklist (implemented / tested / untested), known limitations.

## 4. Next steps (ordered — start at the top)

1. **M1**: `pnpm add three @types/three`, then build `game/` engine foundation (see §5 file map).
2. Continue M2 → M6 in order. Keep §3/§4/§9 updated after each.

## 5. Architecture / file map

```
app/
  layout.tsx            metadata, viewport, fonts
  page.tsx              mounts <EchoGame/> (client only)
  globals.css           Tailwind v4 theme tokens + game UI styles
components/echo/        React UI overlay (HUD, menus, touch controls, intro, end screen)
game/                   Framework-agnostic engine (plain TypeScript + three)
  core/                 Game.ts (init/loop/state machine), events.ts, input.ts
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

## 7. Saving work (git) — how to push milestones

The v0 sandbox has its own internal git remote (`origin` → `git.v0.app`). GitHub is a second remote:

```bash
git remote -v                                   # check remotes
git remote add github https://github.com/krushnahon99-netizen/SciFI-Game.git   # only if missing
git add -A
git commit -m "M3: puzzles + progression"
git push github HEAD:main
```

- Never commit secrets. `.env*` files must stay ignored (check `git status` before committing).
- If the push fails with 401/403: the chat has no GitHub credentials. Ask the owner to connect GitHub
  (v0 → Settings → Git) or to import this repo via "Import from GitHub"; then v0 pushes automatically.
- In a chat that was imported from this repo, `origin` may already point to GitHub — then push to `origin`.

## 8. Known issues & limitations

- None recorded yet (project starting). Record anything untested or broken here, honestly.

## 9. Milestone log (append-only)

| Milestone | Date | Summary |
| --- | --- | --- |
| M0 | 2026-10-29 | Created handoff system: AGENTS.md, docs/GAME_SPEC.md (verbatim brief), README stub. |
