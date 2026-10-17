import { useCareer } from '../../game/store/career';
import { useUi } from '../../game/store/ui';

/** Race / Party (coming later) / Menu, and the player's cash. */
export function TopBar() {
  const cash = useCareer((s) => s.cash);
  const openMenu = useUi((s) => s.setMenuOpen);
  return (
    <>
      <div className="hud-topbar">
        <button className="hud-btn" disabled title="Coming soon">
          Race
        </button>
        <button className="hud-btn" disabled title="Coming soon">
          Party
        </button>
        <button className="hud-btn" onClick={() => openMenu(true)}>
          Menu
        </button>
      </div>
      <div className="hud-cash hud-panel" aria-label="Cash">
        <span>$</span>
        {cash.toLocaleString()}
      </div>
    </>
  );
}
