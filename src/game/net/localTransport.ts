import type { PlayerProfile, Transport, TransportHandlers } from './types';

type Packet =
  | { type: 'hello'; profile: PlayerProfile }
  | { type: 'bye'; id: string }
  | { type: 'state'; payload: Parameters<Transport['sendState']>[0] }
  | { type: 'chat'; payload: Parameters<Transport['sendChat']>[0] }
  | { type: 'direct'; payload: Parameters<Transport['sendDirect']>[0] };

/**
 * Multiplayer between browser tabs on the same computer (BroadcastChannel). Used for testing
 * when Supabase isn't configured: open the game in two tabs and you'll see each other.
 */
export class LocalTransport implements Transport {
  readonly label = 'Local test (other tabs on this computer)';
  private channel: BroadcastChannel | null = null;
  private heartbeat = 0;
  private sweep = 0;
  private seen = new Map<string, { profile: PlayerProfile; at: number }>();
  private me: PlayerProfile | null = null;

  async connect(room: string, me: PlayerProfile, h: TransportHandlers): Promise<void> {
    this.me = me;
    h.onStatus('connecting');
    const channel = new BroadcastChannel(`fcl-room-${room}`);
    this.channel = channel;
    const publish = () => h.onPresence([me, ...[...this.seen.values()].map((s) => s.profile)]);
    channel.onmessage = (e: MessageEvent<Packet>) => {
      const p = e.data;
      if (p.type === 'hello') {
        const isNew = !this.seen.has(p.profile.id);
        this.seen.set(p.profile.id, { profile: p.profile, at: Date.now() });
        if (isNew) {
          publish();
          // Answer newcomers right away so they see us without waiting for a heartbeat.
          channel.postMessage({ type: 'hello', profile: me } satisfies Packet);
        }
      } else if (p.type === 'bye') {
        if (this.seen.delete(p.id)) publish();
      } else if (p.type === 'state') {
        const s = this.seen.get(p.payload.id);
        if (s) s.at = Date.now();
        h.onState(p.payload);
      } else if (p.type === 'chat') h.onChat(p.payload);
      else if (p.type === 'direct' && p.payload.to === me.id) h.onDirect(p.payload);
    };
    const hello = () => channel.postMessage({ type: 'hello', profile: me } satisfies Packet);
    hello();
    this.heartbeat = window.setInterval(hello, 2000);
    this.sweep = window.setInterval(() => {
      let changed = false;
      for (const [id, s] of this.seen) {
        if (Date.now() - s.at > 8000) {
          this.seen.delete(id);
          changed = true;
        }
      }
      if (changed) publish();
    }, 2000);
    window.addEventListener('pagehide', this.onHide);
    publish();
    h.onStatus('online', this.label);
  }

  private onHide = () => {
    if (this.me) this.channel?.postMessage({ type: 'bye', id: this.me.id } satisfies Packet);
  };

  sendState(payload: Parameters<Transport['sendState']>[0]): void {
    this.channel?.postMessage({ type: 'state', payload } satisfies Packet);
  }
  sendChat(payload: Parameters<Transport['sendChat']>[0]): void {
    this.channel?.postMessage({ type: 'chat', payload } satisfies Packet);
  }
  sendDirect(payload: Parameters<Transport['sendDirect']>[0]): void {
    this.channel?.postMessage({ type: 'direct', payload } satisfies Packet);
  }

  async disconnect(): Promise<void> {
    this.onHide();
    window.removeEventListener('pagehide', this.onHide);
    window.clearInterval(this.heartbeat);
    window.clearInterval(this.sweep);
    this.channel?.close();
    this.channel = null;
    this.seen.clear();
  }
}
