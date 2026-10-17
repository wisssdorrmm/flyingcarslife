/** Mission pins for the map and minimap: objectives, the hideout, and the next mission's start. */
import { missionFor } from './levels';
import { missionRuntime, type MarkerKind } from './runtime';
import { useMissions } from './store';

const COLOR: Record<MarkerKind, string> = {
  objective: '#ffd166',
  next: 'rgba(255, 209, 102, 0.55)',
  hideout: '#ff8a5c',
  start: '#2fd5c0',
};

export function missionPins(): { x: number; z: number; color: string; label: string }[] {
  const pins = missionRuntime.markers.map((m) => ({
    x: m.x,
    z: m.z,
    color: COLOR[m.kind],
    label: m.kind === 'hideout' ? 'Hideout' : 'Objective',
  }));
  const s = missionRuntime.startMarker;
  if (s) {
    const level = useMissions.getState().selected;
    pins.push({
      x: s.x,
      z: s.z,
      color: COLOR.start,
      label: `Mission ${level}: ${missionFor(level).title}`,
    });
  }
  return pins;
}

/**
 * Draws the pins onto a map canvas. `clamp` (minimap radius) keeps off-screen pins on the rim;
 * `labels` writes their names (full map).
 */
export function drawMissionPins(
  ctx: CanvasRenderingContext2D,
  sx: (x: number) => number,
  sy: (z: number) => number,
  opts: { clamp?: number; labels?: boolean } = {},
): void {
  for (const p of missionPins()) {
    let x = sx(p.x);
    let y = sy(p.z);
    if (opts.clamp) {
      const d = Math.hypot(x, y);
      if (d > opts.clamp - 10) {
        x *= (opts.clamp - 10) / d;
        y *= (opts.clamp - 10) / d;
      }
    }
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#0b1016';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // A diamond, so mission pins read differently from the round GPS pin.
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (opts.labels) {
      ctx.fillStyle = 'rgba(232, 237, 242, 0.95)';
      ctx.fillText(p.label, x, y + 20);
    }
  }
}
