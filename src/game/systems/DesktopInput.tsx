import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { INPUT } from '../config';
import { attachDesktopInput } from './input';

/** Wires keyboard + mouse into the shared input state for as long as it's mounted. */
export function DesktopInput() {
  const gl = useThree((s) => s.gl);
  useEffect(() => attachDesktopInput(gl.domElement, INPUT.mouseSensitivity), [gl]);
  return null;
}
