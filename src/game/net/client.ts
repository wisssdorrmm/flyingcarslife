import { NET } from '../config';
import { supabase } from '../../lib/supabase';
import { useNet } from '../store/net';
import { LocalTransport } from './localTransport';
import { cleanText } from './moderation';
import { SupabaseTransport } from './supabaseTransport';
import type { ChatMessage, PlayerProfile, PlayerSnapshot, Transport, VoiceSignal } from './types';

/** Recent snapshots per remote player, newest last (outside React: updated ~10×/s each). */
export const remoteSnapshots = new Map<string, PlayerSnapshot[]>();
/** Latest chat line per player, for speech bubbles. */
export const chatBubbles = new Map<string, { text: string; at: number }>();
/** Voice signaling subscribers (the voice module registers here). */
export const signalListeners = new Set<(s: VoiceSignal) => void>();

let transport: Transport | null = null;
let lastChatAt = 0;
/** Offset between each sender's clock and ours, estimated from arrivals. */
const clockOffset = new Map<string, number>();

/**
 * Each tab is its own session, so two tabs with the same saved profile are two players (handy for
 * testing, and the same account on two devices doesn't collide).
 */
function sessionId(profileId: string): string {
  try {
    let tab = sessionStorage.getItem('fcl.tab');
    if (!tab) {
      tab = Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('fcl.tab', tab);
    }
    return `${profileId}:${tab}`;
  } catch {
    return `${profileId}:${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Connects to a room: Supabase Realtime when configured, otherwise other tabs on this computer. */
export async function startNet(saved: PlayerProfile): Promise<void> {
  if (transport) return;
  const profile = { ...saved, id: sessionId(saved.id) };
  const net = useNet.getState();
  net.setProfile(profile);
  let room = 'local-1';
  if (supabase) {
    const t = new SupabaseTransport(supabase);
    transport = t;
    try {
      room = await t.chooseRoom(profile);
    } catch (err) {
      net.setStatus('offline', `Couldn't reach the server (${String(err)})`);
      transport = null;
      return;
    }
  } else {
    transport = new LocalTransport();
  }
  await transport.connect(room, profile, {
    onStatus: (status, detail) => useNet.getState().setStatus(status, detail),
    onPresence: (players) => {
      const others = players.filter((p) => p.id !== profile.id);
      useNet.getState().setPlayers(others);
      for (const id of [...remoteSnapshots.keys()]) {
        if (!others.some((p) => p.id === id)) remoteSnapshots.delete(id);
      }
    },
    onState: (s) => {
      if (s.id === profile.id) return;
      // Map the sender's timestamp onto our clock (smallest observed offset ≈ least latency).
      const offset = performance.now() - s.t;
      const prev = clockOffset.get(s.id);
      clockOffset.set(s.id, prev === undefined ? offset : Math.min(prev, offset));
      const local = { ...s, t: s.t + clockOffset.get(s.id)! };
      const list = remoteSnapshots.get(s.id) ?? [];
      list.push(local);
      if (list.length > 20) list.shift();
      remoteSnapshots.set(s.id, list);
    },
    onChat: (m) => {
      if (useNet.getState().blocked.has(m.from)) return;
      const clean = { ...m, text: cleanText(m.text).slice(0, NET.chat.maxLength) };
      useNet.getState().addChat(clean);
      chatBubbles.set(m.from, { text: clean.text, at: performance.now() });
    },
    onSignal: (s) => signalListeners.forEach((fn) => fn(s)),
  });
}

export async function stopNet(): Promise<void> {
  await transport?.disconnect();
  transport = null;
  remoteSnapshots.clear();
  useNet.getState().setStatus('idle');
}

export function sendState(s: Omit<PlayerSnapshot, 't'>): void {
  transport?.sendState({ ...s, t: performance.now() });
}

/** Sends a chat line. Returns an error string if it was rate-limited or empty. */
export function sendChat(text: string): string | null {
  const profile = useNet.getState().profile;
  const trimmed = text.trim().slice(0, NET.chat.maxLength);
  if (!transport || !profile) return 'Not connected';
  if (!trimmed) return 'Empty message';
  if (performance.now() - lastChatAt < NET.chat.minIntervalMs) return 'Slow down a little';
  lastChatAt = performance.now();
  const m: ChatMessage = {
    id: `${profile.id}-${Date.now()}`,
    from: profile.id,
    name: profile.name,
    text: cleanText(trimmed),
    t: Date.now(),
  };
  transport.sendChat(m);
  useNet.getState().addChat(m);
  chatBubbles.set(profile.id, { text: m.text, at: performance.now() });
  return null;
}

export function sendSignal(s: VoiceSignal): void {
  transport?.sendSignal(s);
}
