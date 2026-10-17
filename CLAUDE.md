# Flying Cars Life — Build Plan for Claude Code

> Claude Code reads this file automatically every session.
> **Do not start over.** Modify the existing project. Build in the order of section 8; earlier work that
> doesn't fit the current direction is parked in `src/_parked/` (not deleted).

---

## 1. What we are building

- **Flying Cars Life**: an open-world **driving** game in the browser set in a **real-street San Francisco**.
  Drift, explore every street, escape the police, earn cash, buy cars, and unlock **flying cars**.
- City: real street layout and hills from **OpenStreetMap** — **North Beach + Fisherman's Wharf first** —
  generated offline into streamed tiles.
- Runs in desktop and mobile browsers. No app stores. Target rating 13+ (no gore).
- Launch link: **flyingcarslife.vercel.app**. Later domain: **flyingcarslife.surpriseme.com**.
- Billboard slots in the city show the owner's products and an "Advertise here" contact (section 6.8).

### Non-negotiables
- **Look:** bright, clean, slightly stylized realism — a polished modern browser racing game. Sunny, blue sky,
  soft clouds, soft shadows, light distance haze (section 7).
- **Frontend only for now:** no Supabase, no login, no admin page. Progress saves in the browser
  (localStorage / IndexedDB). Data that will later come from a backend lives in local JSON files
  (e.g. `src/data/billboards.json`) with the same shape the backend will use.
- **Runs on phones** via automatic quality tiers. **First load under 40 MB**; city tiles stream in.
- **No real brand logos** (cars, shops, buses). All vehicles and businesses are fictional.
- Show **"© OpenStreetMap contributors"** in the menu (ODbL attribution).

---

## 2. Tech stack

| Area | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict) |
| 3D | three.js via `@react-three/fiber`, helpers from `@react-three/drei` |
| Physics | `@react-three/rapier` (Rapier 0.14). Player car: `DynamicRayCastVehicleController` tuned arcade |
| Post FX | `@react-three/postprocessing` (SMAA/FXAA, N8AO, bloom, tone mapping, grade) |
| State | `zustand` (game state), plain React state for UI only |
| Audio | WebAudio (synthesized engine/whoosh/skid where possible), `howler` for samples |
| Assets | glTF/GLB compressed with `gltf-transform` (meshopt + WebP textures; KTX2 later) |
| City data | OpenStreetMap (Overpass API) + terrain elevation tiles (Terrarium/AWS open data), converted offline |
| Hosting | Vercel (static). Asset hosting: Cloudflare R2 later |

### Environment variables
```
VITE_ASSET_URL=          # Cloudflare R2 public URL (optional; defaults to /assets)
```

---

## 3. Folder structure

```
src/
  main.tsx, App.tsx
  data/
    billboards.json       # billboard slots + creatives (backend-shaped, local for now)
  game/
    Game.tsx              # Canvas, physics world, scene root
    config.ts             # every tunable number
    quality.ts            # device detection + quality tiers
    city/                 # OSM tile loading/streaming, terrain, roads, buildings, props, road graph
    world/                # sky, sun, haze, post FX, shared materials/instancing helpers
    vehicles/             # player car (arcade drive + drift), garage models, rocket launch + flight
    traffic/              # AI traffic, buses, parked cars
    npc/                  # pedestrians (reuse the character model + walk clips)
    police/               # wanted level, pursuit AI, helicopter, busted/evade logic
    goals/                # roads discovered, photo spots, time trials, landmarks, "What's next"
    ads/                  # billboard placement + creative rotation
    store/                # zustand stores (career/save, wanted, settings, nav)
    systems/              # input, save/load
    audio/
  ui/
    hud/                  # HUD per section 6.9
    menus/                # main menu (OSM attribution), pause, garage, settings
    map/                  # full map + minimap drawing
    controls/             # touch controls
  lib/
    assets.ts             # every asset URL goes through here
    save.ts               # IndexedDB save
  _parked/                # code kept for later (multiplayer, life sim, homes, on-foot play, old city)
scripts/
  fetch-assets.ts, compress-assets.ts   # PBR textures + models
  osm/                    # offline OSM → city tiles generator
  browser-check.mjs       # headless fps / download / error checks (npm run check)
public/
  assets/                 # generated, git-ignored (textures, models)
  city/                   # generated city tiles (git-ignored or small enough to commit)
```

