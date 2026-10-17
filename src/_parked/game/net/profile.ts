import type { PlayerProfile } from './types';

const KEY = 'fcl.profile';

/** Titles players can wear under their name. More get unlocked by playing (later phases). */
export const TITLES = [
  'Newcomer',
  'Explorer',
  'Foodie',
  'Gym Rat',
  'Night Owl',
  'Street Racer',
  'Student',
  'Entrepreneur',
  'Future Pilot',
  'Harbor Local',
] as const;

export const NAME_COLORS = [
  '#7cc4ff',
  '#ff8a65',
  '#9be37a',
  '#f7d154',
  '#d58cff',
  '#5ee0d0',
  '#ff6fa8',
];

export function loadProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PlayerProfile;
    return p.id && p.name ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: PlayerProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the profile lasts for this session only.
  }
}

export function newProfileId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
