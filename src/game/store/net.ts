import { create } from 'zustand';
import type { ChatMessage, PlayerProfile } from '../net/types';

export type NetStatus = 'idle' | 'connecting' | 'online' | 'offline';

interface NetState {
  status: NetStatus;
  statusDetail: string;
  profile: PlayerProfile | null;
  /** Everyone else in the room (from presence). */
  players: PlayerProfile[];
  chat: ChatMessage[];
  muted: Set<string>;
  blocked: Set<string>;
  reported: Set<string>;
  /** Chat input focused (game controls pause). */
  typing: boolean;
  /** Player list (Tab) open. */
  listOpen: boolean;
  voiceEnabled: boolean;
  setStatus: (status: NetStatus, detail?: string) => void;
  setProfile: (p: PlayerProfile) => void;
  setPlayers: (players: PlayerProfile[]) => void;
  addChat: (m: ChatMessage) => void;
  toggleMute: (id: string) => void;
  toggleBlock: (id: string) => void;
  report: (id: string) => void;
  setTyping: (typing: boolean) => void;
  setListOpen: (open: boolean) => void;
  setVoiceEnabled: (on: boolean) => void;
}

const toggled = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export const useNet = create<NetState>()((set) => ({
  status: 'idle',
  statusDetail: '',
  profile: null,
  players: [],
  chat: [],
  muted: new Set(),
  blocked: new Set(),
  reported: new Set(),
  typing: false,
  listOpen: false,
  voiceEnabled: false,
  setStatus: (status, statusDetail = '') => set({ status, statusDetail }),
  setProfile: (profile) => set({ profile }),
  setPlayers: (players) => set({ players }),
  addChat: (m) => set((s) => ({ chat: [...s.chat.slice(-59), m] })),
  toggleMute: (id) => set((s) => ({ muted: toggled(s.muted, id) })),
  toggleBlock: (id) => set((s) => ({ blocked: toggled(s.blocked, id) })),
  report: (id) => set((s) => ({ reported: new Set(s.reported).add(id) })),
  setTyping: (typing) => set({ typing }),
  setListOpen: (listOpen) => set({ listOpen }),
  setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
}));
