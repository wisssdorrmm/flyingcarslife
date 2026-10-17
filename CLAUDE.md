# Flying Cars Life — Build Plan for Claude Code

> Put this file in the root of the repo as `CLAUDE.md`. Claude Code reads it automatically every session.
> Build **one phase at a time**. Do not start the next phase until the current one passes its checklist.

---

## 1. What we are building

- **Flying Cars Life**: a realistic, third-person, open-world life simulator in the browser.
- Setting: **Harbor City**, a fictional modern US city a few years in the future. Flying cars exist but are new and expensive.
- Player starts broke, works real jobs, pays bills, buys cars, earns a flight license, buys a flying car.
- Includes weapons, fights, crime and a police wanted system (no gore, target rating 13+).
- Runs in desktop and mobile browsers. No app stores.
- Real advertisers can buy billboard space inside the city.
- Launch link: **flyingcarslife.vercel.app**. Later domain: **flyingcarslife.surpriseme.com**.
- Signature feature: **Rooftop Escape** — drive up a rooftop car park and take off from the roof edge in a flying car to escape ground police (see section 5).

### Non-negotiables
- **Realistic look** comes from real PBR assets, HDRI lighting and post-processing. Never use untextured primitive boxes for visible world objects (debug only).
- **All world-building follows the Visual Style Guide in section 10** (sunny West Coast city, worn and dirty, never clean or brand new).
- **Runs on phones** via automatic quality tiers.
- **First load under 40 MB**; the rest streams in.
- **Single-player first.** Code must not block adding multiplayer later.

---

## 2. Tech stack

| Area | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict) |
| 3D | three.js via `@react-three/fiber`, helpers from `@react-three/drei` |
| Physics | `@react-three/rapier` (Rapier). Vehicles: `DynamicRayCastVehicleController`. Player: kinematic character controller |
| Post FX | `@react-three/postprocessing` (SMAA, SSAO/N8AO, bloom, tone mapping, color grade) |
| State | `zustand` (game state), plain React state for UI only |
| Navigation | `recast-navigation` (navmesh for pedestrians/police on foot) |
| Audio | `howler` |
| Assets | glTF/GLB, compressed with `gltf-transform` (Draco/Meshopt + KTX2 textures) |
| Backend | Supabase (auth, Postgres, storage, edge functions) |
| Asset hosting | Cloudflare R2 (public bucket, CORS enabled) |
| Hosting | Vercel (free to start; Pro once ads are sold) |
| Payments (ads) | Paystack/Flutterwave (Nigeria), Stripe (international), via Supabase Edge Function webhooks |

### Environment variables
```
VITE_ASSET_URL=          # Cloudflare R2 public URL
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## 3. Folder structure

```
src/
  main.tsx
  App.tsx
  game/
    Game.tsx              # Canvas, physics world, scene root
    quality.ts            # device detection + quality tiers
    store/                # zustand stores: player, economy, time, wanted, inventory
    world/                # city chunks, streaming, lighting, sky, weather
    player/               # character controller, animations, camera
    vehicles/             # car + flying car controllers, enter/exit
    npc/                  # pedestrians, traffic, police AI
    combat/               # weapons, hit detection, melee
    jobs/                 # delivery, ride-hail, mechanic, air taxi
    systems/              # time of day, needs, rent, fines, save/load
    ads/                  # billboard components, ad fetching, impression tracking
    audio/
  ui/
    hud/                  # money, wanted stars, minimap, speed, prompts
    phone/                # Bank, Jobs, Map, Bills, Market, Police apps
    menus/                # main menu, pause, settings, death/arrest screens
    controls/             # mobile joystick + buttons
  lib/
    supabase.ts
    assets.ts             # asset URL helper using VITE_ASSET_URL
    save.ts               # local + cloud save
admin/                    # separate route: ad approvals, earnings
supabase/
  migrations/
  functions/              # payment webhooks, ad booking
scripts/
  fetch-assets.ts         # downloads free assets (Poly Haven etc.)
  compress-assets.ts      # gltf-transform pipeline
