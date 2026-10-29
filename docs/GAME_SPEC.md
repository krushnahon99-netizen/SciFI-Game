# PROJECT ECHO — THE WORLD THAT REMEMBERS

## Ultimate 3D Browser Game Engineering Challenge

> Original brief from the project owner, kept verbatim (only Markdown formatting restored).
> This is the source of truth for requirements. Progress is tracked in `AGENTS.md`.

You are Opus 5.5 acting as an elite AAA game development team: a senior graphics engineer, Three.js specialist, GLSL shader programmer, gameplay engineer, technical artist, world designer, and performance optimization expert.

Your mission is to independently DESIGN, IMPLEMENT, TEST, AND POLISH an original, playable 3D sci-fi exploration game that runs in a modern web browser.

This is not a concept-art assignment. Do not merely describe a game, produce a mockup, or build a static scene. Create a functioning interactive experience with real gameplay systems, an explorable environment, original mechanics, high-quality visuals, and responsive controls.

You are working through a cloud PC. Do not assume that you have a dedicated GPU, access to a powerful graphics workstation, or the ability to inspect visuals automatically. Determine which development and testing tools are actually available. Use the available capabilities intelligently.

## 1. THE VISION

Game title: ECHO
Tagline: THE WORLD REMEMBERS EVERYTHING.

Genre: Third-person sci-fi exploration, environmental puzzle-solving, atmospheric adventure.

The player awakens alone on an abandoned alien world. The planet is not dead. It is remembering.

Ancient structures react to the player's movements. Invisible events from the past can be reconstructed using an echo pulse. Ruined machines awaken. The landscape reveals fragments of a lost civilization.

The central mechanic is that the player can send a pulse through the environment, temporarily revealing traces of past events and activating objects that exist between two states of reality.

The experience should feel mysterious, cinematic, atmospheric, and visually memorable.

Do not imitate an existing game directly. Create an original identity, world, interface, soundscape, and gameplay design.

## 2. TECHNICAL FOUNDATION

Use a practical browser-native technology stack:

- Three.js for 3D rendering.
- JavaScript or TypeScript with clean, maintainable modules.
- WebGL-compatible materials and GLSL shaders where appropriate.
- Vite or another lightweight development server.
- Procedural geometry and textures where useful.
- Web Audio API for original procedural sound effects.
- HTML and CSS for a polished interface.

Choose stable, mutually compatible dependencies. Verify actual package versions and APIs before relying on them.

Avoid requiring paid APIs, external authentication, proprietary game engines, cloud GPU access, or enormous asset downloads.

The entire project must be runnable using documented commands.

## 3. VISUAL QUALITY — PUSH IT AS FAR AS PRACTICAL

Build a cohesive cinematic visual experience rather than a collection of expensive graphical effects.

ENVIRONMENT:

- Vast-looking alien landscapes with layered mountains and distant silhouettes.
- A mysterious ancient civilization with distinctive architecture.
- Broken monoliths, abandoned structures, alien vegetation, crystalline formations, and environmental debris.
- Carefully designed terrain silhouettes and meaningful landmarks.
- Multiple exploration areas connected into a continuous playable environment.

LIGHTING AND ATMOSPHERE:

- A dramatic alien sky with a distinctive planet or moon.
- Procedural sky gradients and atmospheric haze.
- Height-aware fog where practical.
- Cinematic directional lighting and ambient illumination.
- Real-time shadows only where affordable.
- Screen-space or shader-based effects only when reliable and useful.
- A restrained bloom effect for emissive objects, using an appropriate post-processing implementation if available.
- Subtle environmental particles, floating dust, and glowing spores.

MATERIALS:

- Weathered stone, metallic ruins, crystalline surfaces, alien vegetation, and emissive technology.
- Procedural textures and shader variation to avoid repetitive surfaces.
- Carefully controlled roughness, metallic appearance, and emissive intensity.
- Stylized realism that looks cohesive rather than fake or excessively saturated.

ANIMATION:

