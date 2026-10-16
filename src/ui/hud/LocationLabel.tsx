import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { playerState } from '../../game/player/playerState';
import { vehicleState } from '../../game/vehicles/vehicleState';
import { locate } from '../../game/world/cityPlan';

const tmp = new THREE.Vector3();

/** Shows the street you're on (and the cross street at intersections), updated twice a second. */
export function LocationLabel() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const obj = vehicleState.active?.object ?? playerState.object;
      if (!obj) return;
      obj.getWorldPosition(tmp);
      const { road, cross } = locate(tmp.x, tmp.z);
      const next = road ? (cross ? `${road.name} & ${cross.name}` : road.name) : null;
      setLabel((prev) => (prev === next ? prev : next));
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  if (!label) return null;
  return (
    <div className="location-label" aria-live="polite">
      <span className="location-city">Harbor City</span>
      <span>{label}</span>
    </div>
  );
}
