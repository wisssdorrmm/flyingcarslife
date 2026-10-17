import { useEffect, useState } from 'react';
import { useCity } from '../../game/city/cityData';
import { currentPose } from '../../game/store/nav';

/** Neighborhood and street (plus the cross street near junctions), updated twice a second. */
export function LocationLabel() {
  const city = useCity((s) => s.city);
  const [label, setLabel] = useState<{ district: string; street: string } | null>(null);

  useEffect(() => {
    if (!city) return;
    const id = window.setInterval(() => {
      const pose = currentPose();
      if (!pose) return;
      const { street, cross, district } = city.graph.locate(pose.x, pose.z);
      const next = { district, street: cross ? `${street} & ${cross}` : street };
      setLabel((prev) =>
        prev && prev.district === next.district && prev.street === next.street ? prev : next,
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [city]);

  if (!label) return null;
  return (
    <div className="location-label" aria-live="polite">
      <span className="location-city">{label.district}</span>
      {label.street && <span>{label.street}</span>}
    </div>
  );
}
