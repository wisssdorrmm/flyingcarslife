import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { PHYSICS, WORLD_LIGHTING } from './config';
import { Player } from './player/Player';
import { ThirdPersonCamera } from './player/ThirdPersonCamera';
import { useSettings } from './store/settings';
import { DesktopInput } from './systems/DesktopInput';
import { ChaseCamera } from './vehicles/ChaseCamera';
import { DrivableCar } from './vehicles/DrivableCar';
import { ParkedCars } from './vehicles/ParkedCars';
import { PLAYER_CAR } from './vehicles/parkedLayout';
import { Buildings } from './world/Buildings';
import { DebugCamera } from './world/DebugCamera';
import { Fixtures } from './world/Fixtures';
import { PostFX } from './world/PostFX';
import { Props } from './world/Props';
import { SkyAndSun } from './world/SkyAndSun';
import { Street } from './world/Street';
import { StreetSigns } from './world/StreetSigns';
import { WorldColliders } from './world/WorldColliders';

const params = new URLSearchParams(window.location.search);
/** `?debug&colliders` draws physics shapes. */
const showColliders = params.has('colliders');
/** `?debug&freecam` swaps the player for the free-fly review camera. */
const freecamRequested = params.has('freecam');

/** Canvas, physics world and scene root. */
export default function Game() {
  const quality = useSettings((s) => s.quality);
  const debug = useSettings((s) => s.debug);
  const freecam = debug && freecamRequested;

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
      {freecam ? <DebugCamera /> : <DesktopInput />}

      <Suspense fallback={null}>
        {/* updatePriority < 0: physics steps before default-priority frame callbacks (camera). */}
        <Physics
          gravity={PHYSICS.gravity}
          timeStep={PHYSICS.timeStep}
          interpolate
          debug={debug && showColliders}
          updatePriority={-50}
        >
          <SkyAndSun />
          <Street />
          <Buildings />
          <Fixtures />
          <StreetSigns />
          <Props />
          <ParkedCars />
          <DrivableCar {...PLAYER_CAR} />
          <WorldColliders />
          {!freecam && <Player />}
          {!freecam && <ThirdPersonCamera />}
          {!freecam && <ChaseCamera />}
          {debug && <PhysicsProbe />}
        </Physics>
        <PostFX />
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
