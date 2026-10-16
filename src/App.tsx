import { lazy, Suspense } from 'react';
import { QUALITY_TIERS } from './game/quality';
import { useSettings } from './game/store/settings';
import { DebugHelp } from './ui/hud/DebugHelp';
import { LoadingScreen } from './ui/menus/LoadingScreen';

// The 3D engine is split out so the shell paints instantly while three/rapier download.
const Game = lazy(() => import('./game/Game'));

export default function App() {
  const debug = useSettings((s) => s.debug);

  return (
    <div className="app">
      <Suspense fallback={null}>
        <Game />
      </Suspense>
      <LoadingScreen />
      <DebugHelp />
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
