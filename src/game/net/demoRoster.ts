import type { DirectMessage, PlayerProfile } from './types';

/**
 * Simulated "demo" players, so the social features can be tried before real players exist.
 * Shared state only (the simulation lives in DemoPlayers.tsx).
 */
export const demoRoster = {
  profiles: [] as PlayerProfile[],
  ids: new Set<string>(),
  /** Set by the simulation: handles direct messages (social requests) sent to a demo player. */
  onDirect: null as null | ((m: DirectMessage) => void),
  /** Set by the simulation: lets demo players react to your chat. */
  onChat: null as null | ((text: string) => void),
};

export const isDemo = (id: string) => demoRoster.ids.has(id);
