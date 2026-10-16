import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DEBUG_CAMERA } from '../config';

/**
 * Free-fly camera for reviewing the world.
 * Desktop: drag (or click for pointer lock) to look, WASD move, Space/E up, Ctrl/Q down, Shift fast.
 * Touch: one finger looks, two fingers move (drag up = forward).
 */
export function DebugCamera() {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const touchMove = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // `?cam=x,y,z,lookX,lookY,lookZ` overrides the start view (handy for sharing review shots).
    const cam = new URLSearchParams(window.location.search).get('cam')?.split(',').map(Number);
    if (cam && cam.length === 6 && cam.every(Number.isFinite)) {
      camera.position.set(cam[0]!, cam[1]!, cam[2]!);
      camera.lookAt(cam[3]!, cam[4]!, cam[5]!);
    } else {
      camera.position.set(...DEBUG_CAMERA.start);
      camera.lookAt(...DEBUG_CAMERA.lookAt);
    }
    euler.current.setFromQuaternion(camera.quaternion);

    const el = gl.domElement;
    const look = (dx: number, dy: number) => {
      const e = euler.current;
      e.y -= dx * DEBUG_CAMERA.lookSpeed;
      e.x = THREE.MathUtils.clamp(e.x - dy * DEBUG_CAMERA.lookSpeed, -1.5, 1.5);
      camera.quaternion.setFromEuler(e);
    };

    let dragging = false;
    const onMouseDown = (ev: MouseEvent) => {
      if (ev.button === 0) dragging = true;
    };
    const onMouseUp = () => (dragging = false);
    const onMouseMove = (ev: MouseEvent) => {
      if (dragging || document.pointerLockElement === el) look(ev.movementX, ev.movementY);
    };
    const onDblClick = () => void el.requestPointerLock?.();
    const onKeyDown = (ev: KeyboardEvent) => keys.current.add(ev.code);
    const onKeyUp = (ev: KeyboardEvent) => keys.current.delete(ev.code);
    const onBlur = () => keys.current.clear();

    let last: Touch[] = [];
    const onTouchStart = (ev: TouchEvent) => {
      last = Array.from(ev.touches);
    };
    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const now = Array.from(ev.touches);
      const a = now[0];
      const b = last[0];
      if (now.length === 1 && a && b) {
        look((a.clientX - b.clientX) * 2, (a.clientY - b.clientY) * 2);
      } else if (now.length >= 2 && a && b) {
        touchMove.current.x += (a.clientX - b.clientX) * 0.05;
        touchMove.current.y += (a.clientY - b.clientY) * 0.05;
      }
      last = now;
    };
    const onTouchEnd = (ev: TouchEvent) => {
      last = Array.from(ev.touches);
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [camera, gl]);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  useFrame((_, dt) => {
    const k = keys.current;
    const speed =
      (k.has('ShiftLeft') || k.has('ShiftRight') ? DEBUG_CAMERA.fastSpeed : DEBUG_CAMERA.speed) *
      dt;
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + touchMove.current.y * -0.2;
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + touchMove.current.x * 0.2;
    const u =
      (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('ControlLeft') || k.has('KeyQ') ? 1 : 0);
    camera.position.addScaledVector(forward, f * speed);
    camera.position.addScaledVector(right, r * speed);
    camera.position.y = Math.max(0.3, camera.position.y + u * speed);
    touchMove.current.x *= 0.8;
    touchMove.current.y *= 0.8;
  });

  return null;
}
