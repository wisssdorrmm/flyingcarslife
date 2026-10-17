# Parked code

Features from the earlier "life simulator" direction, kept for later. Nothing here is compiled,
linted or bundled (`tsconfig.app.json` and `eslint.config.js` exclude this folder).

Paths mirror where each file used to live (`src/_parked/game/net/` was `src/game/net/`), so
moving one back is a `git mv` plus fixing any imports that changed in the meantime.

| Folder / file | What it is |
|---|---|
| `game/net/`, `game/store/{net,social}.ts`, `ui/social/` | Multiplayer: transports (BroadcastChannel / Supabase Realtime), remote players, demo bots, chat, friends, emote menu |
| `game/player/{Player,ThirdPersonCamera,playerState,emotes}` | On-foot character controller, camera and procedural emotes |
| `game/places/PlaceInteractions.tsx`, `PlaceSigns.tsx`, `ui/menus/PlacePanel.tsx`, `ui/hud/Prompt.tsx` | Enterable buildings (diner, gym, school…) |
| `game/systems/LifeSystem.tsx`, `ui/hud/StatusHud.tsx` | Needs, weight, rent |
| `game/interiors/`, `game/store/location.ts`, `scripts/fetch-interior-assets.ts` | Homes and furniture (unfinished) |
| `ui/menus/ProfileSetup.tsx`, `lib/supabase.ts` | Player profile and the Supabase client |
| `ui/hud/ControlsHelp.tsx` | On-foot controls overlay |

`game/player/characterModel.ts` stayed in place: pedestrians reuse it.
