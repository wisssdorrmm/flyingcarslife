import { create } from 'zustand';
import type { EmoteName } from '../net/types';

export type SocialAction = 'highfive' | 'hug' | 'dance' | 'friend';

export interface SocialRequest {
  from: string;
  name: string;
  action: SocialAction;
  at: number;
}

export interface Friend {
  /** Stable profile id (without the per-tab session suffix). */
  id: string;
  name: string;
}

export const SOCIAL_LABEL: Record<SocialAction, string> = {
  highfive: 'high five',
  hug: 'hug',
  dance: 'dance together',
  friend: 'be friends',
};

/** Which emote both players perform when a request is accepted. */
export const SOCIAL_EMOTE: Partial<Record<SocialAction, EmoteName>> = {
  highfive: 'highfive',
  hug: 'hug',
  dance: 'dance',
};

const FRIENDS_KEY = 'fcl.friends';

function loadFriends(): Friend[] {
  try {
    return JSON.parse(localStorage.getItem(FRIENDS_KEY) ?? '[]') as Friend[];
  } catch {
    return [];
  }
}

/** Profile id from a session id ("profile:tab"). */
export const profileIdOf = (sessionId: string) => sessionId.split(':')[0] ?? sessionId;

interface SocialState {
  /** Nearest other player within interaction range (session id). */
  target: string | null;
  panelOpen: boolean;
  incoming: SocialRequest[];
  friends: Friend[];
  setTarget: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  addIncoming: (r: SocialRequest) => void;
  removeIncoming: (from: string, action: SocialAction) => void;
  addFriend: (f: Friend) => void;
  removeFriend: (id: string) => void;
  isFriend: (sessionId: string) => boolean;
}

export const useSocial = create<SocialState>()((set, get) => ({
  target: null,
  panelOpen: false,
  incoming: [],
  friends: loadFriends(),
  setTarget: (target) => set((s) => (s.target === target ? s : { target })),
  setPanelOpen: (panelOpen) => {
    if (panelOpen && document.pointerLockElement) document.exitPointerLock();
    set({ panelOpen });
  },
  addIncoming: (r) =>
    set((s) => ({
      incoming: [
        ...s.incoming.filter((x) => !(x.from === r.from && x.action === r.action)),
        r,
      ].slice(-4),
    })),
  removeIncoming: (from, action) =>
    set((s) => ({ incoming: s.incoming.filter((x) => !(x.from === from && x.action === action)) })),
  addFriend: (f) => {
    const friends = [...get().friends.filter((x) => x.id !== f.id), f];
    try {
      localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
    } catch {
      // Non-fatal: the friendship lasts for this session.
    }
    set({ friends });
  },
  removeFriend: (id) => {
    const friends = get().friends.filter((x) => x.id !== id);
    try {
      localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
    } catch {
      // Non-fatal.
    }
    set({ friends });
  },
  isFriend: (sessionId) => get().friends.some((f) => f.id === profileIdOf(sessionId)),
}));
