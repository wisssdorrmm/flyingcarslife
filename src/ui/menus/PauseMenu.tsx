import { useEffect } from 'react';
import { useCity } from '../../game/city/cityData';
import { LANDMARKS } from '../../game/city/geo';
import { QUALITY_TIERS } from '../../game/quality';
import { useCareer } from '../../game/store/career';
import { useNav } from '../../game/store/nav';
import { useSettings } from '../../game/store/settings';
import { useUi } from '../../game/store/ui';
import { pressAction, releaseAction } from '../../game/systems/input';

const CONTROLS: [string, string][] = [
  ['W / S or ↑ / ↓', 'Throttle / brake, reverse'],
  ['A / D or ← / →', 'Steer'],
  ['Space', 'Handbrake (drift)'],
  ['R', 'Reset car onto the road'],
  ['M', 'Map'],
  ['Shift / Ctrl', 'Gear up / down (MAN on)'],
  ['Esc', 'Menu'],
];

/** Pause menu (Esc or the Menu button). Gameplay pauses while it's open. */
export function PauseMenu() {
  const open = useUi((s) => s.menuOpen);
  const setOpen = useUi((s) => s.setMenuOpen);
  const tier = useSettings((s) => s.quality.tier);
  const setTier = useSettings((s) => s.setQualityTier);
  const auto = useSettings((s) => s.resetQualityToAuto);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || useNav.getState().mapOpen) return;
      setOpen(!useUi.getState().menuOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (!open) return null;
  const resetCar = () => {
    setOpen(false);
    // The car handles R on its next physics step.
    pressAction('reload');
    window.setTimeout(() => releaseAction('reload'), 100);
  };

  return (
    <div className="menu-backdrop" role="dialog" aria-label="Menu">
      <div className="menu-card">
        <h2>Flying Cars Life</h2>
        <p className="menu-sub">San Francisco · North Beach & Fisherman&apos;s Wharf</p>
        <div className="menu-actions">
          <button className="menu-primary" onClick={() => setOpen(false)}>
            Resume
          </button>
          <button onClick={resetCar}>Reset car</button>
          <button
            onClick={() => {
              setOpen(false);
              useUi.getState().setGarageOpen(true);
            }}
          >
            Garage
          </button>
        </div>
        <Progress />

        <h3>Graphics</h3>
        <div className="menu-row">
          {QUALITY_TIERS.map((t) => (
            <button key={t} className={t === tier ? 'on' : ''} onClick={() => setTier(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button onClick={auto}>Auto</button>
        </div>

        <h3>Controls</h3>
        <dl className="menu-keys">
          {CONTROLS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <p className="menu-credits">
          Map data © OpenStreetMap contributors (ODbL) · Terrain: Mapzen / AWS Terrain Tiles ·
          Textures: Poly Haven (CC0) · Car: Khronos glTF samples (CC-BY 4.0)
        </p>
      </div>
    </div>
  );
}

/** Exploration progress: roads discovered, photos, trials. */
function Progress() {
  const streets = useCareer((s) => s.discovered.length);
  const photos = useCareer((s) => s.photos.length);
  const trials = useCareer((s) => Object.keys(s.trials).length);
  const total = useCity((s) => s.city?.index.streets.length ?? 0);
  return (
    <>
      <h3>Progress</h3>
      <dl className="menu-keys">
        <div>
          <dt>Roads discovered</dt>
          <dd>
            {streets}/{total} ({total ? Math.round((streets / total) * 100) : 0}%)
          </dd>
        </div>
        <div>
          <dt>Photo spots</dt>
          <dd>
            {photos}/{LANDMARKS.length}
          </dd>
        </div>
        <div>
          <dt>Time trials finished</dt>
          <dd>{trials}/3</dd>
        </div>
      </dl>
    </>
  );
}