```

---

## 4. Coding rules

- TypeScript strict. No `any` unless commented why.
- Game logic in stores/systems, not inside React components. Components render state.
- Per-frame logic uses `useFrame`; never `setState` per frame for React UI. HUD reads from stores with selectors and throttled updates.
- All tunable numbers (prices, pay, speeds, timers) live in `src/game/config.ts`.
- Every asset path goes through `lib/assets.ts`.
- Every phase ends with: `npm run build` passes, no console errors, tested at 375px-wide mobile viewport and desktop.
- Keep draw calls low: instancing for repeated props, merged static geometry per chunk, LODs for buildings and cars.

---

## 5. Game design reference

### Time and needs
- 1 game day = 24 real minutes. Day/night cycle + weather (clear, cloudy, rain).
- **Energy**: drains while awake; sleep at home to restore. Low energy = slower movement and lower job pay.
- **Hunger**: eat at diners/food trucks. Low hunger slowly drains energy.
- Rent due every 3 game days. Miss twice = downgraded apartment.

### Starting state
- $500 cash, starter studio apartment, phone, bicycle.

### Economy (starting values, all in config)
| Item | Price |
|---|---|
| Rent, studio (per 3 days) | $150 |
| Rent, apartment | $450 |
| Suburban house | $120,000 |
| Penthouse with landing pad | $650,000 |
| Used car | $4,000 |
| Mid car | $18,000 |
| Flight license (course + test) | $8,000 |
| First flying car | $45,000 |
| Fuel / charge | $30–60 |
| Hospital bill | $500 + 10% of cash |
| Weapon permit | $2,000 |

Target: about 2 hours of play to afford the first flying car.

### Jobs
| Job | Needs | Pay |
|---|---|---|
| Food delivery | Bike or car | $40–80 per trip, timer bonus |
| Ride-hail | Any car | $80–200 per trip, tips for smooth driving |
| Mechanic | Visit garage | $150–300 per shift (repair mini-game) |
| Air taxi | Flight license + flying car + clean record | $400–900 per trip |
| Rooftop cargo (later) | Flying car | $600–1,500 |

### Vehicles
- Ground cars: realistic handling (suspension, grip, braking, damage that affects handling).
- Flying car: wheels fold into thrusters. Hover assist. Battery that drains while flying.
- **Sky lanes** at fixed altitudes; flying outside lanes = fine.
- **No-fly zones** (airport, government district) = wanted stars.
- Landing pads: rooftops, Skyport, penthouse.
- Enter/exit with E or on-screen button.

### Flight license
- Written quiz (10 questions on sky rules) + practical ring course with time limit.

### Weapons
- Bought at gun stores with a permit ($2,000 + no crimes in last 3 game days), or illegally from a night black-market dealer.
- Version 1: bat, knife, taser, pistol, shotgun, rifle (rifle needs permit level 2). Ammo bought separately. Body armor.
- No blood or gore. Knocked-down NPCs fall and stay down briefly.

### Crime and wanted system
| Action | Stars |
|---|---|
| Fighting in public | 1 |
| Drawing a weapon in public | 1 |
| Car theft, hit-and-run, reckless driving | 1–2 |
| Shooting or injuring someone | 2–3 |
| No-fly zone | 2 |
| Attacking police | 4 |

- Crimes are only reported if a witness sees them (NPC line-of-sight check, "calling police" icon).
- Self-defense (attacked first, witnessed) adds no stars.
- Stars 1: patrol tries to pull you over (stop = fine only). 2: multiple cars. 3: roadblocks, armed police. 4: helicopter + air police. 5: SWAT + air interceptors.
- Escape: break line of sight until stars flash and fade; repaint at a garage removes 1–2 stars.
- **Arrested**: jail skips game days, fines, weapons confiscated, permit suspended, criminal record.
- **Knocked out**: wake at hospital, pay bill.
- Criminal record blocks air taxi job and some purchases until it clears.

### Rooftop Escape (signature feature)
- Multi-level rooftop car parks and building ramps across Downtown that cars can drive up.
- At 1–3 wanted stars, the player can drive up a ramp and take off from the roof edge in a flying car to escape ground police.
- Ground police chase up the ramps and stop at the roof edge (they cannot follow into the air).
- Taking off during a chase adds +1 star only if the player then flies through a no-fly zone or outside sky lanes.
- At 4+ stars, police helicopters and air units follow the player into the sky.
- Smooth take-off from a moving car: thrusters ignite at speed, wheels fold, the car keeps its momentum off the edge.
- Built across phases: rooftop car parks in Phase 5 (city), take-off-from-motion in Phase 4 (flying car), chase/escape rules in Phase 9 (police).

### Phone apps
Bank, Jobs, Map (GPS route), Bills, Market (cars, flying cars, homes, weapons where legal), Police (record, fines, permits), Settings.

### Controls
- **Desktop**: WASD move/drive, mouse look, Shift sprint, Space jump / fly up, Ctrl fly down, E enter/exit/interact, F attack, R reload, right mouse aim, P phone, Esc pause.
- **Mobile**: left joystick, right-side drag to look, buttons for interact, attack, aim, fly up/down, phone.

### Saving
- Guests: auto-save to IndexedDB on events (job done, purchase, sleep).
- Logged in: same save synced to Supabase. Save on events, never every frame.

---

## 6. Supabase schema (all tables with Row Level Security)

```
profiles        (id uuid pk = auth.uid, username, created_at)
saves           (user_id pk, data jsonb, version int, updated_at)
leaderboard     (user_id, category text, value numeric, updated_at)   -- richest, deliveries, license_time
ad_slots        (id, name, district, kind text, price_per_day, active bool)
ad_bookings     (id, slot_id, advertiser_email, image_url, link_url,
                 start_date, end_date, status text, payment_ref, created_at)
                 -- status: pending_payment | pending_review | approved | rejected | expired
