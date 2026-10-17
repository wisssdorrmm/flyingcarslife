import { useGame } from '../../game/store/game';
import { useDrift } from '../../game/vehicles/drift';

/** Small bottom-center gauges: drift multiplier, and altitude while flying. */
export function Gauges() {
  const mult = useDrift((s) => (s.active ? s.multiplier : 0));
  const altitude = useGame((s) => s.vehicleHud?.altitude ?? null);
  return (
    <>
      {mult > 0 && (
        <div className="hud-gauge hud-panel">
          <div className="hud-gauge-label">COMBO</div>
          <div className="hud-gauge-value">×{mult}</div>
        </div>
      )}
      {altitude !== null && (
        <div className="hud-gauge hud-panel">
          <div className="hud-gauge-label">ALT</div>
          <div className="hud-gauge-value">{altitude} m</div>
        </div>
      )}
    </>
  );
}
