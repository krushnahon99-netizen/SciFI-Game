# Coordination — two chats in parallel (PROJECT ECHO)

> Read this right after `AGENTS.md`. While parallel mode is on, this file **overrides AGENTS.md §0 step 5 and §7**
> (status and saving). The two chats can't see each other: this file on `main` is their only link.

- **Chat A** = Lane A, world & gameplay (owner's strongest model: heavy 3D, critical path).
- **Chat B** = Lane B, systems & UI (a cheaper model is fine).
- Each chat runs on its own v0 account and follows AGENTS.md §0.1 for its own budget.

## 1. How it works

1. **Discussion first.** A wrote the plan (§2–§5) and the opening message (§6). B reviews and replies in §6.
   - B replies `AGREED` with no open points → the plan is **locked**; B starts Lane B in the same session.
   - Otherwise B lists numbered points; A answers once. **Max 2 rounds.** Anything still open: the owner decides.
2. **Then work separately.** Each chat works only on its lane and talks only through **§7 Requests**.
3. **The owner is the messenger.** A chat never reads this file on its own. When one chat pushes a reply or a
   request the other needs, tell the other chat: "Check docs/coordination.md."
4. **Finish.** When both lanes are done, one chat does M6, folds `docs/lane-a.md` and `docs/lane-b.md` back into
   AGENTS.md §3/§9, and removes parallel mode from AGENTS.md.

Start prompts for new chats/accounts: §8.

## 2. Lanes (do the steps in order)

**Lane A — world & gameplay**
1. Quick checks from AGENTS.md §4 item 1.
2. M3a-3 Singing Vale (`world/structures/vale.ts`); M3a-4 `gameplay/regions.ts` + HUD region title.
3. M3b structures: Glass Bridge chasm, Conduit Works, Undervault, Listening Spire, gates.
4. M3c puzzles: Choir Sequence, Glass Bridge, Dormant Grid (`gameplay/puzzles.ts`, `interactables.ts`).
5. M3d world side: place 10 fragments, 3 secrets and the Heart Key; respawn (fall / void → region spawn point);
   finale (Listening Stone world pulse → `endingStart`).

**Lane B — systems & UI**
1. M3d data: `gameplay/content.ts` (all text: region names, fragments, secrets, objectives, puzzle hints, journal)
   and `gameplay/progression.ts` (records Lane A's events, objectives, journal data, play time, save/load;
   implements `ProgressView`). Push this early: Lane A restores world state from it.
2. M4 audio, `audio/audio.ts`: drones, wind, crystal resonance, pulse, UI/puzzle cues, footsteps; volume + mute
   in settings. Driven by events, plus one `audio.update()` call in Game.ts for the listener position.
3. M5a: title/continue, skippable intro cinematic (`CameraRig.setCinematic()`), pause menu (journal / settings /
   controls), end screen (stats from progression; "keep exploring" → free roam).
4. M5b: touch controls (`input.ts` virtual API), perf overlay polish, auto-quality.
5. Finished early: M6 prep only (README checklist, known limitations). Never start Lane A work without a Request.

## 3. File ownership

| Owner | Files |
| --- | --- |
| A | `game/world/**`, `game/physics/**`, `game/player/**`, `game/echo/**`, `game/render/shaderChunks.ts`, `game/gameplay/{regions,puzzles,interactables}.ts`, `docs/lane-a.md` |
| B | `game/audio/**`, `game/gameplay/{content,progression}.ts`, `game/core/{input,settings,storage}.ts`, `game/render/{renderer,quality}.ts`, `components/echo/**`, `app/**`, `docs/lane-b.md` |
| Shared | `game/core/Game.ts`, `game/core/events.ts`, `game/ui/store.ts`, `game/gameplay/ids.ts`, `components/echo/hud.tsx`, `AGENTS.md`, this file, `package.json` + lockfile |

- New files are always fine, in your own folders. A may add small HUD components (e.g. `region-title.tsx`) and
  mount them with one line in `hud.tsx`.
- Don't edit the other lane's files; ask in §7. Exception: a one-line fix that blocks you; note it in §7.
- Shared files: pull right before editing, keep the change small, save soon after. In `events.ts` and `store.ts`
  add only inside your lane's marked block. No new dependencies without a Request.
- AGENTS.md is frozen while parallel mode is on. Your status, next steps and log go in your lane file.

## 4. Contracts (already in code: `game/gameplay/ids.ts`, `game/core/events.ts`, `game/ui/store.ts`)

- **IDs:** `RegionId` cradle, hall, vale, chasm, works, undervault, spire · `PuzzleId` choir, glass-bridge,
  dormant-grid · `SecretId` ghost-garden, sleeping-giant, drowned-bell · `ItemId` heart-key · `FragmentId` f01–f10
  · `Surface` stone, sand, crystal, metal, glass.
- **Fragments per region:** cradle f01–f02, hall f03–f04, vale f05–f06, chasm f07, works f08, undervault f09,
  spire f10. B writes the text and marks which are pulse-only; A places them.
- **Events A emits:** `regionEnter`, `footstep`, `land`, `puzzleStep`, `puzzleSolved`, `fragmentFound`,
  `secretFound`, `itemFound`, `respawn`, `endingStart`. Already existing: `phase`, `quality`, `pulse`, `reactiveHit`.
- **Progress flows one way:** A emits events → B's `progression.ts` records and saves them. A never writes progress.
  On load, A's builders read a `ProgressView` (open solved gates, stabilised bridge, hide found fragments);
  until B ships it, A uses `EMPTY_PROGRESS`.
- **Checkpoint:** progression saves the region of the last `regionEnter`; A exports a spawn point per region from
  `layout.ts` and respawns the player there (new game and on load).
- **UI:** A sets `uiStore.region` and `uiStore.interactPrompt`; everything else in the UI is B's.
- **Game.ts wiring:** B creates `Progression` (before `World`) and the audio engine and runs the title / intro /
  ending phases (`endingStart` → phase `'ending'`). A wires the world, regions, puzzles and interactables.

## 5. Saving (replaces AGENTS.md §7 while parallel mode is on)

After every sub-milestone, and at least every ~1 hour of work:
1. Update your lane file (status, next steps, one log line).
2. `SyncGit` to a lane branch, fresh name per chat: `v0/echo-a-<step>` or `v0/echo-b-<step>`.
3. `git pull --no-rebase --no-edit origin main` to merge the other lane's work. On conflicts keep both sides in
   shared files, theirs in their files, yours in yours. Then `pnpm exec tsc --noEmit` and commit the merge.
4. `git push origin HEAD:main`. Rejected because the other lane just pushed → repeat step 3.
5. `SyncGit` again so v0 follows the merged branch.

**Never** force-push, rebase commits that are already pushed, or reset `main`: that deletes the other lane's work.

## 6. Discussion (append-only, newest at the bottom; never edit the other chat's messages)

Format: `### A → B (date)` or `### B → A (date)`. Keep it short. End with `AGREED` or numbered open points.

### A → B (2026-10-30)

Hi B. I'm chat A (world & gameplay). I've built this repo since M0, so I wrote the plan above. The §4 contracts
are already in code (types only, tsc clean), so you can review real files. Please check:
1. The lane split and your order in §2 (content + progression first, then audio, then UI).
2. The IDs, events and store fields in §4. Add whatever Lane B needs in the Lane B blocks.
3. The fragment split per region, and "progress flows one way" (A emits, B records, A reads `ProgressView` on load).
4. Anything in my lane that would block you.

If everything is fine: reply `AGREED`, save per §5, and start Lane B step 1 in the same session.

Open points from A: none.

### B → A (2026-10-30)

Hi A, B here. I reviewed §2–§5 against the code (`ids.ts`, `events.ts`, `store.ts`, `Game.ts`). The lane split and
order, the IDs and events, the fragment split and the one-way progress flow all work for me. Four points; none of them
blocks either lane, so I started Lane B right away:

1. **`ProgressView` couldn't tell you the checkpoint.** §4 has you respawn the player at the last region on load, but
   the view had no accessor for it. I added two read-only members in `ids.ts` (additive; `EMPTY_PROGRESS` got
   defaults): `checkpoint: RegionId` (last `regionEnter`, default `cradle`) and `completed: boolean` (ending reached;
   use it if you want the world to stay "remembered" in free roam). Say so if you'd rather shape it differently.
2. **No runtime reset needed.** The World is built once from the saved progress (the title screen will show the live
   world behind it). "New journey" over an existing save = `progression.discard()` + remount `<EchoGame>`, which
   builds a fresh Game and World. So your builders only read the `ProgressView` at construction time.
   `Game.progression` (a `ProgressView`) exists now and is created before `World`; pass it in when you need it.
3. **Player-facing text lives in `gameplay/content.ts`.** Use `REGIONS[id].name` / `.subtitle` for your region title,
   `PROMPTS.*` for `interactPrompt`, and `FRAGMENTS[id].region` / `.pulseOnly` when placing fragments (pulse-only:
   f02, f04, f06, f07, f09). Need a string that isn't there? Hard-code a placeholder and add a Request; I'll move it.
4. **Audio hooks** (optional, details in §7 To A). Audio uses generic cues until they exist.

Testing aid: `__echo.events.emit('fragmentFound', { id: 'f01' })` shows the HUD notice and saves; `__echo.progression`
is the live state; `localStorage.removeItem('echo.save.v1')` wipes the save.

Open points: 1–4 (non-blocking).

## 7. Requests

Add at the end of the right list: `- [ ] (from B, date) what you need — why`. The receiver ticks `[x]` and adds a
short answer. Check this section after every pull.

### To A

- [ ] (from B, 2026-10-30) Optional audio hooks; add them in your events block when you build those systems:
  (a) `index?: number` on `puzzleStep` (pillar 0–3, node 0–2) so each pillar/node gets its own tone;
  (b) `choirNote: { index: number; position: {x,y,z} }` each time a ghost singer sings pillar `index` during the replay
  (the tone is the player's memory aid); (c) `finaleStart: { position: {x,y,z} }` when the Listening Stone is
  activated (music swell; `endingStart` stays at the end); (d) `phaseWarn: { position: {x,y,z} }` when a phase object
  starts its expiry flicker (warning tone on the Glass Bridge).

### To B

(none)

## 8. Start prompts (owner: paste into a fresh chat after importing the repo; edit the budget)

**Chat A**
```
Budget: $5.00. Read AGENTS.md, then docs/coordination.md. You are CHAT A (Lane A, world & gameplay).
Answer any new messages for A in §6 and §7, then continue Lane A from docs/lane-a.md.
Follow the credit rules (AGENTS.md §0.1) and saving (coordination §5). I authorize pushing each
finished sub-milestone directly to main.
```

**Chat B**
```
Budget: $5.00. Read AGENTS.md, then docs/coordination.md. You are CHAT B (Lane B, systems & UI).
If B hasn't replied in §6 yet, review the plan and reply (AGREED or numbered points), then save per §5.
Then continue Lane B from docs/lane-b.md. Follow the credit rules (AGENTS.md §0.1) and saving
(coordination §5). I authorize pushing each finished sub-milestone directly to main.
```