- Moving clouds or atmospheric layers.
- Animated energy flowing through ancient structures.
- Pulsing crystals.
- Subtle environmental movement.
- Animated particles and reactive environmental elements.

Do not add effects merely because they sound impressive. Every graphical feature must work, look coherent, and respect performance limits.

## 4. SIGNATURE GAMEPLAY MECHANIC: THE ECHO PULSE

This mechanic is the heart of the game.

The player can emit an energy pulse that travels through the environment.

When activated, it must produce visible, functional consequences:

1. A wave or expanding energy field travels outward from the player.
2. Nearby objects react when the pulse reaches them.
3. Ancient symbols and hidden pathways temporarily become visible.
4. Special objects reveal fragments of their previous states.
5. Certain ruins activate, opening pathways or enabling puzzles.
6. The pulse produces a distinctive procedural sound and visual response.
7. Objects return to their inactive states when the effect expires, where appropriate.

Implement actual interaction logic. Do not simulate this mechanic using only a screen overlay.

Use efficient distance checks, collision queries, or another appropriate system to identify affected objects.

The pulse should reveal a hidden version of the environment without requiring the entire world to be duplicated at full rendering cost.

## 5. WORLD EXPLORATION

Create a compact but richly detailed playable world.

Include:

- A starting area with a clear visual landmark.
- A mysterious ruined structure.
- A crystalline valley.
- An abandoned alien facility.
- A hidden chamber or underground area.
- At least three discoverable environmental secrets.
- Collectible memory fragments that reveal pieces of the world's story.
- Environmental clues that encourage exploration.
- A final destination that provides a meaningful conclusion to the initial playable experience.

Use procedural terrain, reusable modular architecture, instancing, and level-of-detail techniques where appropriate.

The world should feel much larger than its actual polygon count suggests.

Prioritize distinctive locations and environmental storytelling over simply increasing the map size.

## 6. PLAYER CONTROLS

Implement responsive third-person movement:

- Walk and run.
- Jump where appropriate.
- Smooth camera rotation.
- Camera collision or obstruction handling.
- Reliable collision with terrain and structures.
- Interactions with nearby objects.
- Echo pulse activation.
- Collectible pickup.
- Pause and resume.

Provide keyboard and mouse controls for desktop testing.

Also implement mobile-friendly touch controls:

- Virtual movement joystick.
- Camera-look area.
- Jump button.
- Echo pulse button.
- Interaction button when relevant.

Controls must be functional, appropriately sized, and usable on a touchscreen.

Prevent accidental browser scrolling, text selection, and unwanted gestures over the game controls.

Provide a clear control guide and adapt the interface to the available screen dimensions.

## 7. PUZZLES AND PROGRESSION

Create at least three functioning environmental puzzles that use the echo mechanic.

Example puzzle types:

- Reveal an invisible bridge.
- Restore the sequence of ancient symbols.
- Reactivate a dormant power network to open a sealed door.

Implement real puzzle states, success conditions, and feedback.

Add a lightweight progression system:

- Memory fragments can be collected.
- Discoveries update the journal.
- Puzzle completion unlocks new areas.
- A final objective provides a clear end to the initial adventure.

Save reasonable progress using localStorage, with graceful fallback if storage is unavailable.

Do not make the game depend on a backend.

## 8. AUDIO AND PRESENTATION

Create an atmospheric soundscape using original procedural audio where feasible.

Include:

- Low ambient drones.
- Soft environmental wind.
- Crystalline resonances.
- Echo pulse sounds.
- Interaction feedback.
- Puzzle completion cues.

Audio should begin only after an appropriate user interaction if required by browser autoplay restrictions.

Include a working mute control and volume settings.

Create an opening sequence with a brief, skippable introduction. Transition smoothly into interactive gameplay.

Use a restrained, cinematic user interface with readable typography, subtle animation, and minimal visual clutter.

## 9. PERFORMANCE ENGINEERING

You do not possess guaranteed access to a dedicated GPU. Your task is to WRITE graphics code, not assume that your own environment can render it at maximum quality.

