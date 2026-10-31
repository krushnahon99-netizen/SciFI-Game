# ECHO — The World Remembers Everything

An original third-person sci-fi exploration and environmental-puzzle game for the browser, built with Three.js and
WebGL. You wake alone on an alien world whose stone remembers. Send an **Echo Pulse** through it to reveal hidden
glyph paths, the ghosts of the people who lived here, the intact past of broken ruins, and bridges that only exist
between two states of reality.

- **Status:** complete and playable from the first step to the ending (all planned milestones, M0–M6, are done).
- Everything is procedural: no downloaded models, textures or audio files, no backend, no paid APIs.
- Design brief: [`docs/GAME_SPEC.md`](docs/GAME_SPEC.md). Developer and AI handoff notes: [`AGENTS.md`](AGENTS.md).

## Install and run

Requirements: **Node.js 20 or newer** and **pnpm** (`package.json` pins pnpm 12; `corepack enable` installs it).

```bash
git clone https://github.com/krushnahon99-netizen/SciFI-Game.git
cd SciFI-Game
pnpm install
pnpm dev          # development build at http://localhost:3000
```

Production build:

```bash
pnpm build        # optimized build
pnpm start        # serves it at http://localhost:3000
```

**Deploy:** import the repository into Vercel (Next.js preset, no environment variables needed). The project has no
official deployed URL yet.

Open the page and click **Begin** (or **Continue** if a journey is saved). Sound starts with your first click or tap.

## Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Move | W A S D or arrow keys | Left half: drag the floating joystick |
| Run | Hold Shift | Push the joystick to its edge |
| Look | Mouse (click the game to capture it) | Drag on the right half |
| Zoom | Mouse wheel | Pinch on the right half |
| Jump | Space | Jump button |
| Echo Pulse | Q or left click | Pulse button (its ring shows the recharge) |
| Interact (attune, recover, take, place) | E | Interact button (shown when something is in reach) |
| Pause menu | Esc | Menu button (top right) |
| Journal | J | Pause menu → Journal |
| Mute | M | Pause menu → Settings |
| Performance stats | F3 | Pause menu → Settings → Performance stats |
| Free-fly debug camera | F4 | — |
| Skip the intro | Esc or the Skip button | Skip button |

If the browser refuses mouse capture (for example inside a sandboxed iframe), drag to look instead; a click then
fires the pulse. Keys are read by physical position, so WASD also works on other keyboard layouts.

## How to play

The objective (top left) and the journal (J) always say what to do next. After a failed attempt at a puzzle, the
journal adds hints. The route: **The Cradle → Hall of Echoes → Singing Vale → Glass Bridge → Conduit Works →
Undervault → Listening Spire**.

<details>
<summary>Walkthrough (spoilers)</summary>

1. **The Cradle**: send a pulse (Q). The wave reveals glyphs on the ground, the Sundered Monolith's intact past and
   the ghosts of pilgrims. Follow the trail north through the ridge pass.
2. **Hall of Echoes, Choir Sequence**: pulse near the altar. Four ghost singers appear one after another, one at each
   glyph pillar. Attune the pillars (E) in the same order. A wrong pillar silences them all; watch again. Then the north
   gate opens.
3. **Singing Vale**: a crystal valley and the ruined Choir. Continue to the chasm.
4. **Glass Bridge**: the planks are phase objects. They are solid for about 7 seconds after a pulse reveals them and
   flicker before they fade. Pulse at the pier, cross, and pulse again if you need to. Reaching the far pier makes the
   bridge permanent. If you fall, you respawn at the landing.
5. **Conduit Works, Dormant Grid**: three power nodes stand too far apart for one pulse. A pulse within about 11 m
   charges a node; it stays full for 5 seconds, then fades over 13 seconds. Light all three at once and the vault door
   sinks.
6. **Undervault**: go down the stair and take the Heart Key from the shrine (E).
7. **Listening Spire**: climb the ramp, set the Heart into the barrier gate (E), then touch the Listening Stone (E).
   The world remembers. Afterwards you can keep exploring.

**Secrets:** the Ghost Garden (a hidden glyph path from the Cradle leads to stepping stones that exist only after a
pulse), the Sleeping Giant (pulse near a buried stone face, then inspect it) and the Drowned Bell (pulse inside its
crater). There are **ten memory fragments**; five of them are visible only right after a pulse.
</details>

## Graphics settings

Pause menu → Settings (also on the title screen). Settings are saved in the browser.

| Preset | Pixel ratio cap | Shadows (map, radius) | Bloom, MSAA | View distance | Scatter | Particles |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 1 | off | off | 1600 m | 45 % | 300 |
| Medium | 1.25 | 1024², 40 m | on, 2× | 1800 m | 70 % | 800 |
| High | 1.5 | 2048², 55 m | on, 4× | 2000 m | 100 % | 1500 |
| Ultra | 2 | 4096², 75 m | on, 4× | 2400 m | 130 % | 2500 |

- **Auto** (the default) picks a preset from device hints: Low on software renderers and most phones, High on typical
  desktops. If the frame rate stays below 28 FPS for about 6 seconds, it steps down one level. It never steps up by
  itself, and choosing a preset turns it off.