---

## 4. Coding rules

- TypeScript strict. No `any` unless commented why.
- Game logic in stores/systems, not inside React components. Components render state.
- Per-frame logic uses `useFrame`; never `setState` per frame for React UI. HUD reads stores with selectors and throttled updates.
- All tunable numbers live in `src/game/config.ts`.
- Every asset path goes through `lib/assets.ts`.
- Every step ends with: `npm run build` passes, no console errors, checked at 375 px wide and desktop (`npm run check`).
- Keep draw calls low: instancing for repeated props, merged static geometry per tile, LODs for buildings and cars.
- Static colliders go through chunked collider streaming (Rapier 0.14 step cost grows with total collider count).
- Several Claude sessions may work in this repo at once: commit only your own files/hunks (no `git add -A`).

---

## 5. City from OpenStreetMap

- **Offline generator** (`scripts/osm/`): fetch OSM for the area (Overpass), fetch terrain elevation, project
  to local meters around a fixed origin, and write **streamed tiles** (e.g. 250 m squares) to `public/city/`.
  The game never calls OSM at runtime.
- Tile contents: road centerlines (class, lanes, width, oneway, name), sidewalks/curbs derived from roads,
  building footprints (height/levels, use → style), parks, trees, traffic signals, crossings, bus routes
  (overhead wires), cable-car tracks, landmarks, and a terrain height grid.
- Runtime builds meshes per tile (roads draped on terrain with markings, curbs, sidewalks; extruded buildings with
  procedural facades by style; instanced props) and streams tiles in/out around the car. Colliders per tile.
- Road graph exported for GPS, traffic, police and "Roads discovered".
- Mapped area: **North Beach + Fisherman's Wharf**, plus the **Financial District towers** and the Embarcadero to
  the Ferry Building (lat 37.789–37.812, lon −122.425 to −122.391). Elevated freeways are skipped; the Bay Bridge
  is a backdrop landmark. Expand later (Russian Hill, SoMa…).

---

## 6. Game design

### 6.1 Driving (arcade)
- Fast, easy, forgiving. Handbrake (Space) starts easy drifts; counter-steer holds them.
- Tire smoke while drifting/burnouts, skid marks, sparks when scraping walls/objects, traffic cones that get knocked over.
- **Drift score** with a combo multiplier (chain drifts without crashing), paid out as **cash** when the combo ends.
- Assist toggles: **MAN** (manual feel), **ABS**, **TCS**, **ESP** — shown on the speedometer, persist in settings.
- Damage is cosmetic/light; cars never get stuck (auto-flip / reset key).

### 6.2 Rocket launch flying car (signature feature)

Reference: (A) a white car drives normally in traffic on a wide avenue near a bridge, police in the same traffic
ignore it; it tilts nose-up and rockets straight up between downtown glass towers, flipping and spinning, until it
is a tiny dot while traffic keeps driving. (B) A police car chases the car up a rooftop car park; the car flips
nose-up to vertical and shoots into the sky tumbling; the police car drives to where it was and stops.

1. **Ground mode (disguise):** flying cars look and drive exactly like normal cars — same handling, no glow, no
   thrusters, no special sound. Police and NPCs treat them as normal cars.
2. **Launch** (F / mobile "Launch"), at any speed including stopped:
   - *Nose-up (0–0.4 s):* pivot on the rear axle to ~82° (standing on the rear wheels); keep 40% of forward speed.
   - *Rocket climb + tumble (0.4–2.4 s):* thrust along world-up, ~0 → 60 m/s in ~2 s, slight forward drift in the
     original direction. Chaotic tumble from a seeded random angular velocity (mostly roll/pitch, some yaw),
     ~1.5 rotations. Loud whoosh/boom, ground dust ring + small debris, light heat shimmer. No big jet flames.
   - *Stabilize (2.4–3.0 s):* angular velocity damps to zero, the car slerps level (wheels down), vertical speed
     eases to a gentle climb. Full control after this; holding climb keeps rising ("becomes a dot").
   - Drive the Rapier body with setLinvel/setAngvel during launch; wheel raycasts off in the air, back on landing.
     Collisions stay on (hitting a building while tumbling bounces off, then it stabilizes).
