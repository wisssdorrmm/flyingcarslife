import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { NET } from '../config';
import type { PlayerProfile, Transport, TransportHandlers } from './types';

/**
 * Online multiplayer over Supabase Realtime. Each room is one channel: presence tracks who's in
 * it, broadcast carries movement, chat and voice signaling. A separate 'lobby' channel's presence
 * records which room everyone is in, so newcomers can pick a room that isn't full.
 */
export class SupabaseTransport implements Transport {
  readonly label = 'Online';
  private room: RealtimeChannel | null = null;
  private lobby: RealtimeChannel | null = null;

  constructor(private client: SupabaseClient) {}

  /** Lowest-numbered room with space, based on lobby presence. */
  async chooseRoom(me: PlayerProfile): Promise<string> {
    const lobby = this.client.channel('lobby', { config: { presence: { key: me.id } } });
    this.lobby = lobby;
    await new Promise<void>((resolve, reject) => {
      lobby
        .on('presence', { event: 'sync' }, () => resolve())
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
        });
    });
    const counts = new Map<string, number>();
    for (const metas of Object.values(lobby.presenceState<{ room?: string }>())) {
      const room = metas[0]?.room;
      if (room) counts.set(room, (counts.get(room) ?? 0) + 1);
    }
    let n = 1;
    while ((counts.get(`city-${n}`) ?? 0) >= NET.roomCapacity) n++;
    return `city-${n}`;
  }

  async connect(roomName: string, me: PlayerProfile, h: TransportHandlers): Promise<void> {
    h.onStatus('connecting');
    const room = this.client.channel(`room:${roomName}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: me.id } },
    });
    this.room = room;
    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState<PlayerProfile>();
        h.onPresence(
          Object.values(state)
            .map((metas) => metas[0]!)
            .filter(Boolean),
        );
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => h.onState(payload))
      .on('broadcast', { event: 'chat' }, ({ payload }) => h.onChat(payload))
      .on('broadcast', { event: 'direct' }, ({ payload }) => {
        if (payload.to === me.id) h.onDirect(payload);
      });
    await new Promise<void>((resolve, reject) => {
      room.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track(me);
          await this.lobby?.track({ room: roomName });
          h.onStatus('online', `${this.label} · ${roomName}`);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          h.onStatus('offline', status);
          reject(new Error(status));
        }
      });
    });
  }

  sendState(payload: Parameters<Transport['sendState']>[0]): void {
    void this.room?.send({ type: 'broadcast', event: 'state', payload });
  }
  sendChat(payload: Parameters<Transport['sendChat']>[0]): void {
    void this.room?.send({ type: 'broadcast', event: 'chat', payload });
  }
  sendDirect(payload: Parameters<Transport['sendDirect']>[0]): void {
    void this.room?.send({ type: 'broadcast', event: 'direct', payload });
  }

  async disconnect(): Promise<void> {
    if (this.room) await this.client.removeChannel(this.room);
    if (this.lobby) await this.client.removeChannel(this.lobby);
    this.room = this.lobby = null;
  }
}