ad_stats_daily  (booking_id, day date, impressions int, clicks int)
admins          (user_id pk)
```

- Players can only read/write their own `saves` row.
- `ad_slots` and approved `ad_bookings` are publicly readable.
- Only admins can update booking status.
- Impressions are batched client-side and sent at most once per minute via an edge function.

---

## 7. Phases

Each phase lists what to build and a checklist. Paste the **prompt** into Claude Code to start it.

### Phase 0 — Project setup
**Prompt:**
> Read CLAUDE.md. Set up Phase 0: Vite + React + TypeScript strict project with the stack in section 2, the folder structure in section 3, ESLint + Prettier, `lib/assets.ts`, `game/config.ts`, `game/quality.ts` (detect mobile/low-end GPU and pick Low/Medium/High/Ultra). Add `.env.example`. Create a blank R3F canvas with Rapier physics running. Deployable to Vercel.

**Checklist:** `npm run dev` shows an empty 3D scene; `npm run build` passes; deploys on Vercel.

### Phase 1 — The realism test (one city block)
**Prompt:**
> Phase 1 from CLAUDE.md. Write `scripts/fetch-assets.ts` to download free CC0 assets from Poly Haven (one HDRI sky, asphalt, concrete, sidewalk, brick textures) and `scripts/compress-assets.ts` using gltf-transform. Build one realistic US city block: textured road with lane markings, sidewalks, curbs, 4–6 buildings with real PBR materials, street lights, traffic lights, a parked realistic car model (I will provide GLB files in /assets-src if needed). HDRI lighting, sun with soft shadows, post-processing per section 2, quality tiers. Add a free-fly debug camera. Goal: it must look like a real street, not a game.

**Checklist:** looks realistic on desktop; smooth (30+ fps) on a mid-range phone at Low/Medium; first load under 40 MB.

> Stop here and review the look before continuing.

### Phase 2 — Player character and camera
**Prompt:**
> Phase 2. Realistic rigged character (GLB) with Mixamo animations: idle, walk, run, sprint, jump, fall, turn. Rapier kinematic character controller with slopes and steps. Third-person camera with collision so it never clips into walls. Desktop and mobile controls per section 5.

**Checklist:** walk, run and jump around the block on both desktop and phone; camera never goes inside buildings.

### Phase 3 — Driving
**Prompt:**
> Phase 3. Realistic ground car with DynamicRayCastVehicleController: suspension, grip, handbrake, braking, reverse. Enter/exit cars with animation. Chase camera, speedometer HUD, engine sound by RPM. Collision damage that worsens handling. Fuel that drains.

**Checklist:** driving feels weighty, not arcade; enter/exit works; fuel and damage work.

### Phase 4 — Flying car
**Prompt:**
> Phase 4. Flying car per section 5: wheels fold into thrusters with animation, take-off and landing, hover assist, banking turns, battery drain, thruster glow + ground dust particles + sound. Sky lanes as visible subtle markers. No-fly zone volumes. Rooftop landing pads. Take-off from a moving car (Rooftop Escape, section 5): thrusters ignite at speed, wheels fold, and the car keeps its momentum when it drives off an edge.

**Checklist:** take off from street, fly between towers, land on a roof, run out of battery and glide down safely; drive off a roof edge at speed and transition smoothly into flight without losing momentum.

### Phase 5 — The city: streaming, traffic, pedestrians
**Prompt:**
> Phase 5. Expand to Downtown and Suburbs using chunked streaming (load/unload chunks around the player). LOD and instancing. Road lane graph for AI traffic that obeys traffic lights and stops for obstacles. Pedestrians on a recast navmesh with idle/walk animations who react to danger. Day/night cycle and weather. Multi-level rooftop car parks and building ramps across Downtown that cars can drive up to an open roof edge (Rooftop Escape, section 5).

**Checklist:** city feels alive; memory stays stable while driving across the map; phone stays playable; cars can drive up the rooftop car parks and ramps to the roof edge.

### Phase 6 — Life systems and phone
**Prompt:**
> Phase 6. Zustand stores for money, time, energy, hunger, rent, fines. Diner and food purchases. Sleep at home. The in-game phone UI with Bank, Jobs, Map (GPS route line), Bills, Market, Police, Settings. Local save to IndexedDB on events. Main menu, pause menu, settings (graphics quality, sound, controls).

**Checklist:** a full game day cycle works; rent is charged; save and reload restores everything.

### Phase 7 — Jobs
**Prompt:**
> Phase 7. Jobs from section 5: food delivery, ride-hail (passenger NPC rating based on smoothness), mechanic mini-game, and the air taxi framework. Job markers, GPS routing, timers, payouts, tips.

**Checklist:** you can play from $500 to buying a used car using jobs only.

### Phase 8 — Progression: dealership, homes, license
**Prompt:**
> Phase 8. Car dealership and flying car showroom with test drive. Homes market and moving. Flight school: written quiz + practical ring course. Air taxi job unlocks after license. Balance economy so the first flying car takes about 2 hours.

**Checklist:** full journey from broke to flying car is playable.

### Phase 9 — Weapons, combat, police
**Prompt:**
> Phase 9. Gun store + permit system + night black-market dealer. Weapons from section 5 with aiming, recoil, reload, ammo. Melee combat (punch, block, dodge). NPC reactions (flee, fight back, call police). Witness system. Wanted levels 1–5 with police cars, roadblocks, helicopter, air police, SWAT. Escape, repaint, arrest, hospital and criminal record per section 5. Rooftop Escape rules per section 5: ground police chase up ramps and stop at the roof edge; taking off adds +1 star only if the player then flies through a no-fly zone or outside sky lanes; at 4+ stars helicopters and air units follow into the sky. No gore.

**Checklist:** every crime in the table triggers the right stars; pulling over at 1 star works; arrest and hospital flows work; at 1–3 stars a rooftop take-off escapes ground police (they stop at the edge); at 4+ stars air units follow.

### Phase 10 — Accounts, cloud saves, leaderboards
**Prompt:**
> Phase 10. Supabase migrations for section 6 with RLS. Optional login (email magic link + Google). Cloud save sync with conflict handling (keep newest, ask if both changed). Leaderboards screen.

**Checklist:** play as guest, log in, progress uploads; log in on phone, progress is there.

### Phase 11 — Advertiser billboards
**Prompt:**
> Phase 11. Billboard, bus-stop and sky-lane ad slots placed in the world. Billboards load approved ads from Supabase, show "Your ad here" when empty. Public `/advertise` page: pick slot and dates, upload image, pay via Paystack/Stripe (edge function webhooks set status). `/admin` dashboard: approve/reject, earnings, slot prices. Impression tracking (ad visible on screen for 1+ second) batched per minute; click opens link. Content rules shown on advertise page.

**Checklist:** test booking end-to-end in payment test mode; approved ad appears in game; stats update.

### Phase 12 — Polish and performance
**Prompt:**
> Phase 12. Profile and optimize for phones: texture sizes per quality tier, draw calls, shader warm-up, loading screen with progress, audio mixing, minimap, tutorial for first 10 minutes, accessibility (subtitles, remappable keys, colorblind-safe HUD).

**Checklist:** 30+ fps on a mid-range Android phone and an iPhone at Medium; 60 fps on a laptop at High.

### Phase 13 — Launch
- Deploy to Vercel (`flyingcarslife.vercel.app`), later add `flyingcarslife.surpriseme.com`.
- Usage alerts on Vercel, Supabase, Cloudflare.
- Upgrade Vercel to Pro before selling ads (free plan is non-commercial).
- Trailer clips for X; upload to itch.io; apply to CrazyGames.
- **Cinematic camera** debug mode: free camera with smooth paths, hidden HUD, slow-motion toggle.
- **Trailer shot** for X: a police car chases the player up a rooftop car park, the player drives off the roof edge, thrusters fire, and the car flies away while the police car stops at the edge.

---

## 8. Asset sources

- **Poly Haven** (CC0): HDRIs, textures, props.
- **Sketchfab**: realistic buildings and cars. Check each license; keep `ASSET_CREDITS.md` for CC-BY credits.
- **Fab** (free section + paid packs): city kits, vehicles.
- **Mixamo**: character animations.
- Never use real car brands, logos or GTA/Rockstar assets. All vehicles are fictional or renamed with logos removed.

---

## 9. Performance budgets

| Tier | Target | Textures | Shadows | Post FX |
|---|---|---|---|---|
| Low (phones) | 30 fps | 512–1K | 1 cascade, low res | FXAA only |
| Medium | 30–45 fps | 1K | medium | SMAA + bloom |
| High | 60 fps | 2K | high | + SSAO |
| Ultra | 60 fps | 2K–4K | high | + full grading, motion blur |

- First load under 40 MB; each streamed chunk under 8 MB.
- Draw calls under 300 on Low, under 800 on High.

---

## 10. Visual Style Guide: Harbor City

Applies to **all world-building from now on**. Do not restart finished phases: apply it to the current and future phases, and update already-built scenes where it is quick to do so. Every detail must stay inside the section 9 budgets (decals, instancing, LODs, merged geometry).

### City feel
- Harbor City is a sunny West Coast city inspired by Los Angeles: palm trees, dry hills, wide avenues, hazy downtown towers.
- Default lighting: bright midday sun, clear blue sky with soft scattered clouds, strong sharp shadows, warm dusty color grade, slight distance haze (atmospheric fog) so far buildings look soft and blue-grey.
- Realism comes from wear and dirt. **Nothing should look clean or brand new.**
- Never copy GTA/Rockstar assets, names, logos or landmarks. Everything is original and fictional (e.g. the hillside sign reads **"HARBOR HILLS"**).

### Roads
- Main avenues: 4–6 lanes, two-way, some with a raised concrete median.
- Asphalt: light grey, sun-faded, with cracks, patches, tar seams, oil stains and tire marks (decals + PBR asphalt, varied per road).
- Markings: white dashed lane lines, double yellow center lines, white stop lines and zebra crossings, all slightly worn/faded with gaps.
- Curbs: raised concrete curbs with some red-painted no-parking sections.
- Drain grates and manhole covers along the road edges.

### Sidewalks
- Wide light concrete sidewalks of large square slabs with visible seams, cracks, stains, gum spots and small litter (cups, paper, leaves).
- Suburbs: grass verges and small shrub beds. Downtown: tree pits with palm trees.

### Intersections and street furniture
- Traffic lights on tall grey poles with arms hanging over the lanes; pedestrian crossing signals at corners.
- Tall grey curved-arm street lamps along every road.
- Palm trees lining avenues (mix of tall thin and short fat palms), swaying slightly.
- Bus stops, fire hydrants, trash cans, newspaper boxes, street signs with original street names, billboards (the Phase 11 ad slots).

### Bridge / overpass (signature location)
- A wide road bridge leading toward downtown with stone balustrade railings and ornate old-style lamp posts, the downtown skyline directly behind it. Key trailer and flying take-off spot.

### Buildings
- Downtown: tall glass skyscrapers in blue, teal and grey glass with reflective PBR materials, clustered together; a few with rooftop helipads/landing pads.
- Near the roads: 2–4 storey shops, offices, a round cylindrical office tower, fast-food spots, a gas station, parking lots, with signage and awnings.
- Background: dry brown hills with scattered green trees and the original hillside sign, visible from most streets (low-poly hill mesh + backdrop for far distance).

### Traffic and life
- Everyday cars: sedans, SUVs, pickups, yellow taxis, buses, police cruisers. Realistic paint mix: mostly white/silver/black/grey, a few bright ones.
- Cars stop at red lights, queue and change lanes. Pedestrians walk on sidewalks and cross at lights.

### Flying car disguise (gameplay)
- With wheels down, the player's flying car looks like a normal road car. Police ignore it on the road unless the player commits a crime.
- On take-off, nearby NPCs react (stop, point, film with phones). Police only add stars if the take-off breaks a rule (no-fly zone, outside a sky lane, or during a chase).

### Bystander camera mode (for sharing)
- "Phone camera" mode: the player stands on the sidewalk and films in vertical 9:16 with slight handheld shake, auto-exposure and focus, no HUD.
- A record button captures a short clip (MediaRecorder on the canvas) with a small "Flying Cars Life" watermark, which the player can download to post on X/TikTok.

### Acceptance check
- A screenshot from the sidewalk looks like a sunny real-world LA street: cracked concrete, faded lines, palm trees, traffic lights over the road, hazy towers in the distance, hills behind.
- Section 9 performance budgets still hold.

### Where each part is built
| Part | Phase |
|---|---|
| Sun, sky, sharp shadows, warm grade, blue-grey haze | Applied to the existing city (Phase 1/5 retrofit) |
| Faded asphalt + crack/patch/seam/oil/tire decals, red curbs, drain grates | Applied to the existing city |
| Light slab sidewalks with stains, gum, litter | Applied to the existing city |
| Palm trees (tall thin + short fat, swaying) in tree pits | Applied to the existing city |
| Dry hills backdrop + HARBOR HILLS sign | Applied to the existing city |
| Blue/teal reflective glass | Applied to existing glazing; full glass towers in Phase 5 |
| Bystander phone camera + clip recording | Built now (self-contained) |
| 4–6 lane avenues with medians, the bridge/overpass | Phase 5 (city expansion) |
| Downtown glass skyscraper cluster, helipads, round office tower | Phase 5 (with rooftop car parks); landing pads tie into Phase 4 |
| Shops/fast food/gas station/parking lots with signage and awnings | Phase 5 (layout) + Phase 6/8 (enterable businesses) |
| Pedestrian crossing signals, bus stops, newspaper boxes | Phase 5 (with pedestrians and traffic) |
| Billboards | Phase 11 (ad slots) |
| Suburban grass verges and shrub beds | Phase 5 (Suburbs) |
| Traffic mix, queueing, lane changes, pedestrians | Phase 5 |
| Flying-car disguise look (wheels down) | Phase 4 |
| NPCs react to take-off (stop, point, film) | Phase 5 (pedestrians) + Phase 9 |
| Police stars only when take-off breaks a rule | Phase 9 |