3. **Flight:** forward/back thrust, turns with automatic banking, climb (Shift/Space), descend (Ctrl/mobile).
   Smooth, slightly floaty, faster than driving; max altitude ~400 m. Battery drains while airborne; HUD shows
   altitude + battery. Camera pulls back and tilts up during the launch, then sits behind and slightly above.
4. **Landing:** below ~6 m above any surface (road or roof) the car auto-levels and settles onto its wheels, then
   returns to ground mode. Empty battery = slow safe glide down, then lands. No explosion.
5. **Police + NPC reactions:** ground police can't follow into the air — they drive to the launch point and stop
   (at a roof edge they brake at the edge). At 1–3 stars launching breaks pursuit; stars flash and fade after
   ~10 s out of sight. At 4–5 stars a police helicopter follows. Launching while not wanted adds no stars.
   Bystanders within ~40 m stop, look up and point; some hold up phones.
6. **Debug teleports** (`?debug`): "Bridge launch" (wide avenue toward downtown towers, traffic + a police car
   behind) and "Rooftop launch" (multi-level rooftop car park with ramps, white deck, pillars, glass barriers,
   planters; a police car chases the player up).
7. **Tuning** lives in `config.ts` → `flying: { noseUpDeg: 82, noseUpTime: 0.4, keepForwardVel: 0.4, climbAccel: 30,
   climbMaxSpeed: 60, tumbleTime: 2.0, tumbleRotations: 1.5, stabilizeTime: 0.6, flightMaxSpeed: 70,
   maxAltitude: 400, autoLandHeight: 6, batteryDrainPerSec: 0.8 }`.
8. **Done when** it matches the clips filmed from the sidewalk, and after ~3 s the player can fly around and land
   on a road or roof and drive away.

### 6.3 Police
- Wanted stars 1–5 for reckless driving, crashes and hitting police.
- Police chase, box the player in and ram. Banner: **"Police in pursuit — evade +$X"**. Escape by breaking
  line of sight until the stars fade (reward paid on escape).
- **"Unit wrecked"** toast when a police car is destroyed.
- Boxed in for 3 s → **"Busted"**: lose some cash, respawn.
- Launching into the air escapes 1–3 stars; at 4–5 stars a **helicopter** follows.

### 6.4 Exploration and goals
- **Roads discovered**: % of the area and street count; cash for each new street driven.
- **"What's next"** panel: nearest photo spot / time trial / landmark with distance.
- Photo spots (park the car in frame at a famous view), time trials (checkpoints), landmarks.

### 6.5 Garage and economy
- Cars to buy, paint colors, wheels; unlock toasts. Flying cars are the expensive top tier.
- Cash from drifting, new streets, evading police, photo spots and time trials. Busted costs cash.
- Everything saves locally (IndexedDB).

### 6.6 Traffic and life
- Parked cars, AI traffic (stops at lights, follows lanes), red-and-white buses on bus routes, pedestrians on sidewalks.

### 6.7 Controls
- **Desktop:** W/S or arrows = throttle/brake-reverse, A/D = steer, Space = handbrake, F = rocket launch,
  Shift/Ctrl = climb/descend while flying, R = reset car, M = map, Esc = menu.
- **Mobile:** steering + throttle/brake buttons (or joystick), handbrake, launch, climb/descend, menu.

### 6.8 Billboards
- Slots on walls, rooftops and along main roads.
- Read from `src/data/billboards.json`: `slot_id, image, link, start_date, end_date` (same shape as the future backend).
- Empty slots rotate the owner's products — **BIZZSMS, Veyra, Nariesa, Bejite** (placeholder images for now) — and
  **"Advertise here: wisdomudoudo24@gmail.com"**.

