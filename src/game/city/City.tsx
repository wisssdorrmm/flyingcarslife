import { useCallback, useEffect, useState } from 'react';
import { suspend } from 'suspend-react';
import { CITY_STREAMING, GARAGE } from '../config';
import { RooftopCarPark } from '../debug/RooftopCarPark';
import { carParkBase, carParkWaypoint } from '../debug/carParkLayout';
import { useTestScene } from '../debug/testScenes';
import { PoliceChaser } from '../police/PoliceChaser';
import { Goals } from '../goals/Goals';
import { usePlayerCar } from '../store/playerCar';
import { DrivableCar } from '../vehicles/DrivableCar';
import { Hijack } from '../vehicles/Hijack';
import { LeftCars } from '../vehicles/LeftCars';
import { Pedestrians } from '../npc/Pedestrians';
import { Traffic } from '../traffic/Traffic';
import { TireFx } from '../vehicles/TireFx';
import { loadCity, preloadAround } from './cityData';
import { Billboards } from '../ads/Billboards';
import { BayBridge } from './BayBridge';
import { CityTiles } from './CityTiles';
import { GpsRoute } from './GpsRoute';
import { Water } from './Water';

async function loadCityWithSpawn() {
  const city = await loadCity();
  const { x, z } = city.index.spawn;
  await preloadAround(city, x, z, CITY_STREAMING.preloadRadius);
  return city;
}

/**
 * The OpenStreetMap city (North Beach + Fisherman's Wharf): streamed tiles, the bay, and the
 * player's car at the spawn point. Suspends until the tiles around the spawn are ready.
 */
export function City() {
  const city = suspend(loadCityWithSpawn, ['flyingcarslife-city']);
  const s = city.index.spawn;
  // The car's body is created while rendering; mount it only once the spawn tiles' colliders exist,
  // or frames that run between render and commit let it fall through the empty world.
  const [groundReady, setGroundReady] = useState(false);
  const onReady = useCallback(() => setGroundReady(true), []);
  const chaser = useTestScene((t) => t.chaser);
  // The player starts in their flying car at the spawn point; hijacking swaps it (store/playerCar).
  const car = usePlayerCar((p) => p.car);
  const carDef = GARAGE.cars.find((c) => c.id === car?.carId);
  useEffect(() => {
    if (usePlayerCar.getState().car) return;
    usePlayerCar.getState().setCar({
      model: 'ev',
      paint: '#eceef0',
      canFly: true,
      position: [s.x, s.y + 0.6, s.z],
      heading: s.heading,
      speed: 0,
    });
  }, [s]);
  return (
    <>
      <CityTiles city={city} onReady={onReady} />
      <Water />
      <BayBridge />
      <Billboards city={city} />
      <RooftopCarPark city={city} />
      {groundReady && chaser && (
        <PoliceChaser
          key={`chaser-${chaser.key}`}
          start={chaser.start}
          heading={chaser.heading}
          nav={(p, target) => carParkWaypoint(carParkBase(city), p, target)}
        />
      )}
      <GpsRoute city={city} />
      <TireFx />
      {groundReady && <Traffic city={city} />}
      {groundReady && <Pedestrians city={city} />}
      <LeftCars />
      {groundReady && <Goals city={city} />}
      {groundReady && <Hijack city={city} />}
      {groundReady && car && (
        <DrivableCar
          key={`car-${car.key}`}
          id="player-car"
          position={car.position}
          heading={car.heading}
          paint={car.paint}
          model={car.model}
          canFly={car.canFly}
          initialSpeed={car.speed}
          power={carDef?.power ?? 1}
          flightSeconds={carDef?.flightSeconds || undefined}
          wheels={GARAGE.wheels.find((w) => w.id === car.wheels)?.color ?? ''}
        />
      )}
    </>
  );
}
