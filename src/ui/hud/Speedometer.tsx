import { HUD_UNITS } from '../../game/config';
import { useGame } from '../../game/store/game';

/** Speed, battery and damage readout while driving. Updates ~10×/s from the vehicle. */
export function Speedometer() {
  const hud = useGame((s) => s.vehicleHud);
  if (!hud) return null;
  const batteryLow = hud.battery <= 15;
  return (
    <div className="speedometer" aria-label="Vehicle status">
      <div className="speed">
        <span className="speed-value">{hud.speed}</span>
        <span className="speed-unit">
          {hud.reversing ? 'R' : HUD_UNITS === 'mph' ? 'mph' : 'km/h'}
        </span>
      </div>
      <div className="meter" title={`Battery ${hud.battery}%`}>
        <span className="meter-label">Battery</span>
        <div className="meter-bar">
          <div
            className={`meter-fill${batteryLow ? ' warn' : ''}`}
            style={{ width: `${hud.battery}%` }}
          />
        </div>
        <span className="meter-value">{hud.battery}%</span>
      </div>
      {hud.damage > 0 && (
        <div className="meter" title={`Damage ${hud.damage}%`}>
          <span className="meter-label">Damage</span>
          <div className="meter-bar">
            <div className="meter-fill bad" style={{ width: `${hud.damage}%` }} />
          </div>
          <span className="meter-value">{hud.damage}%</span>
        </div>
      )}
    </div>
  );
}
