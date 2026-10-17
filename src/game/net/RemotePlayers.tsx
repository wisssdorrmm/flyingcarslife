import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { NET, PLAYER_ANIMATIONS } from '../config';
import {
  ANIMATION_SOURCE,
  CHARACTER_MODEL,
  characterTemplate,
  cloneCharacter,
  type AnimState,
} from '../player/characterModel';
import { applyEmote, emoteFinished } from '../player/emotes';
import { useNet } from '../store/net';
import { buildStaticCar, CAR_MODEL_LOD } from '../vehicles/carModel';
import { chatBubbles, remoteSnapshots } from './client';
import { makeBubble, makeNameTag } from './nameTag';
import type { PlayerProfile, PlayerSnapshot } from './types';

const tmpA = new THREE.Quaternion();
const tmpB = new THREE.Quaternion();
const camPos = new THREE.Vector3();

/** Snapshot pair around `t` and the blend factor between them. */
function sample(
  list: PlayerSnapshot[],
  t: number,
): { a: PlayerSnapshot; b: PlayerSnapshot; k: number } | null {
  if (!list.length) return null;
  if (t <= list[0]!.t) return { a: list[0]!, b: list[0]!, k: 0 };
  for (let i = 1; i < list.length; i++) {
    const b = list[i]!;
    if (b.t >= t) {
      const a = list[i - 1]!;
      return { a, b, k: (t - a.t) / Math.max(1, b.t - a.t) };
    }
  }
  const last = list[list.length - 1]!;
  return { a: last, b: last, k: 0 };
}

function RemotePlayer({ profile }: { profile: PlayerProfile }) {
  const charGltf = useGLTF(modelUrl(CHARACTER_MODEL), false, true);
  const animGltf = useGLTF(modelUrl(ANIMATION_SOURCE), false, true);
  const carGltf = useGLTF(modelUrl(CAR_MODEL_LOD), false, true);
  const group = useRef<THREE.Group>(null);

  const avatar = useMemo(() => {
    const template = characterTemplate(
      charGltf.scene,
      animGltf.scene,
      animGltf.animations,
      charGltf.animations,
    );
    const { root, mesh } = cloneCharacter(template);
    const mixer = new THREE.AnimationMixer(mesh);
    const actions = {} as Record<AnimState, THREE.AnimationAction | null>;
    for (const s of Object.keys(template.clips) as AnimState[]) {
      const clip = template.clips[s];
      actions[s] = clip ? mixer.clipAction(clip) : null;
    }
    actions.jump ??= actions.run;
    actions.fall ??= actions.run;
    const holder = new THREE.Group();
    holder.add(root);
    return {
      holder,
      mixer,
      actions,
      skeleton: mesh.skeleton,
      current: null as THREE.AnimationAction | null,
    };
  }, [charGltf, animGltf]);

  const tag = useMemo(() => makeNameTag(profile), [profile]);
  const bubble = useMemo(() => makeBubble(), []);
  const cars = useRef(new Map<string, THREE.Group>());
  const shownBubble = useRef<number>(0);

  useEffect(
    () => () => {
      avatar.mixer.stopAllAction();
      tag.material.map?.dispose();
      tag.material.dispose();
      bubble.sprite.material.map?.dispose();
      bubble.sprite.material.dispose();
    },
    [avatar, tag, bubble],
  );

  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    const list = remoteSnapshots.get(profile.id) ?? [];
    const s = sample(list, performance.now() - NET.interpolationDelay * 1000);
    g.visible = !!s;
    if (!s) return;
    const { a, b, k } = s;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const z = a.z + (b.z - a.z) * k;
    // Far-away players aren't drawn or animated at all.
    camera.getWorldPosition(camPos);
    if (Math.hypot(camPos.x - x, camPos.z - z) > NET.drawRange) {
      g.visible = false;
      return;
    }

    // Driving: show their car (built once per paint), hide the person.
    const carSnap = b.car ?? a.car;
    for (const c of cars.current.values()) c.visible = false;
    let headY = y + 2.15;
    if (carSnap && a.car && b.car) {
      let car = cars.current.get(carSnap.paint);
      if (!car) {
        car = buildStaticCar(carGltf.scene, { paint: carSnap.paint });
        cars.current.set(carSnap.paint, car);
        g.add(car);
      }
      car.visible = true;
      car.position.set(x, y, z);
      tmpA.set(a.car.qx, a.car.qy, a.car.qz, a.car.qw);
      tmpB.set(b.car.qx, b.car.qy, b.car.qz, b.car.qw);
      car.quaternion.slerpQuaternions(tmpA, tmpB, k);
      avatar.holder.visible = false;
      headY = y + 1.9;
    } else {
      avatar.holder.visible = true;
      avatar.holder.position.set(x, y, z);
      const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      avatar.holder.rotation.y = a.yaw + dy * k;
      const action = avatar.actions[b.anim] ?? avatar.actions.idle;
      if (action && action !== avatar.current) {
        action.reset().fadeIn(0.2).play();
        avatar.current?.fadeOut(0.2);
        avatar.current = action;
      }
      // Match playback to their ground speed.
      const span = Math.max(0.001, (b.t - a.t) / 1000);
      const speed = Math.hypot(b.x - a.x, b.z - a.z) / span;
      const natural = PLAYER_ANIMATIONS[b.anim].natural;
      if (action && natural > 0)
        action.timeScale = THREE.MathUtils.clamp(speed / natural, 0.5, 1.8);
      avatar.mixer.update(dt);
      // Their emote, timed from when they started it (already on our clock).
      const emote = b.emote;
      const root = avatar.holder.children[0];
      if (root) root.position.y = 0;
      if (emote) {
        const t = (performance.now() - emote.t) / 1000;
        if (!emoteFinished(emote.name, t)) {
          const bounce = applyEmote(avatar.skeleton, avatar.holder, emote.name, t);
          if (root) root.position.y = bounce;
        }
      }
    }

    // Name tag and chat bubble, only within range.
    camera.getWorldPosition(camPos);
    const near = camPos.distanceTo(new THREE.Vector3(x, y, z)) < NET.nameTagRange;
    tag.visible = near;
    tag.position.set(x, headY, z);
    const line = chatBubbles.get(profile.id);
    const fresh = line && performance.now() - line.at < NET.chat.bubbleSeconds * 1000;
    if (line && fresh && shownBubble.current !== line.at) {
      bubble.setText(line.text);
      shownBubble.current = line.at;
    }
    bubble.sprite.visible = !!fresh && near;
    bubble.sprite.position.set(x, headY + 0.55, z);
  });

  return (
    <group ref={group}>
      <primitive object={avatar.holder} />
      <primitive object={tag} />
      <primitive object={bubble.sprite} />
    </group>
  );
}

/** Everyone else in the room (blocked players are never drawn). */
export function RemotePlayers() {
  const players = useNet((s) => s.players);
  const blocked = useNet((s) => s.blocked);
  return (
    <>
      {players
        .filter((p) => !blocked.has(p.id))
        .map((p) => (
          <RemotePlayer key={p.id} profile={p} />
        ))}
    </>
  );
}
