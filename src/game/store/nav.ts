import * as THREE from 'three';
import { create } from 'zustand';
import { vehicleState } from '../vehicles/vehicleState';

export interface Waypoint {
  x: number;
  z: number;
  label: string;
}

interface NavState {
  waypoint: Waypoint | null;
  /** Current GPS route (world points), recomputed as you move. */
  route: { x: number; z: number }[];
  /** Remaining route length in meters. */
  remaining: number;
  mapOpen: boolean;
  setWaypoint: (w: Waypoint | null) => void;
  setRoute: (route: { x: number; z: number }[], remaining: number) => void;
  setMapOpen: (open: boolean) => void;
}

export const useNav = create<NavState>()((set) => ({
  waypoint: null,
  route: [],
  remaining: 0,
  mapOpen: false,
  setWaypoint: (waypoint) => set({ waypoint, route: [], remaining: 0 }),
  setRoute: (route, remaining) => set({ route, remaining }),
  setMapOpen: (mapOpen) => {
    // Give the mouse back so the map can be dragged and clicked.
    if (mapOpen && document.pointerLockElement) document.exitPointerLock();
    set({ mapOpen });
  },
}));

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpFwd = new THREE.Vector3();

/** Where the player's car is and which way it faces (ground-plane unit vector). */
export function currentPose(): { x: number; z: number; fx: number; fz: number } | null {
  const car = vehicleState.active?.object;
  if (!car) return null;
  car.getWorldPosition(tmpPos);
  car.getWorldQuaternion(tmpQuat);
  tmpFwd.set(0, 0, 1).applyQuaternion(tmpQuat);
  const len = Math.hypot(tmpFwd.x, tmpFwd.z) || 1;
  return { x: tmpPos.x, z: tmpPos.z, fx: tmpFwd.x / len, fz: tmpFwd.z / len };
}
