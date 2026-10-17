import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER, PLAYER_ANIMATIONS } from '../config';

/** Player stand-in (Mixamo "Michelle") and the clip library retargeted onto it (Mixamo "Soldier"). */
export const CHARACTER_MODEL = 'michelle';
export const ANIMATION_SOURCE = 'soldier';

export type AnimState = keyof typeof PLAYER_ANIMATIONS;

const HIP = 'mixamorigHips';

export interface Character {
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  /** One clip per animation state, or null when no source clip exists. */
  clips: Record<AnimState, THREE.AnimationClip | null>;
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  if (!found) throw new Error('Character has no skinned mesh');
  return found;
}

/**
 * Builds a skeleton from a scene's bone nodes. The animation-source file ships without meshes,
 * so it has no skin; retargeting only needs the bone hierarchy.
 */
function skeletonFromNodes(root: THREE.Object3D): THREE.Skeleton {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if (o.name.startsWith('mixamorig')) bones.push(o as THREE.Bone);
  });
  return new THREE.Skeleton(bones);
}

/**
 * Clones the character and retargets every clip it needs from the source rig.
 * Rigs from different Mixamo exports have different bone orientations, so tracks can't be copied
 * by name; retargetClip re-solves each frame in world space.
 */
export function buildCharacter(
  characterScene: THREE.Object3D,
  animationScene: THREE.Object3D,
  animationClips: THREE.AnimationClip[],
  ownClips: THREE.AnimationClip[],
): Character {
  const root = SkeletonUtils.clone(characterScene);
  const mesh = findSkinnedMesh(root);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      // Skinned bounds don't follow the animation; never cull the player.
      m.frustumCulled = false;
    }
  });

  // Mixamo files parent the hips to a scaled + rotated "Character" node. skeleton.pose() (used here
  // and inside retargeting) writes bind-pose *world* transforms into the root bone's local
  // transform, which applies that node twice. Flatten it to identity, then pose: the bind pose
  // already contains its scale and rotation.
  const rigParent = mesh.skeleton.bones[0]?.parent;
  if (rigParent && !(rigParent as THREE.Bone).isBone) {
    rigParent.position.set(0, 0, 0);
    rigParent.quaternion.identity();
    rigParent.scale.set(1, 1, 1);
  }
  root.updateMatrixWorld(true);
  mesh.skeleton.pose();
  root.updateMatrixWorld(true);

  // Scale the model to the configured height using the head-top bone at rest.
  const headTop = mesh.skeleton.getBoneByName('mixamorigHeadTop_End');
  const restHeight = headTop ? headTop.getWorldPosition(new THREE.Vector3()).y : PLAYER.height;
  root.scale.multiplyScalar(PLAYER.height / restHeight);
  root.updateMatrixWorld(true);

  // The source keeps its own Character transform: its clips are authored relative to it.
  const source = animationScene.clone(true) as THREE.Object3D & { skeleton?: THREE.Skeleton };
  source.scale.copy(root.scale);
  source.updateMatrixWorld(true);
  source.skeleton = skeletonFromNodes(source);

  const pick = (names: readonly string[]) => {
    for (const n of names) {
      const own = ownClips.find((c) => c.name === n);
      if (own) return own;
      const src = animationClips.find((c) => c.name === n);
      if (src) {
        // Both rigs use Mixamo bone names; retarget() only matches through getBoneName/names.
        const clip = SkeletonUtils.retargetClip(mesh, source, src, {
          hip: HIP,
          fps: 30,
          getBoneName: (bone: THREE.Bone) => bone.name,
        });
        clip.name = n;
        return clip;
      }
    }
    return null;
  };

  const clips = Object.fromEntries(
    (Object.keys(PLAYER_ANIMATIONS) as AnimState[]).map((state) => [
      state,
      pick(PLAYER_ANIMATIONS[state].clips),
    ]),
  ) as Record<AnimState, THREE.AnimationClip | null>;

  mesh.skeleton.pose();
  // The retargeted rig faces −z; turn it so the model's forward is +z like everything else.
  const facing = new THREE.Group();
  facing.name = 'character-facing';
  facing.rotation.y = Math.PI;
  facing.add(root);
  return { root: facing, mesh, clips };
}

const templates = new WeakMap<THREE.Object3D, Character>();

/**
 * One shared, fully retargeted character per loaded model. Other players are cheap clones of it
 * (retargeting the clips is the expensive part and only happens once).
 */
export function characterTemplate(
  characterScene: THREE.Object3D,
  animationScene: THREE.Object3D,
  animationClips: THREE.AnimationClip[],
  ownClips: THREE.AnimationClip[],
): Character {
  let t = templates.get(characterScene);
  if (!t) {
    t = buildCharacter(characterScene, animationScene, animationClips, ownClips);
    templates.set(characterScene, t);
  }
  return t;
}

/** A new instance of a template that can animate independently (shares geometry and clips). */
export function cloneCharacter(t: Character): { root: THREE.Object3D; mesh: THREE.SkinnedMesh } {
  const root = SkeletonUtils.clone(t.root);
  const mesh = findSkinnedMesh(root);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return { root, mesh };
}
