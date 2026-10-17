import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { addSlabSeams, usePbrMaterial } from '../world/materials';
import { makeFacadeMaterial } from './facadeMaterial';
import type { TileMeshName } from './format';

/** Shared materials for every city tile (ground UVs are world meters, see cityData.ts). */
export function useCityMaterials(): Record<TileMeshName, THREE.Material> {
  const asphalt = usePbrMaterial('asphalt_02', { tileMeters: 7, color: '#8d9094', roughness: 1 });
  const pavement = usePbrMaterial('concrete_floor_worn_001', { tileMeters: 3, color: '#e4e0d8' });
  const curb = usePbrMaterial('concrete', { tileMeters: 1.5, color: '#d9d6cf' });
  const grassBase = usePbrMaterial('concrete_pavement', {
    tileMeters: 4,
    color: '#7fae58',
    roughness: 1,
  });
  const sandBase = usePbrMaterial('concrete_pavement', {
    tileMeters: 5,
    color: '#e6d6ad',
    roughness: 1,
  });
  const pierBase = usePbrMaterial('concrete', { tileMeters: 3, color: '#b9b1a3' });

  const mats = useMemo(() => {
    const pav = pavement.clone();
    addSlabSeams(pav, 1.5);
    const grass = grassBase.clone();
    grass.metalnessMap = null;
    grass.metalness = 0;
    const sand = sandBase.clone();
    sand.metalnessMap = null;
    sand.metalness = 0;
    const markings = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    markings.name = 'city-markings';
    return {
      asphalt,
      pavement: pav,
      curb,
      grass,
      sand,
      pier: pierBase,
      markings,
      buildings: makeFacadeMaterial(),
    } satisfies Record<TileMeshName, THREE.Material>;
  }, [asphalt, pavement, curb, grassBase, sandBase, pierBase]);

  useEffect(
    () => () => {
      mats.pavement.dispose();
      mats.grass.dispose();
      mats.sand.dispose();
      mats.markings.dispose();
      mats.buildings.dispose();
    },
    [mats],
  );
  return mats;
}
