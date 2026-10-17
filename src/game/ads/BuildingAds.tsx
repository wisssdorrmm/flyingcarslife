import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { City } from '../city/cityData';
import { BILLBOARDS, BUILDING_ADS } from '../config';
import { useSettings } from '../store/settings';
import { vehicleState } from '../vehicles/vehicleState';
import {
  assignBuildingAds,
  useAdCard,
  type AdPlacement,
  type BuildingAdEntry,
} from './buildingAdsData';

/** Draws centered text, shrinking the font so it fits within `maxW` pixels. */
function fit(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  maxW: number,
): void {
  let s = size;
  g.font = `${weight} ${s}px system-ui, sans-serif`;
  while (s > 10 && g.measureText(text).width > maxW) {
    s *= 0.92;
    g.font = `${weight} ${Math.round(s)}px system-ui, sans-serif`;
  }
  g.fillText(text, x, y);
}

/** Facade banner art: brand, category and tagline (or the "available" card). */
function bannerTexture(ad: BuildingAdEntry | null, aspect: number): THREE.CanvasTexture {
  const h = 512;
  const w = Math.round(Math.min(4, Math.max(1, aspect)) * h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  if (ad) {
    g.fillStyle = ad.colors.bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ad.colors.accent;
    g.fillRect(0, h - 40, w, 40);
    g.fillStyle = ad.colors.fg;
    fit(g, ad.brand, w / 2, h * 0.45, Math.round(h * 0.3), 800, w * 0.9);
    fit(g, ad.tagline, w / 2, h * 0.62, Math.round(h * 0.09), 600, w * 0.9);
    if (!ad.category.startsWith('PLACEHOLDER')) {
      g.fillStyle = ad.colors.accent;
      fit(g, ad.category.toUpperCase(), w / 2, h * 0.76, Math.round(h * 0.07), 700, w * 0.88);
    }
  } else {
    g.fillStyle = '#0d1b22';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2fd5c0';
    g.lineWidth = 16;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(h * 0.13)}px system-ui, sans-serif`;
    g.fillText('THIS BUILDING IS AVAILABLE', w / 2, h * 0.38);
    g.font = `600 ${Math.round(h * 0.08)}px system-ui, sans-serif`;
    g.fillText('Put your brand on it', w / 2, h * 0.53);
    g.fillStyle = '#2fd5c0';
    g.font = `700 ${Math.round(h * 0.085)}px system-ui, sans-serif`;
    g.fillText(BILLBOARDS.advertise, w / 2, h * 0.72);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Banner + rooftop sign geometry for one building's street wall. */
function layout(p: AdPlacement) {
  const b = p.building;
  const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
  const width = Math.min(len * 0.9, BUILDING_ADS.maxBannerWidth);
  const room = b.top - b.base - BUILDING_ADS.bannerLift - 1;
  const height = Math.max(3, Math.min(room, width * 0.55, BUILDING_ADS.maxBannerHeight));
  const mx = (b.ax + b.bx) / 2;
  const mz = (b.az + b.bz) / 2;
  return {
    width,
    height,
    yaw: Math.atan2(b.nx, b.nz),
    banner: [
      mx + b.nx * 0.3,
      b.base + BUILDING_ADS.bannerLift + height / 2,
      mz + b.nz * 0.3,
    ] as const,
    roof: [mx - b.nx * 1.2, b.top, mz - b.nz * 1.2] as const,
    signWidth: Math.min(len * 0.7, 22),
  };
}

function AdBuildingView({ p }: { p: AdPlacement }) {
  const l = useMemo(() => layout(p), [p]);
  const banner = useMemo(() => bannerTexture(p.ad, l.width / l.height), [p.ad, l]);
  const sign = useMemo(() => (p.ad ? bannerTexture(p.ad, l.signWidth / 3.4) : null), [p.ad, l]);
  useEffect(
    () => () => {
      banner.dispose();
      sign?.dispose();
    },
    [banner, sign],
  );
  const open = () => useAdCard.setState({ placement: p });
  return (
    <group>
      <mesh position={l.banner} rotation-y={l.yaw} onClick={open}>
        <planeGeometry args={[l.width, l.height]} />
        <meshStandardMaterial
          map={banner}
          emissive="#ffffff"
          emissiveMap={banner}
          emissiveIntensity={0.1}
          roughness={0.6}
        />
      </mesh>
      {sign && (
        <group position={l.roof} rotation-y={l.yaw}>
          {[-l.signWidth * 0.35, l.signWidth * 0.35].map((x) => (
            <mesh key={x} position={[x, 1.2, -0.1]}>
              <boxGeometry args={[0.2, 2.4, 0.2]} />
              <meshStandardMaterial color="#2a2d31" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 2.4 + 1.7, 0]} onClick={open}>
            <planeGeometry args={[l.signWidth, 3.4]} />
            <meshStandardMaterial
              map={sign}
              emissive="#ffffff"
              emissiveMap={sign}
              emissiveIntensity={0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Advertiser-owned buildings: the owner's branding as a big banner on the building's street wall
 * and a lit sign on its roof; unbooked prominent buildings say they're available. Only the
 * nearest few are drawn. Driving past an owned building (or tapping its ad) shows the details card.
 */
export function BuildingAds({ city }: { city: City }) {
  const tier = useSettings((s) => s.quality.tier);
  const placements = useMemo(
    () => assignBuildingAds(city.index.adBuildings ?? [], city.index.spawn),
    [city],
  );
  const [shown, setShown] = useState<AdPlacement[]>([]);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const timer = useRef(0);

  useFrame((_, dt) => {
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 1;
    const car = vehicleState.active;
    if (!car) return;
    car.object.getWorldPosition(pos);
    const dist = (p: AdPlacement) =>
      Math.hypot(
        (p.building.ax + p.building.bx) / 2 - pos.x,
        (p.building.az + p.building.bz) / 2 - pos.z,
      );
    const nearest = [...placements]
      .sort((a, b) => dist(a) - dist(b))
      .slice(0, BUILDING_ADS.visible[tier]);
    setShown((prev) =>
      prev.length === nearest.length && prev.every((p, i) => p === nearest[i]) ? prev : nearest,
    );
    // Details card for an owned building right beside the car.
    const close = nearest.find((p) => p.ad && dist(p) < BUILDING_ADS.cardRange) ?? null;
    const current = useAdCard.getState().placement;
    if (close !== current && (close || (current && dist(current) > BUILDING_ADS.cardRange * 1.6))) {
      useAdCard.setState({ placement: close });
    }
  });

  return (
    <>
      {shown.map((p) => (
        <AdBuildingView key={p.building.id} p={p} />
      ))}
    </>
  );
}
