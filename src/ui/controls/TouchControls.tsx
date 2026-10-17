import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/store/game';
import { input, pressAction, releaseAction, type Action } from '../../game/systems/input';
import '../hud/hud.css';

type Pad = 'left' | 'right' | 'gas' | 'brake';

/**
 * Phone controls: hold-to-steer buttons on the left; gas, brake and the drift handbrake on the
 * right. Steering and pedals feed the shared touch move vector (x = steer, y = throttle).
 */
export function TouchControls() {
  const held = useRef(new Set<Pad>());
  const [, force] = useState(0);

  const sync = () => {
    const h = held.current;
    const x = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    const y = (h.has('gas') ? 1 : 0) - (h.has('brake') ? 1 : 0);
    input.touchMove = { x, y, active: h.size > 0 };
    force((n) => n + 1);
  };

  useEffect(
    () => () => {
      input.touchMove = { x: 0, y: 0, active: false };
      for (const a of ['jump', 'attack', 'sprint', 'flyDown'] as const) releaseAction(a);
    },
    [],
  );

  const pad = (p: Pad) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail for synthetic pointers; the button still works.
      }
      held.current.add(p);
      sync();
    },
    onPointerUp: () => {
      held.current.delete(p);
      sync();
    },
    onPointerCancel: () => {
      held.current.delete(p);
      sync();
    },
    // Steer buttons get their own names (.tc-left/.tc-right are the button groups).
    className: `tc-btn tc-${p === 'left' || p === 'right' ? `steer-${p}` : p}${held.current.has(p) ? ' down' : ''}`,
  });

  // Hold buttons for actions (drift handbrake, launch, climb/descend in the air).
  const [down, setDown] = useState<Action | null>(null);
  const action = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      pressAction(a);
      setDown(a);
    },
    onPointerUp: () => {
      releaseAction(a);
      setDown(null);
    },
    onPointerCancel: () => {
      releaseAction(a);
      setDown(null);
    },
  });
  const flying = useGame((s) => s.vehicleHud?.altitude !== undefined);

  return (
    <div className="tc-layer">
      <div className="tc-left">
        <button {...pad('left')} aria-label="Steer left">
          ◀
        </button>
        <button {...pad('right')} aria-label="Steer right">
          ▶
        </button>
      </div>
      <div className="tc-right">
        <div className="tc-stack">
          {flying ? (
            <>
              <button
                className={`tc-btn tc-up${down === 'sprint' ? ' down' : ''}`}
                {...action('sprint')}
              >
                UP
              </button>
              <button
                className={`tc-btn tc-dn${down === 'flyDown' ? ' down' : ''}`}
                {...action('flyDown')}
              >
                DOWN
              </button>
            </>
          ) : (
            <>
              <button
                className={`tc-btn tc-launch${down === 'attack' ? ' down' : ''}`}
                {...action('attack')}
              >
                LAUNCH
              </button>
              <button
                className={`tc-btn tc-drift${down === 'jump' ? ' down' : ''}`}
                {...action('jump')}
              >
                DRIFT
              </button>
              <button {...pad('brake')} aria-label="Brake / reverse">
                BRAKE
              </button>
            </>
          )}
        </div>
        <button {...pad('gas')} aria-label="Gas">
          GAS
        </button>
      </div>
    </div>
  );
}
