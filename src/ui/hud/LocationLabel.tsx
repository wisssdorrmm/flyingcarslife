import { useEffect, useState } from 'react';
import { currentPose } from '../../game/store/nav';
import { locate } from '../../game/world/cityPlan';


/** Shows the street you're on (and the cross street at intersections), updated twice a second. */
export function LocationLabel() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const pose = currentPose();
      if (!pose) return;
      const { road, cross } = locate(pose.x, pose.z);
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