- **Render scale** (50–100 %) multiplies the pixel ratio. It is the cheapest way to gain frame rate on high-DPI
  screens.
- Terrain detail distances, scatter density and texture filtering also scale with the preset.
- **Performance stats** (F3): FPS, frame and CPU time, draw calls, triangles, geometries, textures, pixel ratio,
  quality and GPU name.

Measured in headless Chromium with a software GPU, from the starting view: Low 247 draw calls and 188k triangles,
Medium 290 and 264k, High 293 and 324k, Ultra 300 and 395k. The software GPU runs Low at about 8 FPS at 480×320.
That number says nothing about real hardware: **frame rates on real GPUs are untested.**

## Feature checklist

"Tested" means exercised in a real browser (headless Chromium with SwiftShader software rendering) through
automation, with screenshots and state checks. Nothing was tested on a physical GPU, phone or tablet.

### Implemented and tested

- [x] The development build runs. The production build succeeds, and the production server returns the page and all
      scripts (HTTP 200) with the security headers.
- [x] World: heightmap terrain with LOD chunks, sky with the ringed planet and sun, height fog, distant mountains,
      scattered rocks and plants, ambient particles, bloom.
- [x] Player: walk, run, jump, the 40° slope limit (stops at the foot of the ridge), collisions with structures (no
      passing through, sliding along walls), stairs, respawn after a fall.
- [x] Camera: orbit, wheel zoom, pull-in when a wall is behind the player (5.2 m to 0.5 m against the Monolith),
      cinematic shots.
- [x] Echo Pulse: wavefront, glyph reveal, recharge ring. Reactive objects: glyph trails, crystals, ghosts, past-state
      holograms, phase objects (expiry and flicker warning).
- [x] Seven regions, with a title card on entry; every spawn point checked.
- [x] Puzzles: Choir Sequence (replay order, reset on a wrong pillar, gate), Glass Bridge (crossing makes it
      permanent), Dormant Grid (timed charges open the door).
- [x] Ten memory fragments (five pulse-only), three secrets, the Heart Key, the Spire barrier, the finale (world pulse
      and cinematic), the end screen with stats, Keep exploring and Return to title.
- [x] Save and load in localStorage: discoveries, solved puzzles, checkpoint. Continue restores the world; New journey
      erases the save.
- [x] Title screen, skippable intro, pause menu (journal with hints, settings, controls), objective and discovery
      notices.
- [x] Saved settings: quality, Auto step-down (High → Medium → Low on the software GPU), render scale, volume, mute.
      Performance stats toggle.
- [x] Touch controls, driven by synthetic touch events: joystick and run, look, pinch zoom, jump, pulse, interact,
      menu.
- [x] Procedural audio graph: the audio context starts on the first gesture, every cue fires and releases its voices,
      mute, volume and the pause duck work.

### Implemented but untested

- [ ] Frame rate and visuals on real GPUs (desktop and integrated laptop graphics), including High and Ultra.
- [ ] Real phones and tablets (multi-touch feel, safe areas, performance, heat throttling).
- [ ] Safari and Firefox (developed and tested in Chromium only).
- [ ] How the audio actually sounds (checked as a signal graph, never listened to).
- [ ] The production build running in a browser (it was built and served; browser tests used the development build).
- [ ] Very long sessions (memory use over hours).

### Not implemented

- Gamepad support, key rebinding, localization.
- Anti-aliasing on Low (see below).

## Known limitations

- **Low has no anti-aliasing:** MSAA runs on the post-processing target, which Low skips.
- **Mouse capture** (pointer lock) is refused in sandboxed iframes, such as some previews. Input then falls back to
  drag-to-look.
- **Software rendering** (no GPU, for example a blocked driver) is detected and starts at Low. It is playable but slow.
- **Auto quality never raises the preset.** On a strong GPU, pick High or Ultra yourself.
- The risers of the **Cradle dais** are taller than a step: jump onto them.
- The first seconds after loading compile many shaders, so expect a short hitch, longer on weak GPUs.
- Saves live in this browser's localStorage (`echo.save.v1`, settings in `echo.settings.v1`); private windows may
  forget them. New journey on the title screen erases the save.

## Project structure

```
app/                Next.js App Router shell: the page mounts the game; metadata and theme
components/echo/    React UI overlay: HUD, title, intro, pause menu and journal, end screen, touch controls
game/core/          game loop and phases, events, input, settings, storage
game/render/        renderer and post-processing, quality presets, auto quality, shader chunks (fog, pulse)
game/world/         layout (all coordinates), terrain, sky, mountains, scatter, particles, materials, structures/
game/physics/       heightmap ground and colliders, character resolution, camera clearance
game/player/        controller, procedural avatar, third-person camera, debug free-fly camera
game/echo/          Echo Pulse and reactive objects (glyphs, crystals, ghosts, holograms, phase objects, glows)
game/gameplay/      regions, interactables, puzzles, fragments, secrets, finale, intro, progression, content (all text)
game/audio/         procedural Web Audio engine
docs/               design brief and as-built notes
```

The engine in `game/` is plain TypeScript and three.js. It loads lazily on the client as one chunk (about 216 KB
gzipped); React renders only the overlay.
