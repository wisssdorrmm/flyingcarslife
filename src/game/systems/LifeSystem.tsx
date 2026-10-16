import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BODY, PLAYER, TIME } from '../config';
import { playerState } from '../player/playerState';
import { useGame } from '../store/game';
import { useLife } from '../store/life';

const GAME_MINUTES_PER_SECOND = 1440 / TIME.realSecondsPerGameDay;
const FLUSH_SECONDS = 0.5;

/**
 * Runs the life simulation: the game clock, needs draining, and calories burned by what the
 * player is doing. Accumulates per frame and pushes to the store twice a second, so HUD
 * components re-render at 2 Hz rather than 60.
 */
export function LifeSystem() {
  const acc = useRef({ seconds: 0, kcal: 0 });

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.25);
    const minutes = step * GAME_MINUTES_PER_SECOND;
    const a = acc.current;
    const rates = BODY.activityKcalPerMinute;
    if (useGame.getState().mode === 'driving') {
      a.kcal += rates.drive * minutes;
    } else {
      const v = playerState.velocity;
      const speed = Math.hypot(v.x, v.z);
      if (speed > (PLAYER.runSpeed + PLAYER.sprintSpeed) / 2) a.kcal += rates.sprint * minutes;
      else if (speed > (PLAYER.walkSpeed + PLAYER.runSpeed) / 2) a.kcal += rates.run * minutes;
      else if (speed > 0.3) a.kcal += rates.walk * minutes;
    }
    a.seconds += step;
    if (a.seconds >= FLUSH_SECONDS) {
      useLife.getState().tick(a.seconds * GAME_MINUTES_PER_SECOND, a.kcal);
      a.seconds = 0;
      a.kcal = 0;
    }
  });

  return null;
}
