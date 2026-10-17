import { KEYMAP } from '../config';

/**
 * Device-independent input state. Keyboard/mouse listeners and the on-screen touch controls
 * write here; gameplay reads it inside physics steps and frames. Plain mutable object, not React
 * state, so it never triggers re-renders.
 */
export type Action = keyof typeof KEYMAP;

interface InputState {
  /** Movement intent: x = right, y = forward, each −1..1. */
  move: { x: number; y: number };
  /** Held actions (from keys or touch buttons). */
  held: Set<Action>;
  /** Actions pressed recently (action → press time in ms), cleared by consumePress(). */
  pressed: Map<Action, number>;
  /** Look delta in radians accumulated since the last consumeLook(). */
  look: { x: number; y: number };
  /** Movement analog magnitude from touch (keyboard uses 1). */
  touchMove: { x: number; y: number; active: boolean };
  /** Set by the touch sprint toggle. */
  sprintToggle: boolean;
}

export const input: InputState = {
  move: { x: 0, y: 0 },
  held: new Set(),
  pressed: new Map(),
  look: { x: 0, y: 0 },
  touchMove: { x: 0, y: 0, active: false },
  sprintToggle: false,
};

const keyToAction = new Map<string, Action>();
for (const [action, codes] of Object.entries(KEYMAP) as [Action, readonly string[]][]) {
  for (const code of codes) keyToAction.set(code, action);
}

/** A press only counts for this long, so a stray key tap can't fire much later. */
const PRESS_WINDOW_MS = 250;

export function pressAction(action: Action): void {
  if (!input.held.has(action)) input.pressed.set(action, performance.now());
  input.held.add(action);
}

export function releaseAction(action: Action): void {
  input.held.delete(action);
}

export function addLook(dx: number, dy: number): void {
  input.look.x += dx;
  input.look.y += dy;
}

/** Returns and clears the accumulated look delta. */
export function consumeLook(): { x: number; y: number } {
  const out = { x: input.look.x, y: input.look.y };
  input.look.x = input.look.y = 0;
  return out;
}

/** True once per press, if the press happened within the last PRESS_WINDOW_MS. */
export function consumePress(action: Action): boolean {
  const at = input.pressed.get(action);
  input.pressed.delete(action);
  return at !== undefined && performance.now() - at <= PRESS_WINDOW_MS;
}

/** Current movement vector, merging keyboard and touch joystick. Magnitude ≤ 1. */
export function readMove(): { x: number; y: number; magnitude: number } {
  if (input.touchMove.active) {
    const { x, y } = input.touchMove;
    return { x, y, magnitude: Math.min(1, Math.hypot(x, y)) };
  }
  const h = input.held;
  const x = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
  const y = (h.has('forward') ? 1 : 0) - (h.has('back') ? 1 : 0);
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len, magnitude: 1 } : { x: 0, y: 0, magnitude: 0 };
}

/**
 * Attaches keyboard + mouse listeners. Mouse look works while the pointer is locked
 * (click the game to lock, Esc to release). Returns a cleanup function.
 */
export function attachDesktopInput(canvas: HTMLElement, sensitivity: number): () => void {
  // While typing in a text field (chat, name), keys belong to the field, not the game.
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const action = keyToAction.get(e.code);
    if (!action) return;
    // Keep Space/Alt/arrows from scrolling the page or opening browser menus.
    e.preventDefault();
    if (!e.repeat) pressAction(action);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const action = keyToAction.get(e.code);
    if (action) releaseAction(action);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === canvas)
      addLook(e.movementX * sensitivity, e.movementY * sensitivity);
  };
  const onClick = () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock?.();
  };
  const onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) pressAction('attack');
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) releaseAction('attack');
  };
  const onBlur = () => {
    input.held.clear();
    input.pressed.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousedown', onMouseDown);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('mousedown', onMouseDown);
  };
}