### 6.9 HUD layout
- **Top-left:** toasts, wanted stars, pursuit banner, drift score.
- **Top-center:** "What's next".
- **Top-right:** Race / Party (disabled for now) / Menu buttons, and cash.
- **Bottom-left:** round minimap with district + street name.
- **Bottom-right:** round km/h speedometer with gear letter and assist toggles (MAN/ABS/TCS/ESP).
- **Bottom-center:** small gauges (drift multiplier, altitude while flying).
- Style: dark translucent panels, white text, teal accents.

---

## 7. Visual style: San Francisco

- Bright midday sun, blue sky with soft clouds, soft shadows, light distance haze. Clean and polished, slightly stylized.
- **Houses:** pastel Victorians (mint, peach, lavender, butter yellow, sky blue, white) with bay windows, cornices, stoops.
- **Shops:** 3–6 storey mixed-use buildings with ground-floor shopfronts and colored awnings; fictional signage.
- **Downtown:** glass towers (blue/teal/grey glass).
- **Streets:** dark asphalt with crisp white lane lines, double yellow center lines, zebra crossings, curbs, wide
  sidewalks, street trees, lamps, traffic lights, overhead bus wires, cable-car tracks, traffic cones.
- Steep hills come from real terrain; streets follow them.
- **Vehicles:** fictional cars (the "Flying Car" EV and others), red-and-white buses, police cruisers.

---

## 8. Build order (current)

1. ✅ Audit and park what doesn't fit.
2. ✅ **City from OSM** — generator + streamed tiles for North Beach / Fisherman's Wharf: terrain, roads with markings,
   sidewalks/curbs, Victorian/shop/tower buildings, trees, lamps, signals, wires, cable-car tracks, cones.
3. ✅ **Driving / drift feel** — arcade handling, handbrake drifts, smoke, sparks, cones, drift score → cash, assists.
4. ✅ **Traffic and pedestrians** — parked cars, AI traffic, buses, pedestrians.
5. ✅ **HUD** per section 6.9. → *Stop and show the user.*
6. **Police** per section 6.3.
7. **Rocket launch flight** per section 6.2 (moved ahead of police at the user's request).
8. **Goals and garage** per sections 6.4–6.5.
9. **Billboards** per section 6.8.
10. **Phone performance** — budgets in section 10.

Each step: `npm run build` passes, no console errors, checked at 375 px and desktop.

---

## 9. Parked for later

Kept in `src/_parked/` (and `supabase/` for SQL). Not wired into the game.
- **Multiplayer:** rooms over Supabase Realtime / local tabs, name tags, chat, player list (mute/block/report),
  emotes, friends, demo crowd. Supabase Realtime caps live connections (~200 free / 500 Pro); large scale needs a
  dedicated realtime layer later.
- **Weapons and combat.**
- **Life sim:** jobs, rent, houses/interiors with furnishing, needs, weight/calories, businesses with menus.
- **On-foot play:** character controller, third-person camera (the character model is reused for pedestrians).
- **Backend:** Supabase auth, cloud saves, leaderboards, ad booking + payments (`supabase/migrations/0001_init.sql`), admin page.
- **Old procedural city** ("Harbor City" grid) once the OSM city replaces it.

---

## 10. Performance budgets

| Tier | Target | Textures | Shadows | Post FX |
|---|---|---|---|---|
| Low (phones) | 30 fps | 512–1K | 1 cascade, low res | FXAA only |
| Medium | 30–45 fps | 1K | medium | SMAA + bloom |
| High | 60 fps | 2K | high | + SSAO |
| Ultra | 60 fps | 2K–4K | high | + full grading |

- First load under 40 MB; each streamed city tile under 8 MB (aim for far less).
- Draw calls under 300 on Low, under 800 on High.

---

## 11. Asset sources and licensing

- **OpenStreetMap** (ODbL): street/building data — attribution "© OpenStreetMap contributors" in the menu.
- **Terrain:** Terrarium elevation tiles (AWS Open Data, Mapzen) — credit in `ASSET_CREDITS.md`.
- **Poly Haven** (CC0): HDRIs, textures, props. **Khronos glTF samples** (CC-BY 4.0): the Flying Car EV.
- **Mixamo / three.js examples:** character + walk clips (pedestrians).
- Never use real brand logos or GTA/Rockstar assets. Keep `ASSET_CREDITS.md` up to date.
