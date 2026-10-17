import { useState } from 'react';
import { detectDevice } from '../../game/quality';
import { useGame } from '../../game/store/game';

const isTouch = detectDevice().isTouch;

/** Controls reminder; content depends on device and whether the free review camera is active. */
export function ControlsHelp({ freecam }: { freecam: boolean }) {
  const [open, setOpen] = useState(true);
  const mode = useGame((s) => s.mode);
  if (!open) {
    return (
      <button className="help-toggle top" onClick={() => setOpen(true)} aria-label="Show controls">
        ?
      </button>
    );
  }

  let title = 'Controls';
  let lines: string[];
  if (freecam) {
    title = 'Free camera';
    lines = isTouch
      ? ['One finger: look around', 'Two fingers: move (drag up = forward)']
      : [
          'Drag mouse: look · double-click: lock mouse',
          'W A S D: move · Shift: fast',
          'E / Space: up · Q / Ctrl: down',
        ];
  } else if (mode === 'driving') {
    title = 'Driving';
    lines = isTouch
      ? [
          'Left thumb: steer + throttle (pull back to brake/reverse)',
          'Right side: look around',
          'Brake: handbrake · Exit: get out',
        ]
      : [
          'W: accelerate · S: brake / reverse',
          'A D: steer · Space: handbrake',
          'Mouse: look around · E: get out',
        ];
  } else {
    lines = isTouch
      ? [
          'Left thumb: move (push far to run)',
          'Right side: drag to look',
          'Sprint: toggle · Jump: hold',
        ]
      : [
          'Click the game to look with the mouse · Esc to release',
          'W A S D: move · Shift: sprint · Alt: walk',
          'Space: jump · E: enter · M: map',
          'T: chat · Tab: players',
        ];
  }

  return (
    <div className="help-panel top">
      <button className="help-close" onClick={() => setOpen(false)} aria-label="Hide controls">
        ×
      </button>
      <strong>{title}</strong>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
