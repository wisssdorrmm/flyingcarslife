import './hud.css';
import { DriftScore } from './DriftScore';
import { Gauges } from './Gauges';
import { Minimap } from './Minimap';
import { Speedometer } from './Speedometer';
import { Toasts } from './Toasts';
import { TopBar } from './TopBar';
import { WantedStars } from './WantedStars';
import { WhatsNext } from './WhatsNext';

/** The driving HUD, laid out per CLAUDE.md §6.9. `touch` makes room for the touch controls. */
export function Hud({ touch }: { touch: boolean }) {
  return (
    <div className={`hud${touch ? ' hud-touch' : ''}`}>
      <div className="hud-zone hud-tl">
        <Toasts />
        <WantedStars />
        <DriftScore />
      </div>
      <div className="hud-zone hud-tc">
        <WhatsNext />
      </div>
      <div className="hud-zone hud-tr">
        <TopBar />
      </div>
      <div className="hud-zone hud-bl">
        <Minimap size={touch ? 112 : 150} />
      </div>
      <div className="hud-zone hud-bc">
        <Gauges />
      </div>
      <div className="hud-zone hud-br">
        <Speedometer />
      </div>
    </div>
  );
}