The browser's actual graphics hardware and software will determine final rendering performance.

Build an adaptive rendering system with:

- Quality presets: Low, Medium, High, and Ultra.
- Adjustable render resolution or device-pixel ratio.
- Efficient geometry and material reuse.
- Instanced meshes for repeated objects.
- Frustum culling and suitable level-of-detail strategies.
- Bounded particle counts.
- Limited shadow-map resolution and shadow distance.
- Efficient shader complexity.
- Controlled post-processing.
- Lazy loading where useful.
- Disposal of unused geometries, materials, and textures.
- A simple performance display showing FPS and rendering statistics when supported.

Ultra must mean the best available visual settings, not unlimited effects that crash the browser.

Do not assume that a cloud environment's performance represents a player's device performance.

Aim for smooth performance on typical modern hardware, with 30 FPS as a reasonable initial target on supported devices and 60 FPS where achievable. Measure rather than promise.

If a feature is too expensive, implement a visually convincing, less expensive alternative.

## 10. DEVELOPMENT WORKFLOW

Work directly with the available cloud-PC filesystem and development tools, if they are accessible.

First:

1. Inspect the current working directory.
2. Identify the installed runtime, package manager, browser, and available testing tools.
3. Determine whether the project directory already contains files.
4. Choose the smallest reliable setup for the complete game.

Then implement the project in logical stages.

- Stage A: Create the project and a working 3D environment.
- Stage B: Implement player movement, camera, collision, and controls.
- Stage C: Implement the echo pulse and reactive objects.
- Stage D: Build the explorable locations, puzzles, collectibles, and progression.
- Stage E: Add materials, shaders, atmospheric effects, lighting, and animation.
- Stage F: Implement audio, user interface, settings, and mobile controls.
- Stage G: Optimize, test, fix errors, and polish the complete experience.

You may adjust the order when dependencies require it. Do not stop after creating a plan or a minimal prototype if the environment permits further implementation.

## 11. TESTING AND HONESTY

Run the project using the actual available development commands.

Check:

- Dependency installation and build errors.
- JavaScript exceptions where testing tools are available.
- Player movement and collision.
- Echo pulse activation and object reactions.
- Puzzle completion.
- Collectible progression.
- Touch and keyboard controls.
- Settings and save behavior.
- Rendering behavior and performance limitations.

Use browser automation or visual inspection only if those tools are genuinely available.

If a test cannot be performed, explicitly identify it as untested. Never claim to have verified a visual result simply because the code compiled.

Fix the errors you can reproduce.

Do not leave critical features as TODO comments, dead buttons, fake loading screens, or nonfunctional interface elements.

If the full vision cannot fit into one implementation pass, prioritize a complete, playable vertical slice with several functioning systems and a coherent conclusion. Then continue improving it.

## 12. PROJECT STRUCTURE AND DELIVERABLES

Create a maintainable project structure with separate modules for:

- Game initialization.
- Scene and environment.
- Player controller.
- Camera and controls.
- Echo pulse system.
- Interactable objects.
- Puzzle logic.
- Progression and collectibles.
- User interface.
- Audio.
- Graphics settings and performance.

Use sensible naming, comments for non-obvious logic, and proper cleanup.

Deliver:

1. The complete project source code.
2. A working development build.
3. A successful production build where the environment permits it.
4. A README with exact installation and launch commands.
5. A control guide.
6. A feature checklist separating implemented, tested, and untested functionality.
7. A short explanation of graphics settings and known limitations.

If deployment credentials or a hosting service are unavailable, do not invent a deployed URL. Leave the project ready to deploy and explain the next step.

## FINAL DIRECTIVE

Do not optimize for the number of files or the length of the code. Optimize for the quality of the finished experience.

I want an original, technically sound, visually striking, genuinely playable browser game.

Start by inspecting the available environment, then build the game. Make sensible decisions independently, verify your implementation wherever possible, and continue improving it until you have delivered the strongest complete result that the available resources support.
