import { useDrift } from '../../game/vehicles/drift';

/** Live drift points and combo multiplier while a drift is building. */
export function DriftScore() {
  const { active, points, multiplier, combo } = useDrift();
  if (!active) return null;
  return (
    <div className="hud-drift hud-panel">
      <div className="hud-drift-label">DRIFT</div>
      <div className="hud-drift-row">
        <span className="hud-drift-points">{points.toLocaleString()}</span>
        <span className="hud-drift-mult">×{multiplier}</span>
      </div>
      <div className="hud-bar">
        <div style={{ width: `${Math.round(combo * 100)}%` }} />
      </div>
    </div>
  );
}
