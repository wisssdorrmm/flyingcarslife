import { useCallback, useState } from 'react';
import { suspend } from 'suspend-react';
import { CITY_STREAMING } from '../config';
import { DrivableCar } from '../vehicles/DrivableCar';
import { Pedestrians } from '../npc/Pedestrians';
import { Traffic } from '../traffic/Traffic';
import { TireFx } from '../vehicles/TireFx';
import { loadCity, preloadAround } from './cityData';
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
  return (
    <>
      <CityTiles city={city} onReady={onReady} />
      <Water />
      <GpsRoute city={city} />
      <TireFx />
      {groundReady && <Traffic city={city} />}
      {groundReady && <Pedestrians city={city} />}
      {groundReady && (
        <DrivableCar
          id="player-car"
          position={[s.x, s.y + 0.6, s.z]}
          heading={s.heading}
          paint="#eceef0"
        />
      )}
    </>
  );
}
