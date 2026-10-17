import { useEffect, useState } from 'react';
import { LANDMARKS, type Landmark } from '../../game/city/geo';
import { useCareer } from '../../game/store/career';
import { useGoals } from '../../game/store/goals';
import { currentPose, useNav } from '../../game/store/nav';
import { formatDistance } from '../map/format';

/**
 * "What's next": the nearest landmark not reached yet, with distance and a direction arrow
 * relative to where the car faces. Tap to set it as the GPS destination.
 * (Photo spots and time trials join this list in the goals step.)
 */
export function WhatsNext() {
  const setWaypoint = useNav((s) => s.setWaypoint);
  const [next, setNext] = useState<{ l: Landmark; d: number; angle: number } | null>(null);
  const [visited] = useState(() => new Set<string>());

  useEffect(() => {
    const id = window.setInterval(() => {
      const pose = currentPose();
      if (!pose) return;
      // Nearest photo spot not taken yet, or time trial not finished yet.
      const photos = useCareer.getState().photos;
      const done = useCareer.getState().trials;
      const options: Landmark[] = [
        ...LANDMARKS.filter((l) => !photos.includes(l.id)).map((l) => ({
          ...l,
          name: `Photo: ${l.name}`,
        })),
        ...useGoals
          .getState()
          .trials.filter((t) => done[t.id] === undefined)
          .map((t) => ({
            id: t.id,
            name: `Time trial: ${t.name}`,
            blurb: '',
            x: t.start.x,
            z: t.start.z,
          })),
      ];
      let best: Landmark | null = null;
      let bestD = Infinity;
      for (const l of options) {
        const d = Math.hypot(l.x - pose.x, l.z - pose.z);
        if (!visited.has(l.id) && d < bestD) {
          best = l;
          bestD = d;
        }
      }
      if (!best) return setNext(null);
      // Angle of the target relative to the car's heading (0 = straight ahead, + = right).
      const tx = (best.x - pose.x) / bestD;
      const tz = (best.z - pose.z) / bestD;
      const angle = Math.atan2(pose.fx * tz - pose.fz * tx, pose.fx * tx + pose.fz * tz);
      setNext({ l: best, d: bestD, angle: -angle });
    }, 400);
    return () => window.clearInterval(id);
  }, [visited]);

  if (!next) return null;
  return (
    <button
      className="hud-next hud-panel"
      onClick={() => setWaypoint({ x: next.l.x, z: next.l.z, label: next.l.name })}
      title="Set GPS route"
      style={{ color: 'inherit', font: 'inherit', textAlign: 'left' }}
    >
      <svg
        className="hud-arrow"
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${next.angle}rad)` }}
      >
        <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="currentColor" />
      </svg>
      <span style={{ minWidth: 0 }}>
        <span className="hud-next-kicker">WHAT&apos;S NEXT</span>
        <span className="hud-next-title" style={{ display: 'block' }}>
          {next.l.name}
        </span>
      </span>
      <span className="hud-next-dist">{formatDistance(next.d)}</span>
    </button>
  );
}
