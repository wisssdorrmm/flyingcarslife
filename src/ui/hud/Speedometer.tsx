import { HUD_UNITS } from '../../game/config';
import { useCareer, type Assist } from '../../game/store/career';
import { useGame } from '../../game/store/game';

const MAX = HUD_UNITS === 'mph' ? 180 : 300;
const SWEEP = 270;
const R = 62;
const C = 2 * Math.PI * R;
const ASSISTS: Assist[] = ['MAN', 'ABS', 'TCS', 'ESP'];

/** Round speedometer with gear letter and battery, plus the assist toggles below it. */
export function Speedometer() {
  const hud = useGame((s) => s.vehicleHud);
  const assists = useCareer((s) => s.assists);
  const toggle = useCareer((s) => s.toggleAssist);
  if (!hud) return null;
  const arc = (C * SWEEP) / 360;
  const filled = arc * Math.min(1, hud.speed / MAX);
  return (
    <>
      <div className="hud-speedo hud-panel" style={{ borderRadius: '50%' }} aria-label="Speed">
        <svg viewBox="0 0 150 150">
          {/* Track and fill start at the bottom-left (135°) and sweep clockwise. */}
          <circle
            cx="75"
            cy="75"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${C}`}
            transform="rotate(135 75 75)"
          />
          <circle
            cx="75"
            cy="75"
            r={R}
            fill="none"
            stroke="var(--hud-teal)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${C}`}
            transform="rotate(135 75 75)"
          />
        </svg>
        <div className="hud-speedo-center">
          <span className="hud-speed">{hud.speed}</span>
          <span className="hud-unit">{HUD_UNITS === 'mph' ? 'MPH' : 'KM/H'}</span>
          <span className="hud-gear">{hud.gear}</span>
        </div>
        <div className="hud-battery" title={`Battery ${hud.battery}%`}>
          <div className="hud-bar" style={{ marginTop: 0 }}>
            <div
              style={{
                width: `${hud.battery}%`,
                background: hud.battery <= 15 ? 'var(--hud-red)' : undefined,
              }}
            />
          </div>
        </div>
      </div>
      {hud.damage > 0 && <span className="hud-damage">DAMAGE {hud.damage}%</span>}
      <div className="hud-assists">
        {ASSISTS.map((a) => (
          <button
            key={a}
            className={`hud-assist${assists[a] ? ' on' : ''}`}
            onClick={() => toggle(a)}
            title={
              a === 'MAN'
                ? 'Manual gears (Shift / Ctrl) — switches the helpers off'
                : a === 'ABS'
                  ? 'Anti-lock brakes'
                  : a === 'TCS'
                    ? 'Traction control (off = power slides)'
                    : 'Stability control (off = wilder drifts)'
            }
          >
            {a}
          </button>
        ))}
      </div>
    </>
  );
}
