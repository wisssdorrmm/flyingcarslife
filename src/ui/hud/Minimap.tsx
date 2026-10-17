import { useEffect, useRef, useState } from 'react';
import { drawMissionPins } from '../../game/missions/pins';
import { useCity } from '../../game/city/cityData';
import { currentPose, useNav } from '../../game/store/nav';
import { usePlayerCar } from '../../game/store/playerCar';
import { cityMapLayer, MAP_COLORS, MAP_SCALE } from '../map/cityMapLayer';
import { formatDistance } from '../map/format';

const SIZE = 150;
/** Meters shown from the center to the edge. */
const RANGE = 160;

/** Round, heading-up minimap with the GPS route and the district + street under it. */
export function Minimap({ size = SIZE }: { size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const setMapOpen = useNav((s) => s.setMapOpen);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = size * dpr;
    let raf = 0;
    let lastDraw = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - lastDraw < 80) return; // ~12 Hz is plenty for a minimap
      lastDraw = t;
      const pose = currentPose();
      if (!pose) return;
      const nav = useNav.getState();
      const r = size / 2;
      const k = r / RANGE; // screen px per meter
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = MAP_COLORS.water;
      ctx.fillRect(0, 0, size, size);
      // Heading up: rotate the world so the facing direction points to the top.
      ctx.translate(r, r);
      ctx.rotate(-Math.atan2(pose.fx, -pose.fz));
      const sx = (x: number) => (x - pose.x) * k;
      const sy = (z: number) => (z - pose.z) * k;
      const layer = cityMapLayer();
      if (layer) {
        const s = k / MAP_SCALE;
        ctx.drawImage(
          layer.canvas,
          (layer.x0 - pose.x) * k,
          (layer.z0 - pose.z) * k,
          layer.canvas.width * s,
          layer.canvas.height * s,
        );
      }
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
      // Where the flying car was left (after hijacking another car).
      const parked = usePlayerCar.getState().left.find((c) => c.canFly);
      if (parked) {
        let px = sx(parked.position[0]);
        let py = sy(parked.position[2]);
        const d = Math.hypot(px, py);
        if (d > r - 10) {
          px *= (r - 10) / d;
          py *= (r - 10) / d;
        }
        ctx.fillStyle = MAP_COLORS.route;
        ctx.strokeStyle = '#071b18';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      drawMissionPins(ctx, sx, sy, { clamp: r });
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
  }, [size]);

  return (
    <div className="hud-map">
      <canvas
        ref={canvas}
        style={{ width: size, height: size }}
        onClick={() => setMapOpen(true)}
        aria-label="Minimap — open the city map"
        role="button"
      />
      <Location />
      <span ref={label} className="hud-route" />
    </div>
  );
}

/** Neighborhood and street (plus the cross street near junctions), twice a second. */
function Location() {
  const city = useCity((s) => s.city);
  const [loc, setLoc] = useState<{ district: string; street: string } | null>(null);
  useEffect(() => {
    if (!city) return;
    const id = window.setInterval(() => {
      const pose = currentPose();
      if (!pose) return;
      const { street, cross, district } = city.graph.locate(pose.x, pose.z);
      const next = { district, street: cross ? `${street} & ${cross}` : street };
      setLoc((prev) =>
        prev && prev.district === next.district && prev.street === next.street ? prev : next,
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [city]);
  if (!loc) return null;
  return (
    <div className="hud-location hud-panel">
      <span className="hud-location-district">{loc.district}</span>
      {loc.street && <span className="hud-location-street">{loc.street}</span>}
    </div>
  );
}
