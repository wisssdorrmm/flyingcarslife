import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { modelUrl } from '../../lib/assets';
import { disposeGroup } from '../world/instancing';
import { buildStaticCar, CAR_MODEL } from './carModel';
import { PARKED } from './parkedLayout';

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
