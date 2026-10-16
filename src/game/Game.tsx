import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { PHYSICS, WORLD_LIGHTING } from './config';
import { useSettings } from './store/settings';
import { Buildings } from './world/Buildings';
import { DebugCamera } from './world/DebugCamera';
import { Fixtures } from './world/Fixtures';
import { PostFX } from './world/PostFX';
import { Props } from './world/Props';
import { SkyAndSun } from './world/SkyAndSun';
import { Street } from './world/Street';

/** Canvas, physics world and scene root. */
export default function Game() {
  const quality = useSettings((s) => s.quality);
  const debug = useSettings((s) => s.debug);

  return (
    <Canvas
      shadows={quality.shadows ? 'soft' : false}
      dpr={quality.dpr}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: WORLD_LIGHTING.exposure,
      }}
      camera={{ fov: 55, near: 0.1, far: 1500 }}
      onCreated={({ scene, gl }) => {
        // Debug hook for inspecting the scene from devtools / automated checks.
        if (debug) Object.assign(window, { __scene: scene, __gl: gl });
      }}
    >
      <fog
        attach="fog"
        args={[WORLD_LIGHTING.fogColor, WORLD_LIGHTING.fogNear, WORLD_LIGHTING.fogFar]}
      />
      <DebugCamera />

      <Suspense fallback={null}>
        <SkyAndSun />
        <Street />
        <Buildings />
        <Fixtures />
        <Props />
        <PostFX />
      </Suspense>

      <Suspense fallback={null}>
        <Physics gravity={PHYSICS.gravity} timeStep={PHYSICS.timeStep} interpolate debug={debug}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[500, 0.5, 500]} position={[0, -0.5, 0]} />
          </RigidBody>
          {debug && <PhysicsProbe />}
        </Physics>
      </Suspense>

      {debug && <Stats />}
    </Canvas>
  );
}

/** Debug-only: a body that falls, lands and respawns, proving the physics world steps. */
function PhysicsProbe() {
  const body = useRef<RapierRigidBody>(null);
  const restingFor = useRef(0);

  useFrame((_, dt) => {
    const rb = body.current;
    if (!rb) return;
    restingFor.current = rb.isSleeping() ? restingFor.current + dt : 0;
    if (restingFor.current > 1.5) {
      restingFor.current = 0;
      rb.setTranslation({ x: -20, y: 8, z: 4 }, true);
      rb.setLinvel({ x: 0.5, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 2, y: 1, z: 0 }, true);
    }
  });

  return (
    <RigidBody ref={body} position={[-20, 8, 4]} colliders="cuboid" restitution={0.3}>
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e2733b" />
      </mesh>
    </RigidBody>
  );
}
