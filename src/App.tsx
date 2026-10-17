import { lazy, Suspense, useEffect } from 'react';
import { startAutosave } from './lib/save';
import { QUALITY_TIERS } from './game/quality';
import { useSettings } from './game/store/settings';
import { detectDevice } from './game/quality';
import { TouchControls } from './ui/controls/TouchControls';
import { Hud } from './ui/hud/Hud';
import { MapScreen } from './ui/map/MapScreen';
import { PauseMenu } from './ui/menus/PauseMenu';
import { LoadingScreen } from './ui/menus/LoadingScreen';

// The 3D engine is split out so the shell paints instantly while three/rapier download.
const Game = lazy(() => import('./game/Game'));

const params = new URLSearchParams(window.location.search);
/** Touch UI on touch devices, or anywhere with `?touch` (for testing). */
const showTouch = detectDevice().isTouch || params.has('touch');

export default function App() {
  const debug = useSettings((s) => s.debug);
  const freecam = debug && params.has('freecam');
  useEffect(() => startAutosave(), []);

  return (
    <div className="app">
      <Suspense fallback={null}>
        <Game />
      </Suspense>
      {!freecam && <Hud touch={showTouch} />}
      <MapScreen />
      <PauseMenu />
      <LoadingScreen />
      {showTouch && !freecam && <TouchControls />}
      {debug && <DebugPanel />}
    </div>
  );
}

function DebugPanel() {
  const tier = useSettings((s) => s.quality.tier);
  const setQualityTier = useSettings((s) => s.setQualityTier);
  const resetQualityToAuto = useSettings((s) => s.resetQualityToAuto);

  return (
    <div className="debug-panel">
      <span>Quality</span>
      {QUALITY_TIERS.map((t) => (
        <button key={t} className={t === tier ? 'active' : ''} onClick={() => setQualityTier(t)}>
          {t}
        </button>
      ))}
      <button onClick={resetQualityToAuto}>auto</button>
    </div>
  );
}
