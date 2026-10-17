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

/** WebRTC signaling for proximity voice, addressed to one player. */
export interface VoiceSignal {
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'ice' | 'bye';
  data?: unknown;
}

export interface TransportHandlers {
  onPresence: (players: PlayerProfile[]) => void;
  onState: (s: PlayerSnapshot) => void;
  onChat: (m: ChatMessage) => void;
  onSignal: (s: VoiceSignal) => void;
  onStatus: (status: 'connecting' | 'online' | 'offline', detail?: string) => void;
}

export interface Transport {
  /** Human-readable backend name for the UI ("Online" / "Local test"). */
  readonly label: string;
  connect(room: string, me: PlayerProfile, handlers: TransportHandlers): Promise<void>;
  sendState(s: PlayerSnapshot): void;
  sendChat(m: ChatMessage): void;
  sendSignal(s: VoiceSignal): void;
  disconnect(): Promise<void>;
}
