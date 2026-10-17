import './hud.css';
import './phone.css';
import { DriftScore } from './DriftScore';
import { AdCard } from './AdCard';
import { Gauges } from './Gauges';
import { HijackPrompt } from './HijackPrompt';
import { Minimap } from './Minimap';
import { Speedometer } from './Speedometer';
import { Toasts } from './Toasts';
import { TopBar } from './TopBar';
import { WantedStars } from './WantedStars';
import { WhatsNext } from './WhatsNext';
import { PhotoFlash, TrialHud } from './TrialHud';
import { useGoals } from '../../game/store/goals';

/** The driving HUD, laid out per CLAUDE.md §6.9. `touch` makes room for the touch controls. */
export function Hud({ touch }: { touch: boolean }) {
  const trialActive = useGoals((s) => !!s.active);
  return (
    <div className={`hud${touch ? ' hud-touch' : ''}`}>
      <div className="hud-zone hud-tl">
        <Toasts />
        <WantedStars />
        <DriftScore />
      </div>
      <div className="hud-zone hud-tc">{trialActive ? <TrialHud /> : <WhatsNext />}</div>
      <PhotoFlash />
      <div className="hud-zone hud-tr">
        <TopBar />
      </div>
      <div className="hud-zone hud-bl">
        <Minimap size={touch ? 112 : 150} />
      </div>
      <div className="hud-zone hud-bc">
        <AdCard />
        <HijackPrompt touch={touch} />
        <Gauges />
      </div>
      <div className="hud-zone hud-br">
        <Speedometer />
      </div>
    </div>
  );
}
