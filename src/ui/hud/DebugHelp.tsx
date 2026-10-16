import { useState } from 'react';
import { detectDevice } from '../../game/quality';

const isTouch = detectDevice().isTouch;

/** Controls reminder for the Phase 1 free-fly review camera. */
export function DebugHelp() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button className="help-toggle" onClick={() => setOpen(true)} aria-label="Show controls">
        ?
      </button>
    );
  }
  return (
    <div className="help-panel">
      <button className="help-close" onClick={() => setOpen(false)} aria-label="Hide controls">
        ×
      </button>
      <strong>Free camera</strong>
      {isTouch ? (
        <ul>
          <li>One finger: look around</li>
          <li>Two fingers: move (drag up = forward)</li>
        </ul>
      ) : (
        <ul>
          <li>Drag mouse: look · double-click: lock mouse</li>
          <li>W A S D: move · Shift: fast</li>
          <li>E / Space: up · Q / Ctrl: down</li>
        </ul>
      )}
    </div>
  );
}
