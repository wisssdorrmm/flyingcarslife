import { useEffect, useRef } from 'react';
import { currentPose, useNav } from '../../game/store/nav';
import { cityMapLayer, MAP_COLORS, MAP_SCALE, toLayer } from '../map/cityMapLayer';
import { formatDistance } from '../map/format';

const SIZE = 168;
/** Meters shown from the center to the edge. */
const RANGE = 110;

/** Round, heading-up minimap with the GPS route; tap/click to open the full map. */
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const setMapOpen = useNav((s) => s.setMapOpen);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const layer = cityMapLayer();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = SIZE * dpr;
    let raf = 0;
    let lastDraw = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - lastDraw < 80) return; // ~12 Hz is plenty for a minimap
      lastDraw = t;
      const pose = currentPose();
      if (!pose) return;
      const nav = useNav.getState();
      const r = SIZE / 2;
      const k = r / RANGE; // screen px per meter
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = MAP_COLORS.background;
      ctx.fillRect(0, 0, SIZE, SIZE);
      // Heading up: rotate the world so the facing direction points to the top.
      ctx.translate(r, r);
      ctx.rotate(-Math.atan2(pose.fx, -pose.fz));
      const sx = (x: number) => (x - pose.x) * k;
      const sy = (z: number) => (z - pose.z) * k;
      const s = k / MAP_SCALE;
      ctx.drawImage(
        layer,
        -toLayer(pose.x) * s,
        -toLayer(pose.z) * s,
        layer.width * s,
        layer.height * s,
      );
      if (nav.route.length > 1) {
        ctx.strokeStyle = MAP_COLORS.route;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        nav.route.forEach((p, i) =>
          i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z)),
        );
        ctx.stroke();
      }
      if (nav.waypoint) {
        // Clamp the pin to the rim when the destination is off the minimap.
        let wx = sx(nav.waypoint.x);
        let wy = sy(nav.waypoint.z);
        const d = Math.hypot(wx, wy);
        if (d > r - 10) {
          wx *= (r - 10) / d;
          wy *= (r - 10) / d;
        }
        ctx.fillStyle = MAP_COLORS.waypoint;
        ctx.beginPath();
        ctx.arc(wx, wy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Player arrow (always pointing up) and rim.
      ctx.fillStyle = MAP_COLORS.player;
      ctx.strokeStyle = '#1b6fd8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r, r - 10);
      ctx.lineTo(r - 7, r + 8);
      ctx.lineTo(r, r + 4);
      ctx.lineTo(r + 7, r + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r, r, r - 1, 0, Math.PI * 2);
      ctx.stroke();
      if (label.current) {
        label.current.textContent = nav.waypoint
          ? `${formatDistance(nav.remaining)} · ${nav.waypoint.label}`
          : '';
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="minimap">
      <canvas
        ref={canvas}
        style={{ width: SIZE, height: SIZE }}
        onClick={() => setMapOpen(true)}
        aria-label="Minimap — open the city map"
        role="button"
      />
      <span ref={label} className="minimap-label" />
    </div>
  );
}
