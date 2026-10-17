import { useEffect } from 'react';
import { useCity } from '../city/cityData';
import { PoliceSystem } from '../police/PoliceSystem';
import { pursuit } from '../police/pursuit';
import { useSettings } from '../store/settings';
import { vehicleState } from '../vehicles/vehicleState';
import { MissionRunner } from './MissionRunner';
import { MissionWorld } from './MissionWorld';
import { PoliceFire } from './PoliceFire';
import { missionRuntime } from './runtime';
import { useMissions } from './store';

/** Police pursuit + missions (logic, markers, people, the plane, gunfire). Mount inside <Physics>. */
export function MissionSystem() {
  useEffect(() => {
    // Debug hook for devtools / automated checks (`?debug` only).
    if (useSettings.getState().debug) {
      Object.assign(window, {
        __missions: { useMissions, missionRuntime, pursuit, vehicleState, useCity },
      });
    }
  }, []);
  return (
    <>
      <PoliceSystem />
      <MissionRunner />
      <MissionWorld />
      <PoliceFire />
    </>
  );
}
