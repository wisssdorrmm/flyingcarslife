/**
 * Procedural pose layer for the Mixamo pedestrians (applied after the mixer each frame): point at
 * something, hold up a phone, tilt the head up.
 */
import * as THREE from 'three';

const tmp = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  d0: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  qw: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
  world: new THREE.Quaternion(),
  ident: new THREE.Quaternion(),
};

/** Rotates `bone` (blended by w) so the segment toward `child` points along world `dir`. */
export function aimBone(
  bone: THREE.Object3D,
  child: THREE.Object3D,
  dir: THREE.Vector3,
  w: number,
): void {
  child.updateWorldMatrix(true, false);
  bone.getWorldPosition(tmp.a);
  child.getWorldPosition(tmp.b);
  tmp.d0.subVectors(tmp.b, tmp.a).normalize();
  tmp.q.setFromUnitVectors(tmp.d0, dir);
  tmp.qw.copy(tmp.ident).slerp(tmp.q, w);
  bone.getWorldQuaternion(tmp.world);
  bone.parent?.getWorldQuaternion(tmp.parent);
  bone.quaternion.copy(tmp.parent.invert().multiply(tmp.qw.multiply(tmp.world)));
}

export interface LookPose {
  rightArm: THREE.Bone | undefined;
  rightForeArm: THREE.Bone | undefined;
  rightHand: THREE.Bone | undefined;
  head: THREE.Bone | undefined;
}

export function findLookBones(skeleton: THREE.Skeleton): LookPose {
  const b = (n: string) => skeleton.getBoneByName(`mixamorig${n}`);
  return {
    rightArm: b('RightArm'),
    rightForeArm: b('RightForeArm'),
    rightHand: b('RightHand'),
    head: b('Head'),
  };
}

const dir = new THREE.Vector3();
const fwd = new THREE.Vector3();

/**
 * Look up at `target` (world) with weight w: point the right arm at it, or hold a phone up in
 * front of the face toward it.
 */
export function applyLookPose(
  pose: LookPose,
  holder: THREE.Object3D,
  target: THREE.Vector3,
  phone: boolean,
  w: number,
): void {
  if (w <= 0 || !pose.rightArm || !pose.rightForeArm || !pose.rightHand) return;
  pose.head?.getWorldPosition(dir);
  dir.subVectors(target, dir).normalize();
  if (phone) {
    // Upper arm forward, forearm up: the phone ends up in front of the face, aimed at the car.
    holder.getWorldDirection(fwd);
    aimBone(
      pose.rightArm,
      pose.rightForeArm,
      fwd.clone().multiplyScalar(0.9).add(dir.clone().multiplyScalar(0.25)).normalize(),
      w,
    );
    aimBone(
      pose.rightForeArm,
      pose.rightHand,
      dir
        .clone()
        .add(new THREE.Vector3(0, 0.6, 0))
        .normalize(),
      w,
    );
  } else {
    aimBone(pose.rightArm, pose.rightForeArm, dir, w);
    aimBone(pose.rightForeArm, pose.rightHand, dir, w);
  }
  if (pose.head) {
    // Tilt the head up toward the car (Mixamo head bone: −x pitches up).
    const up = Math.min(0.7, Math.max(0, dir.y) * 0.9);
    pose.head.rotateX(-up * w);
  }
}
