import { useEffect, useRef, useState } from 'react';
import { input, pressAction, releaseAction } from '../../game/systems/input';
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
      releaseAction('jump');
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

  const [drift, setDrift] = useState(false);
  const driftProps = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      pressAction('jump');
      setDrift(true);
    },
    onPointerUp: () => {
      releaseAction('jump');
      setDrift(false);
    },
    onPointerCancel: () => {
      releaseAction('jump');
      setDrift(false);
    },
  };

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
          <button className={`tc-btn tc-drift${drift ? ' down' : ''}`} {...driftProps}>
            DRIFT
          </button>
          <button {...pad('brake')} aria-label="Brake / reverse">
            BRAKE
          </button>
        </div>
        <button {...pad('gas')} aria-label="Gas">
          GAS
        </button>
      </div>
    </div>
  );
}
