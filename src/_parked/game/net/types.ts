/** Wire types for multiplayer. Keep these small: state goes out ~10× per second. */

export interface PlayerProfile {
  id: string;
  name: string;
  title: string;
  /** Name-tag accent color. */
  color: string;
}

export type AnimName = 'idle' | 'walk' | 'run' | 'sprint' | 'jump' | 'fall';

export interface PlayerSnapshot {
  id: string;
  /** Sender's clock (ms) when sampled. */
  t: number;
  x: number;
  y: number;
  z: number;
  /** Facing (radians about Y; 0 = +z). */
  yaw: number;
  anim: AnimName;
  /** Emote being performed (and when it started, sender clock ms). */
  emote?: { name: EmoteName; t: number };
  /** Present while driving: the car's position, rotation and paint. */
  car?: {
    x: number;
    y: number;
    z: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    paint: string;
  };
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  t: number;
}

/** A message addressed to one player: voice signaling or a social request/response. */
export interface DirectMessage {
  from: string;
  to: string;
  topic: 'voice' | 'social';
  /** voice: offer | answer | ice | bye. social: e.g. high-five, hug, friend, accept, decline. */
  kind: string;
  data?: unknown;
}

export type EmoteName = 'wave' | 'dance' | 'dance2' | 'highfive' | 'hug' | 'clap' | 'cheer';

export interface TransportHandlers {
  onPresence: (players: PlayerProfile[]) => void;
  onState: (s: PlayerSnapshot) => void;
  onChat: (m: ChatMessage) => void;
  onDirect: (m: DirectMessage) => void;
  onStatus: (status: 'connecting' | 'online' | 'offline', detail?: string) => void;
}

export interface Transport {
  /** Human-readable backend name for the UI ("Online" / "Local test"). */
  readonly label: string;
  connect(room: string, me: PlayerProfile, handlers: TransportHandlers): Promise<void>;
  sendState(s: PlayerSnapshot): void;
  sendChat(m: ChatMessage): void;
  sendDirect(m: DirectMessage): void;
  disconnect(): Promise<void>;
}
