import { useEffect, useRef, useState } from 'react';
import { INPUT } from '../../game/config';
import { useGame } from '../../game/store/game';
import { addLook, input, pressAction, releaseAction } from '../../game/systems/input';

const JOYSTICK_RADIUS = 56;

interface Stick {
  id: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

/**
 * On-screen controls for phones: a floating joystick on the left half, drag-to-look on the right
 * half, and action buttons. Writes straight into the shared input state.
 */
export function TouchControls() {
  const [stick, setStick] = useState<Stick | null>(null);
  const [sprint, setSprint] = useState(false);
  const mode = useGame((s) => s.mode);
  const prompt = useGame((s) => s.prompt);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const stickRef = useRef<Stick | null>(null);

  useEffect(
    () => () => {
      input.touchMove.active = false;
      input.sprintToggle = false;
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic/cancelled pointers; tracking still works.
    }
    if (e.clientX < window.innerWidth * 0.45 && !stickRef.current) {
      const s = { id: e.pointerId, originX: e.clientX, originY: e.clientY, x: 0, y: 0 };
      stickRef.current = s;
      setStick(s);
      input.touchMove = { x: 0, y: 0, active: true };
    } else if (lookId.current === null) {
      lookId.current = e.pointerId;
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (s && e.pointerId === s.id) {
      let dx = e.clientX - s.originX;
      let dy = e.clientY - s.originY;
      const len = Math.hypot(dx, dy);
      if (len > JOYSTICK_RADIUS) {
        dx = (dx / len) * JOYSTICK_RADIUS;
        dy = (dy / len) * JOYSTICK_RADIUS;
      }
      const next = { ...s, x: dx, y: dy };
      stickRef.current = next;
      setStick(next);
      input.touchMove = { x: dx / JOYSTICK_RADIUS, y: -dy / JOYSTICK_RADIUS, active: true };
    } else if (e.pointerId === lookId.current) {
      addLook(
        (e.clientX - lookLast.current.x) * INPUT.touchSensitivity,
        (e.clientY - lookLast.current.y) * INPUT.touchSensitivity,
      );
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickRef.current && e.pointerId === stickRef.current.id) {
      stickRef.current = null;
      setStick(null);
      input.touchMove = { x: 0, y: 0, active: false };
    }
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  const hold = (action: 'jump' | 'interact') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      pressAction(action);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      releaseAction(action);
    },
    onPointerCancel: () => releaseAction(action),
  });

  return (
    <div
      className="touch-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {stick && (
        <div className="joystick" style={{ left: stick.originX, top: stick.originY }}>
          <div
            className="joystick-knob"
            style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}
          />
        </div>
      )}
      <div className="touch-buttons">
        {mode === 'driving' ? (
          <>
            <button className="touch-btn" {...hold('interact')}>
              Exit
            </button>
            <button className="touch-btn primary" {...hold('jump')}>
              Brake
            </button>
          </>
        ) : (
          <>
            {prompt === 'drive' && (
              <button className="touch-btn accent" {...hold('interact')}>
                Drive
              </button>
            )}
            {prompt?.startsWith('place:') && (
              <button className="touch-btn accent" {...hold('interact')}>
                Enter
              </button>
            )}
            <button
              className={`touch-btn${sprint ? ' active' : ''}`}
              aria-pressed={sprint}
              onPointerDown={(e) => {
                e.stopPropagation();
                input.sprintToggle = !input.sprintToggle;
                setSprint(input.sprintToggle);
              }}
            >
              Sprint
            </button>
            <button className="touch-btn primary" {...hold('jump')}>
              Jump
            </button>
          </>
        )}
      </div>
    </div>
  );
}
