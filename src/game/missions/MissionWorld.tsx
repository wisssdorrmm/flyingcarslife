import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import {
  ANIMATION_SOURCE,
  CHARACTER_MODEL,
  characterTemplate,
  cloneCharacter,
  type AnimState,
} from '../player/characterModel';
import { PLANE_COLLIDER, PROP_HUBS, planeGeometries, planeMaterials } from './planeModel';
import { missionRuntime, type Actor, type Marker } from './runtime';

const COLORS: Record<Marker['kind'], string> = {
  objective: '#ffd166',
  next: '#ffd166',
  start: '#2fd5c0',
  hideout: '#ff8a5c',
};

const MAX_MARKERS = 4;

/** Tall soft light column + ground ring, like a mission marker should look from blocks away. */
function makeBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, time: { value: 0 }, strength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float time;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 1.6);
        float bands = 0.75 + 0.25 * sin(vUv.y * 40.0 - time * 3.0);
        gl_FragColor = vec4(color * 1.6, fade * bands * 0.5 * strength);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function makeRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, time: { value: 0 }, strength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float time;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float edge = smoothstep(0.78, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
        float pulse = smoothstep(0.0, 0.1, abs(r - fract(time * 0.6)) ) ;
        float fill = 0.12 * (1.0 - r);
        gl_FragColor = vec4(color * 1.4, (edge * 0.9 + fill + (1.0 - pulse) * 0.25 * (1.0 - r)) * strength);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function Markers() {
  const beamGeo = useMemo(
    () => new THREE.CylinderGeometry(1, 1, 60, 24, 1, true).translate(0, 30, 0),
    [],
  );
  const ringGeo = useMemo(() => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), []);
  const slots = useMemo(
    () =>
      Array.from({ length: MAX_MARKERS + 1 }, () => {
        const beam = new THREE.Mesh(beamGeo, makeBeamMaterial());
        const ring = new THREE.Mesh(ringGeo, makeRingMaterial());
        beam.frustumCulled = false;
        beam.renderOrder = 5;
        ring.renderOrder = 5;
        const g = new THREE.Group();
        g.add(beam, ring);
        g.visible = false;
        return { g, beam, ring };
      }),
    [beamGeo, ringGeo],
  );
  useEffect(
    () => () => {
      beamGeo.dispose();
      ringGeo.dispose();
      for (const s of slots) {
        (s.beam.material as THREE.Material).dispose();
        (s.ring.material as THREE.Material).dispose();
      }
    },
    [beamGeo, ringGeo, slots],
  );

  useFrame(({ clock }) => {
    const list = [...missionRuntime.markers.slice(0, MAX_MARKERS)];
    if (missionRuntime.startMarker) list.push(missionRuntime.startMarker);
    slots.forEach((s, i) => {
      const m = list[i];
      s.g.visible = !!m;
      if (!m) return;
      s.g.position.set(m.x, m.y + 0.06, m.z);
      const beamR = Math.max(1.2, m.radius * 0.45);
      s.beam.scale.set(beamR, m.kind === 'next' ? 0.5 : 1, beamR);
      s.ring.scale.setScalar(m.radius);
      for (const mesh of [s.beam, s.ring]) {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        u.color!.value.set(COLORS[m.kind]);
        u.time!.value = clock.elapsedTime;
        u.strength!.value = m.kind === 'next' ? 0.35 : 1;
      }
    });
  });

  return (
    <>
      {slots.map((s, i) => (
        <primitive key={i} object={s.g} />
      ))}
    </>
  );
}

interface Avatar {
  holder: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<AnimState, THREE.AnimationAction>>;
  current: THREE.AnimationAction | null;
  materials: THREE.MeshStandardMaterial[];
}

