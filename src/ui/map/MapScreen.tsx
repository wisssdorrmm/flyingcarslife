import { useEffect, useMemo, useRef, useState } from 'react';
import { useCity } from '../../game/city/cityData';
import { DISTRICTS, districtAt, LANDMARKS, type Landmark } from '../../game/city/geo';
import { currentPose, useNav } from '../../game/store/nav';
import { cityMapLayer, MAP_COLORS, MAP_SCALE } from './cityMapLayer';
import { formatDistance } from './format';

interface StreetLabel {
  name: string;
  x: number;
  z: number;
  angle: number;
  length: number;
}

interface View {
  /** World point at the center of the screen. */
  cx: number;
  cz: number;
  /** Screen pixels per meter. */
  zoom: number;
}

/** Full-screen city map: pan/zoom, tap a landmark or any street to set a GPS waypoint. */
export function MapScreen() {
  const open = useNav((s) => s.mapOpen);
  const setOpen = useNav((s) => s.setMapOpen);
  const waypoint = useNav((s) => s.waypoint);
  const setWaypoint = useNav((s) => s.setWaypoint);
  const remaining = useNav((s) => s.remaining);
  const [query, setQuery] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ cx: 0, cz: 0, zoom: 1 });
  const city = useCity((s) => s.city);
  const places = LANDMARKS;
  // One label per long named stretch, placed at its middle and turned along the road.
  const labels = useMemo<StreetLabel[]>(() => {
    if (!city) return [];
    const out: StreetLabel[] = [];
    city.index.edges.forEach((e, i) => {
      if (e.name < 0 || e.length < 70) return;
      const n = e.pts.length / 2;
      const m = Math.floor(n / 2);
      const a = Math.max(0, m - 1);
      const b = Math.min(n - 1, m + 1 > n - 1 ? m : m + 1);
      let angle = Math.atan2(e.pts[b * 2 + 1]! - e.pts[a * 2 + 1]!, e.pts[b * 2]! - e.pts[a * 2]!);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      out.push({
        name: city.graph.streetName(i),
        x: e.pts[m * 2]!,
        z: e.pts[m * 2 + 1]!,
        angle,
        length: e.length,
      });
    });
    return out;
  }, [city]);

  // Toggle with M anywhere (unless typing), close with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.code === 'KeyM' && !typing) setOpen(!useNav.getState().mapOpen);
      if (e.code === 'Escape' && useNav.getState().mapOpen) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Center on the player each time the map opens.
  useEffect(() => {
    if (!open) return;
    const pose = currentPose();
    const short = Math.min(window.innerWidth, window.innerHeight);
    view.current = { cx: pose?.x ?? 0, cz: pose?.z ?? 0, zoom: short / 700 };
  }, [open]);

  // Draw loop while open (no React re-renders per frame).
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const v = view.current;
      const sx = (x: number) => (x - v.cx) * v.zoom + w / 2;
      const sy = (z: number) => (z - v.cz) * v.zoom + h / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = MAP_COLORS.water;
      ctx.fillRect(0, 0, w, h);
      // Cached city image.
      ctx.imageSmoothingEnabled = true;
      const k = v.zoom / MAP_SCALE;
      const layer = cityMapLayer();
      if (layer) {
        ctx.drawImage(
          layer.canvas,
          sx(layer.x0),
          sy(layer.z0),
          layer.canvas.width * k,
          layer.canvas.height * k,
        );
      }

      // District names (large, faint).
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.max(14, 28 * Math.min(v.zoom, 1.4))}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(232, 237, 242, 0.16)';
      for (const d of DISTRICTS) ctx.fillText(d.name.toUpperCase(), sx(d.x), sy(d.z));

      // Street names once zoomed in enough to read them.
      if (v.zoom > 0.9) {
        ctx.font = `600 ${Math.min(13, 8 + v.zoom * 2)}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(232, 237, 242, 0.85)';
        for (const l of labels) {
          if (l.length * v.zoom < ctx.measureText(l.name).width + 12) continue;
          ctx.save();
          ctx.translate(sx(l.x), sy(l.z));
          ctx.rotate(l.angle);
          ctx.fillText(l.name, 0, 0);
          ctx.restore();
        }
      }

      // GPS route.
      const route = useNav.getState().route;
      if (route.length > 1) {
        ctx.strokeStyle = MAP_COLORS.route;
        ctx.lineWidth = Math.max(3, 4 * Math.min(v.zoom, 1.5));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        route.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z))));
        ctx.stroke();
      }

      // Landmarks.
      const r = 9;
      for (const p of places) {
        const x = sx(p.x);
        const y = sy(p.z);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(12, 18, 24, 0.85)';
        ctx.fill();
        ctx.strokeStyle = MAP_COLORS.route;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('★', x, y + 1);
        if (v.zoom > 0.7) {
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(232, 237, 242, 0.95)';
          ctx.fillText(p.name, x, y + r + 10);
        }
      }

      // Waypoint pin.
      const wp = useNav.getState().waypoint;
      if (wp) {
        const x = sx(wp.x);
        const y = sy(wp.z);
        ctx.fillStyle = MAP_COLORS.waypoint;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y - 16, 8, Math.PI * 0.8, Math.PI * 2.2);
        ctx.closePath();
        ctx.fill();
      }

      // Player arrow.
      const pose = currentPose();
      if (pose) {
        const x = sx(pose.x);
        const y = sy(pose.z);
        const a = Math.atan2(pose.fz, pose.fx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = MAP_COLORS.player;
        ctx.strokeStyle = '#1b6fd8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-8, -7);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-8, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [open, places, labels]);

  // Pan, zoom (wheel + pinch) and tap-to-set-waypoint.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef(0);
  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const v = view.current;
    return {
      x: (clientX - rect.left - rect.width / 2) / v.zoom + v.cx,
      z: (clientY - rect.top - rect.height / 2) / v.zoom + v.cz,
    };
  };
  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const before = toWorld(clientX, clientY);
    const v = view.current;
    v.zoom = Math.min(6, Math.max(0.15, v.zoom * factor));
    const after = toWorld(clientX, clientY);
    v.cx += before.x - after.x;
    v.cz += before.z - after.z;
  };
  const goTo = (p: Landmark) => setWaypoint({ x: p.x, z: p.z, label: p.name });
  const tap = (clientX: number, clientY: number) => {
    const p = toWorld(clientX, clientY);
    const hitRadius = 16 / view.current.zoom;
    const place = places.find((pl) => Math.hypot(pl.x - p.x, pl.z - p.z) < hitRadius);
    if (place) {
      goTo(place);
      return;
    }
    const hit = city?.graph.nearest(p.x, p.z, 80);
    if (!hit) return;
    const street = city!.graph.streetName(hit.edge) || 'Street';
    setWaypoint({ x: hit.x, z: hit.z, label: `${street}, ${districtAt(hit.x, hit.z).name}` });
  };

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = places.filter((p) => `${p.name} ${p.blurb}`.toLowerCase().includes(q));
  // Typing a street name finds it too.
  const streets =
    q.length >= 2 && city
      ? city.index.streets.filter((n) => n.toLowerCase().includes(q)).slice(0, 8)
      : [];
  const goToStreet = (name: string) => {
    if (!city) return;
    const id = city.index.streets.indexOf(name);
    const e = city.index.edges
      .filter((ed) => ed.name === id)
      .sort((a, b) => b.length - a.length)[0];
    if (!e) return;
    const m = Math.floor(e.pts.length / 4) * 2;
    const x = e.pts[m]!;
    const z = e.pts[m + 1]!;
    setWaypoint({ x, z, label: `${name}, ${districtAt(x, z).name}` });
    view.current.cx = x;
    view.current.cz = z;
  };

  return (
    <div className="map-screen" role="dialog" aria-label="City map">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onWheel={(e) => zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          moved.current = 0;
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()] as [
              { x: number; y: number },
              { x: number; y: number },
            ];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
          }
        }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          moved.current += Math.hypot(dx, dy);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()] as [
              { x: number; y: number },
              { x: number; y: number },
            ];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch.current > 0) zoomAt(d / pinch.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch.current = d;
          } else {
            view.current.cx -= dx / view.current.zoom;
            view.current.cz -= dy / view.current.zoom;
          }
        }}
        onPointerUp={(e) => {
          const wasTap = moved.current < 6 && pointers.current.size === 1;
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = 0;
          if (wasTap) tap(e.clientX, e.clientY);
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      />

      <aside className="map-panel">
        <header>
          <h2>San Francisco</h2>
          <button className="panel-close" onClick={() => setOpen(false)} aria-label="Close map">
            ×
          </button>
        </header>
        {waypoint ? (
          <div className="map-waypoint">
            <div>
              <strong>{waypoint.label}</strong>
              <span>{remaining > 0 ? `${formatDistance(remaining)} away` : 'Route set'}</span>
            </div>
            <button onClick={() => setWaypoint(null)}>Clear</button>
          </div>
        ) : (
          <p className="map-hint">Tap a landmark or any street to set a GPS route.</p>
        )}
        <input
          className="map-search"
          placeholder="Search landmarks or streets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="map-places">
          {streets.map((name) => (
            <li key={`street-${name}`}>
              <span className="map-icon">🛣</span>
              <span className="map-place-text">
                <strong>{name}</strong>
                <em>Street</em>
              </span>
              <button onClick={() => goToStreet(name)}>Go</button>
            </li>
          ))}
          {filtered.map((p) => (
            <li key={p.id}>
              <span className="map-icon">★</span>
              <span className="map-place-text">
                <strong>{p.name}</strong>
                <em>{p.blurb}</em>
              </span>
              <button
                onClick={() => {
                  goTo(p);
                  view.current.cx = p.x;
                  view.current.cz = p.z;
                }}
              >
                Go
              </button>
            </li>
          ))}
        </ul>
        <p className="map-credit">Map data © OpenStreetMap contributors</p>
        <p className="map-keys">M or Esc to close · drag to pan · scroll / pinch to zoom</p>
      </aside>
    </div>
  );
}
