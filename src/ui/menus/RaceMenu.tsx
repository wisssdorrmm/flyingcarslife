import { useCareer } from '../../game/store/career';
import { useGoals } from '../../game/store/goals';
import { useNav } from '../../game/store/nav';
import { useUi } from '../../game/store/ui';
import { formatDistance } from '../map/format';

/** Time trials list (Race button): best times, medal targets, and GPS to the start. */
export function RaceMenu() {
  const open = useUi((s) => s.raceOpen);
  const setOpen = useUi((s) => s.setRaceOpen);
  const trials = useGoals((s) => s.trials);
  const best = useCareer((s) => s.trials);
  const setWaypoint = useNav((s) => s.setWaypoint);
  if (!open) return null;
  return (
    <div className="menu-backdrop" role="dialog" aria-label="Time trials">
      <div className="menu-card">
        <h2>Time trials</h2>
        <p className="menu-sub">Stop at a teal beacon to start. Beat the medal times for cash.</p>
        {trials.map((t) => (
          <div key={t.id} className="menu-trial">
            <div>
              <strong>{t.name}</strong>
              <span>
                {formatDistance(t.length)} · gold {t.medals.gold.toFixed(0)} s · silver{' '}
                {t.medals.silver.toFixed(0)} s
              </span>
              <span>Best: {best[t.id] ? `${best[t.id]!.toFixed(1)} s` : '—'}</span>
            </div>
            <button
              onClick={() => {
                setWaypoint({ x: t.start.x, z: t.start.z, label: t.name });
                setOpen(false);
              }}
            >
              Go
            </button>
          </div>
        ))}
        <div className="menu-actions" style={{ marginTop: 14 }}>
          <button className="menu-primary" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
