import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { INPUT, PHYSICS, PLAYER, PLAYER_ANIMATIONS } from '../config';
import { useGame } from '../store/game';
import { vehicleState } from '../vehicles/vehicleState';
import { consumePress, input, readMove } from '../systems/input';
import {
  ANIMATION_SOURCE,
  buildCharacter,
  CHARACTER_MODEL,
  type AnimState,
} from './characterModel';
import { cameraBasis, cameraState, playerState } from './playerState';

const GRAVITY = PHYSICS.gravity[1];
const CAPSULE_CENTER = PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius;
const FADE = 0.2;

/** Shortest signed angle from a to b. */
function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const { world } = useRapier();

  const characterGltf = useGLTF(modelUrl(CHARACTER_MODEL), false, true);
  const animationGltf = useGLTF(modelUrl(ANIMATION_SOURCE), false, true);
  const character = useMemo(
    () =>
      buildCharacter(
        characterGltf.scene,
        animationGltf.scene,
        animationGltf.animations,
        characterGltf.animations,
      ),
    [characterGltf, animationGltf],
  );

  // Kinematic character controller: slides along walls, climbs curbs, snaps to the ground.
  const controller = useMemo(() => {
    const c = world.createCharacterController(0.02);
    c.enableAutostep(PLAYER.stepHeight, 0.15, false);
    c.enableSnapToGround(0.3);
    c.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(PLAYER.maxSlopeDegrees));
    c.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(PLAYER.maxSlopeDegrees + 5));
    c.setApplyImpulsesToDynamicBodies(true);
    return c;
  }, [world]);
  useEffect(() => () => world.removeCharacterController(controller), [world, controller]);

  const motion = useRef({
    velocity: new THREE.Vector3(),
    airTime: 0,
    jumpBufferedFor: 0,
  });

  useBeforePhysicsStep(() => {
    const rb = body.current;
    const col = collider.current;
    if (!rb || !col) return;
    const dt = PHYSICS.timeStep;
    const m = motion.current;

    // While driving, the character is parked out of the simulation.
    if (useGame.getState().mode === 'driving') {
      if (rb.isEnabled()) rb.setEnabled(false);
      return;
    }
    if (!rb.isEnabled()) rb.setEnabled(true);
    if (playerState.teleport) {
      rb.setTranslation(playerState.teleport, true);
      rb.setNextKinematicTranslation(playerState.teleport);
      m.velocity.set(0, 0, 0);
      playerState.velocity.set(0, 0, 0);
      playerState.teleport = null;
      return;
    }

    // Target horizontal velocity from input, relative to the camera.
    const move = readMove();
    const sprinting = input.held.has('sprint') || input.sprintToggle;
    const walking =
      input.held.has('walk') ||
      (input.touchMove.active && move.magnitude < INPUT.joystickRunThreshold);
    const speed =
      move.magnitude === 0
        ? 0
        : sprinting
          ? PLAYER.sprintSpeed
          : walking
            ? PLAYER.walkSpeed
            : PLAYER.runSpeed;
    const { forward, right } = cameraBasis(cameraState.yaw);
    const dir = forward.multiplyScalar(move.y).add(right.multiplyScalar(move.x));
    if (dir.lengthSq() > 1) dir.normalize();
    const targetX = dir.x * speed;
    const targetZ = dir.y * speed;

    const grounded = playerState.grounded;
    const accel = PLAYER.acceleration * (grounded ? 1 : PLAYER.airControl) * dt;
    const v = m.velocity;
    const dx = targetX - v.x;
    const dz = targetZ - v.z;
    const dl = Math.hypot(dx, dz);
    if (dl > accel) {
      v.x += (dx / dl) * accel;
      v.z += (dz / dl) * accel;
    } else {
      v.x = targetX;
      v.z = targetZ;
    }

    // Jumping with coyote time and a short input buffer.
    if (consumePress('jump')) m.jumpBufferedFor = PLAYER.jumpBuffer;
    else m.jumpBufferedFor = Math.max(0, m.jumpBufferedFor - dt);
    m.airTime = grounded ? 0 : m.airTime + dt;
    if (m.jumpBufferedFor > 0 && m.airTime <= PLAYER.coyoteTime && v.y <= 0.01) {
      v.y = PLAYER.jumpVelocity;
      m.jumpBufferedFor = 0;
      m.airTime = PLAYER.coyoteTime + dt;
    }
    v.y += GRAVITY * dt;

    const desired = { x: v.x * dt, y: v.y * dt, z: v.z * dt };
    controller.computeColliderMovement(col, desired);
    const moved = controller.computedMovement();
    const nowGrounded = controller.computedGrounded();

    // Landed, or bumped a ceiling: kill vertical speed.
    if ((nowGrounded && v.y < 0) || (v.y > 0 && moved.y < desired.y * 0.5)) v.y = 0;
    // Blocked horizontally (walls): match the real movement so we don't build up speed.
    v.x = moved.x / dt;
    v.z = moved.z / dt;

    const p = rb.translation();
    rb.setNextKinematicTranslation({ x: p.x + moved.x, y: p.y + moved.y, z: p.z + moved.z });
    playerState.grounded = nowGrounded;
    playerState.velocity.set(v.x, v.y, v.z);
  });

  // Animation mixer driven by movement speed.
  const anim = useMemo(() => {
    const mixer = new THREE.AnimationMixer(character.mesh);
    const actions = {} as Record<AnimState, THREE.AnimationAction | null>;
    for (const state of Object.keys(character.clips) as AnimState[]) {
      const clip = character.clips[state];
      actions[state] = clip ? mixer.clipAction(clip) : null;
    }
    // No jump/fall clips in the stand-in library: freeze the run cycle mid-stride as an air pose.
    const airClip = character.clips.run;
    const airPose = airClip ? mixer.clipAction(airClip.clone()) : null;
    if (airPose && airClip) {
      airPose.time = airClip.duration * 0.3;
      airPose.timeScale = 0;
    }
    if (!actions.jump) actions.jump = airPose;
    if (!actions.fall) actions.fall = airPose;
    return { mixer, actions, current: null as THREE.AnimationAction | null };
  }, [character]);
  useEffect(
    () => () => {
      anim.mixer.stopAllAction();
    },
    [anim],
  );

  useEffect(() => {
    // Debug hook for inspecting animation state from devtools / automated checks.
    if (new URLSearchParams(window.location.search).has('debug')) {
      Object.assign(window, {
        __player: { character, anim, cameraState, playerState, vehicleState, game: useGame },
      });
    }
    playerState.object = visual.current;
    playerState.bodyHandle = body.current?.handle ?? -1;
    return () => {
      playerState.object = null;
    };
  }, [character, anim]);

  useFrame((_, dt) => {
    if (visual.current) visual.current.visible = useGame.getState().mode !== 'driving';
    const v = playerState.velocity;
    const flat = Math.hypot(v.x, v.z);
    const airborne = !playerState.grounded && motion.current.airTime > 0.15;

    let state: AnimState;
    if (airborne) state = v.y > 0 ? 'jump' : 'fall';
    else if (flat < 0.2) state = 'idle';
    else if (flat < (PLAYER.walkSpeed + PLAYER.runSpeed) / 2) state = 'walk';
    else if (flat < (PLAYER.runSpeed + PLAYER.sprintSpeed) / 2) state = 'run';
    else state = 'sprint';

    const action = anim.actions[state] ?? anim.actions.idle;
    if (action && action !== anim.current) {
      action.reset().fadeIn(FADE).play();
      anim.current?.fadeOut(FADE);
      anim.current = action;
    }
    // Scale locomotion playback to ground speed so feet stay planted.
    const natural = PLAYER_ANIMATIONS[state].natural;
    if (action && natural > 0) action.timeScale = THREE.MathUtils.clamp(flat / natural, 0.5, 1.8);
    anim.mixer.update(dt);

    // Turn the model toward the direction of travel.
    const m = model.current;
    if (m && flat > 0.3) {
      const target = Math.atan2(v.x, v.z);
      const step = PLAYER.turnSpeed * dt;
      const d = angleDelta(m.rotation.y, target);
      m.rotation.y += THREE.MathUtils.clamp(d, -step, step);
    }
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={PLAYER.spawn}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider
        ref={collider}
        args={[PLAYER.capsuleHalfHeight, PLAYER.capsuleRadius]}
        position={[0, CAPSULE_CENTER, 0]}
      />
      <group ref={visual}>
        <group ref={model} rotation={[0, -PLAYER.spawnYaw, 0]}>
          <primitive object={character.root} />
        </group>
      </group>
    </RigidBody>
  );
}

useGLTF.preload(modelUrl(CHARACTER_MODEL), false, true);
useGLTF.preload(modelUrl(ANIMATION_SOURCE), false, true);
