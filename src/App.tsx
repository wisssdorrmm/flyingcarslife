import { lazy, Suspense, useEffect } from 'react';
import { startAutosave } from './lib/save';
import { runTestScene, TEST_SCENE_NAMES, type TestScene } from './game/debug/testScenes';
import { QUALITY_TIERS } from './game/quality';
import { useSettings } from './game/store/settings';
import { detectDevice } from './game/quality';
import { TouchControls } from './ui/controls/TouchControls';
import { Hud } from './ui/hud/Hud';
import { MissionUi } from './ui/missions/MissionUi';
import { MapScreen } from './ui/map/MapScreen';
import { Garage, GarageUnlocks } from './ui/menus/Garage';
import { PauseMenu } from './ui/menus/PauseMenu';
import { RaceMenu } from './ui/menus/RaceMenu';
import { Diag } from './ui/menus/Diag';
import { LoadError } from './ui/menus/LoadError';
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
      <LoadError>
        <Suspense fallback={null}>
          <Game />
        </Suspense>
      </LoadError>
      {!freecam && <Hud touch={showTouch} />}
      {!freecam && <MissionUi />}
      <MapScreen />
      <PauseMenu />
      <RaceMenu />
      <Garage />
      <GarageUnlocks />
      <LoadingScreen />
      <Diag />
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
      <span>Teleport</span>
      {(Object.keys(TEST_SCENE_NAMES) as TestScene[]).map((s) => (
        <button key={s} onClick={() => void runTestScene(s)}>
          {TEST_SCENE_NAMES[s]}
        </button>
      ))}
    </div>
  );
}
