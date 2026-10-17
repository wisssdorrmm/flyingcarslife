import * as THREE from 'three';

const water = new THREE.MeshStandardMaterial({
  color: '#2c6f8e',
  roughness: 0.12,
  metalness: 0,
  envMapIntensity: 1.1,
});
water.name = 'bay-water';

/** San Francisco Bay: a sea-level plane; terrain below 0 m (bathymetry) is under it. */
export function Water() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow material={water}>
      <planeGeometry args={[9000, 9000]} />
    </mesh>
  );
}
