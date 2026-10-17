/**
 * The seam between missions and the police system. The police system registers itself here;
 * missions only talk to this interface, so either side can change without breaking the other.
 */
import type * as THREE from 'three';

export interface PoliceUnit {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

export interface PoliceApi {
  /** Current wanted level (0–5). */
  stars(): number;
  /** Raise the wanted level to at least `stars` and start a pursuit. */
  raise(stars: number, reason: string): void;
  /** Drop the wanted level to 0 (mission over / retry). */
  clear(): void;
  /** Police cars currently in the world. */
  units(): readonly PoliceUnit[];
  /** Called when the player is busted. */
  onBusted: Set<() => void>;
}

export const policeLink: { api: PoliceApi | null } = { api: null };
