import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NET } from '../config';
import { playerState } from '../player/playerState';
import { useNet } from '../store/net';
import { vehicleState } from '../vehicles/vehicleState';
import { sendState } from './client';

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();

/** Sends the local player's position, facing, animation and car (if driving) ~10× per second. */
export function NetSystem() {
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 1 / NET.stateRate) return;
    last.current = clock.elapsedTime;
    const net = useNet.getState();
    if (net.status !== 'online' || !net.profile || !playerState.object) return;
    const car = vehicleState.active;
    if (car) {
      car.object.getWorldPosition(pos);
      car.object.getWorldQuaternion(quat);
      sendState({
        id: net.profile.id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: 0,
        anim: 'idle',
        car: {
          x: pos.x,
          y: pos.y,
          z: pos.z,
          qx: quat.x,
          qy: quat.y,
          qz: quat.z,
          qw: quat.w,
          paint: car.paint,
        },
      });
      return;
    }
    playerState.object.getWorldPosition(pos);
    sendState({
      id: net.profile.id,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      yaw: playerState.yaw,
      anim: playerState.anim,
      emote: playerState.emote
        ? { name: playerState.emote.name, t: playerState.emote.start }
        : undefined,
    });
  });
  return null;
}
