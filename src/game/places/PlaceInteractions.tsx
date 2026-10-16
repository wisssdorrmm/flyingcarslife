import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playerState } from '../player/playerState';
import { useGame } from '../store/game';
import { consumePress } from '../systems/input';
import { cityPlaces } from './placement';

/** How close (m) to a door the player must be to go in. */
const ENTER_RADIUS = 2.4;
const tmp = new THREE.Vector3();

/** Shows "E Enter <place>" near an entrance and opens the place's menu on E. */
export function PlaceInteractions() {
  const owns = useRef<string | null>(null);

  useFrame(() => {
    const game = useGame.getState();
    if (game.mode !== 'onFoot' || game.openPlaceId || !playerState.object) {
      if (owns.current && game.prompt === owns.current) game.setPrompt(null);
      owns.current = null;
      return;
    }
    playerState.object.getWorldPosition(tmp);
    let nearest: string | null = null;
    let best = ENTER_RADIUS;
    for (const p of cityPlaces()) {
      const d = Math.hypot(p.door.x - tmp.x, p.door.z - tmp.z);
      if (d < best) {
        best = d;
        nearest = p.id;
      }
    }
    const prompt = nearest ? `place:${nearest}` : null;
    if (prompt) {
      // A car right beside you keeps its own prompt; doors win otherwise.
      if (game.prompt !== prompt && game.prompt !== 'drive') game.setPrompt(prompt);
      owns.current = prompt;
      if (game.prompt === prompt && consumePress('interact')) game.openPlace(nearest!);
    } else if (owns.current) {
      if (game.prompt === owns.current) game.setPrompt(null);
      owns.current = null;
    }
  });

  return null;
}
