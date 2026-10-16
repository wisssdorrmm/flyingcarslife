import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { modelUrl } from '../../lib/assets';
import { disposeGroup } from '../world/instancing';
import { LAYOUT } from '../world/layout';
import { buildStaticCar, CAR_MODEL, type CarLook } from './carModel';

interface ParkedCar extends CarLook {
  position: [number, number, number];
  /** Heading in radians; 0 faces +z (the model's front). */
  heading: number;
}

const laneCenter = LAYOUT.mainHalfWidth - LAYOUT.mainLanes.parking / 2;

const PARKED: ParkedCar[] = [
  // Eastbound parking lane (south side), facing east.
  { position: [-24, 0, laneCenter], heading: Math.PI / 2, paint: '#eceef0' },
  { position: [34, 0, laneCenter], heading: Math.PI / 2, paint: '#1d2024' },
  // Westbound parking lane (north side), facing west.
  { position: [-41, 0, -laneCenter], heading: -Math.PI / 2, paint: '#8e1218' },
  { position: [22, 0, -laneCenter], heading: -Math.PI / 2, paint: '#5d6670' },
];

export function ParkedCars() {
  const gltf = useGLTF(modelUrl(CAR_MODEL), false, true);
  const cars = useMemo(
    () =>
      PARKED.map((c) => {
        const car = buildStaticCar(gltf.scene, c);
        car.position.set(...c.position);
        car.rotation.y = c.heading;
        return car;
      }),
    [gltf],
  );
  useEffect(() => () => cars.forEach(disposeGroup), [cars]);
  return (
    <>
      {cars.map((car, i) => (
        <primitive key={i} object={car} />
      ))}
    </>
  );
}

useGLTF.preload(modelUrl(CAR_MODEL), false, true);

