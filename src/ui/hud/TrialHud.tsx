import { useEffect, useState } from 'react';
import { useGoals } from '../../game/store/goals';

/** Time trial timer (top-center while racing) and the camera flash for photo spots. */
export function TrialHud() {
  const active = useGoals((s) => s.active);
  const trial = useGoals((s) => s.trials.find((t) => t.id === s.active?.id));
  if (!active || !trial) return null;
  return (
    <div className="hud-next hud-panel" style={{ cursor: 'default' }}>
      <span style={{ minWidth: 0 }}>
        <span className="hud-next-kicker">TIME TRIAL</span>
        <span className="hud-next-title" style={{ display: 'block' }}>
          {trial.name}
        </span>
      </span>
      <span className="hud-trial-time">
        {active.countdown > 0 ? Math.ceil(active.countdown) : active.time.toFixed(1)}
      </span>
      <span className="hud-next-dist">
        {active.next}/{trial.checkpoints.length}
      </span>
    </div>
  );
}

export function PhotoFlash() {
  const at = useGoals((s) => s.photoAt);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!at) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 180);
    return () => window.clearTimeout(t);
  }, [at]);
  return on ? <div className="hud-flash" /> : null;
}
