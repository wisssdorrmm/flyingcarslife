import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCity } from '../city/cityData';
import { CAR_FIRE } from '../config';
import { sfx } from '../missions/sfx';
import { useMissions } from '../missions/store';
import { pursuit } from '../police/pursuit';
import { useCareer } from '../store/career';
import { useGame } from '../store/game';
import { usePlayerCar } from '../store/playerCar';
import { toast } from '../store/toasts';
import { useUi } from '../store/ui';
import { vehicleState } from '../vehicles/vehicleState';

const FLAMES = 18;
const SMOKE = 14;

function spriteTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Puff {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

/**
 * A badly damaged car catches fire and explodes after a short fuse. Switch to another car before
 * it blows; still inside and you're WASTED (hospital bill, respawn in a fresh flying car, any
 * mission fails).
 */
export function CarFire() {
  const city = useCity((s) => s.city);
  const fx = useMemo(() => {
    const flameMat = new THREE.SpriteMaterial({
      map: spriteTexture('rgba(255,230,150,1)', 'rgba(255,90,10,0)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const smokeMat = new THREE.SpriteMaterial({
      map: spriteTexture('rgba(40,38,36,0.7)', 'rgba(40,38,36,0)'),
      depthWrite: false,
    });
    const make = (m: THREE.SpriteMaterial): Puff => {
      const s = new THREE.Sprite(m.clone());
      s.visible = false;
      return { s, v: new THREE.Vector3(), life: 0, max: 1, size: 1 };
    };
    const blast = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: '#ffb347',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    blast.visible = false;
    return {
      flames: Array.from({ length: FLAMES }, () => make(flameMat)),
      smoke: Array.from({ length: SMOKE }, () => make(smokeMat)),
      blast,
      flameMat,
      smokeMat,
    };
  }, []);
  useEffect(
    () => () => {
      for (const p of [...fx.flames, ...fx.smoke]) (p.s.material as THREE.Material).dispose();
      fx.flameMat.map?.dispose();
      fx.smokeMat.map?.dispose();
      fx.blast.geometry.dispose();
      (fx.blast.material as THREE.Material).dispose();
    },
    [fx],
  );

  const fire = useRef<{ key: number; left: number; pos: THREE.Vector3 } | null>(null);
  const blastT = useRef(-1);
  const emit = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const spawn = (list: Puff[], at: THREE.Vector3, size: number, life: number, rise: number) => {
    const p = list.find((x) => x.life <= 0);
    if (!p) return;
    p.s.position.copy(at).add(tmp.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
    p.v.set(
      (Math.random() - 0.5) * 0.6,
      rise * (0.7 + Math.random() * 0.6),
      (Math.random() - 0.5) * 0.6,
    );
    p.life = p.max = life;
    p.size = size;
    p.s.visible = true;
  };

  useFrame((_, rawDt) => {
    if (useUi.getState().menuOpen) return;
    const dt = Math.min(rawDt, 0.1);
    const car = vehicleState.active;
    const key = usePlayerCar.getState().car?.key ?? -1;
    const damage = useGame.getState().vehicleHud?.damage ?? 0;
    const f = fire.current;

    if (car && !f && damage >= CAR_FIRE.atDamage) {
      fire.current = {
        key,
        left: CAR_FIRE.fuse,
        pos: car.object.getWorldPosition(new THREE.Vector3()),
      };
      toast('Your car is on fire — switch cars before it blows!', 'warn');
    }
    if (f) {
      const inside = f.key === key && !!car;
      if (inside) car.object.getWorldPosition(f.pos);
      f.left -= dt;
      emit.current -= dt;
      if (emit.current <= 0) {
        emit.current = 0.05;
        tmp.copy(f.pos).setY(f.pos.y + 1.1);
        spawn(fx.flames, tmp, 1.1, 0.5, 2.2);
        if (Math.random() < 0.5) spawn(fx.smoke, tmp.setY(f.pos.y + 1.8), 2.2, 1.6, 2.5);
      }
      if (f.left <= 0) {
        fire.current = null;
        blastT.current = 0;
        fx.blast.position.copy(f.pos).setY(f.pos.y + 0.8);
        for (let i = 0; i < 8; i++) spawn(fx.smoke, fx.blast.position, 4, 2.4, 3);
        sfx.boom();
        if (inside) wasted();
      }
    }

    // Particles and the fireball.
    for (const p of [...fx.flames, ...fx.smoke]) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.addScaledVector(p.v, dt);
      const t = 1 - p.life / p.max;
      p.s.scale.setScalar(p.size * (0.6 + t));
      (p.s.material as THREE.SpriteMaterial).opacity = Math.min(1, (1 - t) * 1.5);
      if (p.life <= 0) p.s.visible = false;
    }
    if (blastT.current >= 0) {
      blastT.current += dt;
      const t = blastT.current / 0.6;
      fx.blast.visible = t < 1;
      fx.blast.scale.setScalar(1 + t * 7);
      (fx.blast.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      if (t >= 1) blastT.current = -1;
    }
  });

  const wasted = () => {
    const career = useCareer.getState();
    const fee = Math.min(
      career.cash,
      Math.round(CAR_FIRE.hospitalFee + career.cash * CAR_FIRE.hospitalCashShare),
    );
    if (fee > 0) career.spend(fee);
    toast(`WASTED  −$${fee.toLocaleString()} hospital bill`, 'warn');
    useMissions.getState().fail('Wasted');
    pursuit.clear();
    const s = city?.index.spawn;
    if (s) {
      usePlayerCar.getState().setCar({
        model: 'ev',
        paint: '#eceef0',
        canFly: true,
        position: [s.x, s.y + 0.6, s.z],
        heading: s.heading,
        speed: 0,
      });
    }
  };

  return (
    <>
      {[...fx.flames, ...fx.smoke].map((p, i) => (
        <primitive key={i} object={p.s} />
      ))}
      <primitive object={fx.blast} />
    </>
  );
}