/** Mission people (crew, pilot) using the pedestrians' character model. */
function Actors() {
  const charGltf = useGLTF(modelUrl(CHARACTER_MODEL), false, true);
  const animGltf = useGLTF(modelUrl(ANIMATION_SOURCE), false, true);
  const template = useMemo(
    () =>
      characterTemplate(charGltf.scene, animGltf.scene, animGltf.animations, charGltf.animations),
    [charGltf, animGltf],
  );
  const root = useRef<THREE.Group>(null);
  const avatars = useRef(new Map<Actor, Avatar>());

  const make = (a: Actor): Avatar => {
    const { root: body, mesh } = cloneCharacter(template);
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mat.color.multiply(new THREE.Color(a.tint));
    mat.transparent = true;
    mesh.material = mat;
    const holder = new THREE.Group();
    holder.add(body);
    const mixer = new THREE.AnimationMixer(mesh);
    const actions: Avatar['actions'] = {};
    for (const s of ['idle', 'walk', 'run'] as AnimState[]) {
      const clip = template.clips[s];
      if (clip) actions[s] = mixer.clipAction(clip);
    }
    root.current?.add(holder);
    return { holder, mixer, actions, current: null, materials: [mat] };
  };

  useEffect(
    () => () => {
      for (const av of avatars.current.values()) {
        av.mixer.stopAllAction();
        av.materials.forEach((m) => m.dispose());
      }
      avatars.current.clear();
    },
    [],
  );

  useFrame((_, dt) => {
    const live = new Set(missionRuntime.actors.filter((a) => a.visible));
    for (const [a, av] of avatars.current) {
      if (!live.has(a)) {
        av.mixer.stopAllAction();
        root.current?.remove(av.holder);
        av.materials.forEach((m) => m.dispose());
        avatars.current.delete(a);
      }
    }
    for (const a of live) {
      let av = avatars.current.get(a);
      if (!av) avatars.current.set(a, (av = make(a)));
      av.holder.position.copy(a.pos);
      av.holder.rotation.y = a.heading;
      for (const m of av.materials) m.opacity = a.opacity;
      const want = av.actions[a.anim] ?? av.actions.idle ?? null;
      if (want && want !== av.current) {
        want.reset().fadeIn(0.2).play();
        av.current?.fadeOut(0.2);
        av.current = want;
      }
      if (want) want.timeScale = a.anim === 'run' ? 1.15 : 1;
      av.mixer.update(dt);
    }
  });

  return <group ref={root} />;
}

/** The cargo plane, with a kinematic collider so you can't drive through it. */
function Plane() {
  const geo = useMemo(planeGeometries, []);
  const mats = useMemo(planeMaterials, []);
  const group = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const props = useRef<THREE.Mesh[]>([]);
  const body = useRef<RapierRigidBody>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const spin = useRef(0);

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    },
    [geo, mats],
  );

  useFrame((_, dt) => {
    const p = missionRuntime.plane;
    const g = group.current;
    if (!g) return;
    g.visible = !!p && p.mode !== 'gone';
    if (!p) {
      body.current?.setNextKinematicTranslation({ x: 0, y: -500, z: 0 });
      return;
    }
    g.position.copy(p.pos);
    g.rotation.set(0, p.heading, 0);
    if (tilt.current) tilt.current.rotation.x = -p.pitch;
    spin.current += p.props * 60 * dt;
    for (const m of props.current) if (m) m.rotation.z = spin.current;
    mats.disc.opacity = Math.max(0, p.props - 0.4) * 0.35;
    for (const m of props.current) if (m) m.visible = p.props < 0.85;
    if (body.current) {
      body.current.setNextKinematicTranslation({ x: p.pos.x, y: p.pos.y, z: p.pos.z });
      q.setFromEuler(e.set(-p.pitch, p.heading, 0, 'YXZ'));
      body.current.setNextKinematicRotation(q);
    }
  });

  return (
    <>
      <group ref={group} visible={false}>
        <group ref={tilt}>
          <mesh geometry={geo.body} material={mats.body} castShadow receiveShadow />
          <mesh geometry={geo.white} material={mats.white} castShadow receiveShadow />
          <mesh geometry={geo.metal} material={mats.metal} castShadow />
          <mesh geometry={geo.rubber} material={mats.rubber} castShadow />
          {PROP_HUBS.map((hub, i) => (
            <group key={i} position={hub}>
              <mesh
                ref={(m) => {
                  if (m) props.current[i] = m;
                }}
                geometry={geo.prop}
                material={mats.prop}
                castShadow
              />
              <mesh geometry={geo.disc} material={mats.disc} position={[0, 0, 0.05]} />
            </group>
          ))}
        </group>
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -500, 0]}>
        <CuboidCollider args={[...PLANE_COLLIDER.half]} position={[...PLANE_COLLIDER.center]} />
      </RigidBody>
    </>
  );
}

/** Mission visuals: markers, people and the cargo plane. */
export function MissionWorld() {
  return (
    <>
      <Markers />
      <Actors />
      <Plane />
    </>
  );
}
