import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { supabase } from '../../lib/supabase';
import { DEMO_PLAYERS, PLAYER } from '../config';
import { EMOTES } from '../player/emotes';
import { cityPlaces } from '../places/placement';
import { currentPose } from '../store/nav';
import { useNet } from '../store/net';
import { SOCIAL_EMOTE, type SocialAction } from '../store/social';
import { BLOCKS, CURB_HEIGHT, type Block } from '../world/cityPlan';
import { deliverLocal, receiveChat, remoteSnapshots } from './client';
import { demoRoster } from './demoRoster';
import { NAME_COLORS, TITLES } from './profile';
import type { AnimName, EmoteName, PlayerProfile } from './types';

const FIRST = [
  'Maya',
  'Leo',
  'Zara',
  'Tunde',
  'Chloe',
  'Ike',
  'Sofia',
  'Kai',
  'Amara',
  'Noah',
  'Lena',
  'Diego',
  'Ada',
  'Marcus',
  'Yuki',
  'Femi',
  'Nia',
  'Omar',
  'Grace',
  'Theo',
  'Ruby',
  'Sam',
  'Priya',
  'Jay',
  'Ola',
  'Mila',
];
const LAST = ['K', 'B', 'O', 'M', 'R', 'T', 'A', 'J', 'S', 'D'];

const LINES = [
  'Anyone tried the burgers at Sunny Side? 🍔',
  'Gym later? Iron Harbor is open',
  'Saving up for a flying car 😅',
  'First week in Harbor City, it is huge',
  'Who wants to hit the arcade?',
  'Harbor Brew latte is elite ☕',
  'That white Flying Car on Main St is so clean',
  'Need a job, anyone hiring?',
  'Pixel Pier at night is the vibe',
  'Just moved into Bayview Studios',
];
const REPLIES = [
  'Hey! 👋',
  'lol same',
  'Welcome to Harbor City!',
  'Sounds good 👍',
  'Haha nice',
  'True',
  "Let's go!",
  'See you there',
];
const SOLO_EMOTES: EmoteName[] = ['wave', 'clap', 'cheer', 'dance', 'dance2'];

type Mode = 'walk' | 'idle' | 'emote' | 'hangout';

interface Bot {
  profile: PlayerProfile;
  block: Block | null;
  /** Distance along the block's sidewalk loop, and direction. */
  p: number;
  dir: 1 | -1;
  speed: number;
  mode: Mode;
  until: number;
  emote: { name: EmoteName; t: number } | undefined;
  x: number;
  z: number;
  yaw: number;
  /** Turn toward this point while standing (e.g. you, during a high five). */
  face: { x: number; z: number } | null;
}

/** Deterministic PRNG so the same demo crowd appears every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Point on a block's sidewalk loop (2.2 m out from the facades). */
function loopPoint(b: Block, p: number): { x: number; z: number; dx: number; dz: number } {
  const d = 2.2;
  const x0 = b.x0 - d;
  const x1 = b.x1 + d;
  const z0 = b.z0 - d;
  const z1 = b.z1 + d;
  const w = x1 - x0;
  const h = z1 - z0;
  const len = 2 * (w + h);
  let t = ((p % len) + len) % len;
  if (t < w) return { x: x0 + t, z: z0, dx: 1, dz: 0 };
  t -= w;
  if (t < h) return { x: x1, z: z0 + t, dx: 0, dz: 1 };
  t -= h;
  if (t < w) return { x: x1 - t, z: z1, dx: -1, dz: 0 };
  t -= w;
  return { x: x0, z: z1 - t, dx: 0, dz: -1 };
}

function demoCount(): number {
  const param = new URLSearchParams(window.location.search).get('bots');
  if (param !== null && Number.isFinite(Number(param)))
    return Math.max(0, Math.min(80, Number(param)));
  return supabase ? DEMO_PLAYERS.onlineCount : DEMO_PLAYERS.localCount;
}

/** Simulated players: walk the blocks, hang out at places, emote, chat and answer requests. */
export function DemoPlayers() {
  const bots = useRef<Bot[]>([]);
  const lastTick = useRef(0);
  const nextLine = useRef(8);

  useEffect(() => {
    const count = demoCount();
    if (!count) return;
    const r = rng(42);
    // Blocks with streets on all four sides, nearest the middle of town first.
    // Blocks with streets on all four sides, nearest the spawn point first, so you see people
    // walking by as soon as you arrive.
    const [sx, , sz] = PLAYER.spawn;
    const dist = (b: Block) => Math.hypot((b.x0 + b.x1) / 2 - sx, (b.z0 + b.z1) / 2 - sz);
    const blocks = BLOCKS.filter((b) => b.roads.n && b.roads.s && b.roads.e && b.roads.w).sort(
      (a, b) => dist(a) - dist(b),
    );
    const hangouts = cityPlaces().filter((p) =>
      ['coffee', 'arcade', 'market', 'diner'].includes(p.type),
    );
    const list: Bot[] = [];
    for (let i = 0; i < count; i++) {
      const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(r() * LAST.length)]}.`;
      const profile: PlayerProfile = {
        id: `demo-${i}`,
        name,
        title: `${TITLES[Math.floor(r() * TITLES.length)]} · demo`,
        color: NAME_COLORS[Math.floor(r() * NAME_COLORS.length)]!,
      };
      const hangout = i % 4 === 0 ? hangouts[(i / 4) % hangouts.length] : undefined;
      const block = hangout
        ? null
        : (blocks[Math.floor((i / count) * Math.min(blocks.length, 8))] ?? blocks[0]!);
      const spot = hangout
        ? { x: hangout.door.x + (r() - 0.5) * 4, z: hangout.door.z + (r() - 0.5) * 2 }
        : { x: 0, z: 0 };
      list.push({
        profile,
        block,
        p: r() * 400,
        dir: r() < 0.5 ? 1 : -1,
        speed:
          DEMO_PLAYERS.walkSpeed[0] + r() * (DEMO_PLAYERS.walkSpeed[1] - DEMO_PLAYERS.walkSpeed[0]),
        mode: hangout ? 'hangout' : 'walk',
        until: performance.now() + 4000 + r() * 8000,
        emote: undefined,
        x: spot.x,
        z: spot.z,
        yaw: r() * Math.PI * 2,
        face: null,
      });
    }
    bots.current = list;
    demoRoster.profiles = list.map((b) => b.profile);
    demoRoster.ids = new Set(list.map((b) => b.profile.id));
    const net = useNet.getState();
    net.setPlayers([
      ...net.players.filter((p) => !p.id.startsWith('demo-')),
      ...demoRoster.profiles,
    ]);

    const byId = (id: string) => list.find((b) => b.profile.id === id);
    demoRoster.onDirect = (m) => {
      const bot = byId(m.to);
      const action = (m.data as { action?: SocialAction } | undefined)?.action;
      if (!bot || m.topic !== 'social' || m.kind !== 'request' || !action) return;
      window.setTimeout(
        () => {
          const accept = Math.random() < DEMO_PLAYERS.acceptChance;
          deliverLocal({
            from: bot.profile.id,
            to: m.from,
            topic: 'social',
            kind: accept ? 'accept' : 'decline',
            data: { action },
          });
          if (!accept) return;
          const emote = SOCIAL_EMOTE[action];
          const me = currentPose();
          bot.mode = 'emote';
          bot.face = me ? { x: me.x, z: me.z } : null;
          if (emote) {
            bot.emote = { name: emote, t: performance.now() + 250 };
            bot.until = performance.now() + 250 + (EMOTES[emote].duration || 6) * 1000;
          } else bot.until = performance.now() + 2500;
        },
        900 + Math.random() * 1200,
      );
    };
    demoRoster.onChat = () => {
      const me = currentPose();
      if (!me) return;
      const near = list
        .filter((b) => Math.hypot(b.x - me.x, b.z - me.z) < 25)
        .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
      const bot = near[0];
      if (!bot || Math.random() > 0.7) return;
      window.setTimeout(
        () => {
          receiveChat({
            id: `${bot.profile.id}-${Date.now()}`,
            from: bot.profile.id,
            name: bot.profile.name,
            text: REPLIES[Math.floor(Math.random() * REPLIES.length)]!,
            t: Date.now(),
          });
        },
        1500 + Math.random() * 2000,
      );
    };

    return () => {
      for (const b of list) remoteSnapshots.delete(b.profile.id);
      demoRoster.profiles = [];
      demoRoster.ids = new Set();
      demoRoster.onDirect = demoRoster.onChat = null;
      const n = useNet.getState();
      n.setPlayers(n.players.filter((p) => !p.id.startsWith('demo-')));
    };
  }, []);

  useFrame(({ clock }) => {
    if (!bots.current.length || clock.elapsedTime - lastTick.current < 0.1) return;
    const dt = Math.min(0.25, clock.elapsedTime - lastTick.current);
    lastTick.current = clock.elapsedTime;
    const now = performance.now();

    for (const b of bots.current) {
      let anim: AnimName = 'idle';
      // Pick what to do next when the current activity ends.
      if (now > b.until) {
        b.emote = undefined;
        b.face = null;
        const roll = Math.random();
        if (b.mode === 'hangout' || !b.block) {
          b.mode = 'hangout';
          if (roll < 0.35) {
            const name = SOLO_EMOTES[Math.floor(Math.random() * SOLO_EMOTES.length)]!;
            b.emote = { name, t: now };
            b.until = now + (EMOTES[name].duration || 5 + Math.random() * 4) * 1000;
          } else b.until = now + 3000 + Math.random() * 5000;
        } else if (roll < 0.62) {
          b.mode = 'walk';
          b.speed =
            Math.random() < 0.15
              ? DEMO_PLAYERS.jogSpeed
              : DEMO_PLAYERS.walkSpeed[0] + Math.random() * 0.35;
          if (Math.random() < 0.2) b.dir = b.dir === 1 ? -1 : 1;
          b.until = now + 6000 + Math.random() * 12000;
        } else if (roll < 0.82) {
          b.mode = 'idle';
          b.until = now + 2000 + Math.random() * 4000;
        } else {
          b.mode = 'emote';
          const name = SOLO_EMOTES[Math.floor(Math.random() * SOLO_EMOTES.length)]!;
          b.emote = { name, t: now };
          b.until = now + (EMOTES[name].duration || 4 + Math.random() * 3) * 1000;
        }
      }

      if (b.mode === 'walk' && b.block) {
        b.p += b.dir * b.speed * dt;
        const pt = loopPoint(b.block, b.p);
        b.x = pt.x;
        b.z = pt.z;
        b.yaw = Math.atan2(pt.dx * b.dir, pt.dz * b.dir);
        anim = b.speed > (PLAYER.walkSpeed + PLAYER.runSpeed) / 2 ? 'run' : 'walk';
      } else if (b.face) {
        b.yaw = Math.atan2(b.face.x - b.x, b.face.z - b.z);
      }

      const list = remoteSnapshots.get(b.profile.id) ?? [];
      list.push({
        id: b.profile.id,
        t: now,
        x: b.x,
        y: CURB_HEIGHT + 0.02,
        z: b.z,
        yaw: b.yaw,
        anim,
        emote: b.emote,
      });
      if (list.length > 20) list.shift();
      remoteSnapshots.set(b.profile.id, list);
    }

    // Now and then someone near you says something.
    if (clock.elapsedTime > nextLine.current) {
      nextLine.current = clock.elapsedTime + DEMO_PLAYERS.chatEvery * (0.6 + Math.random() * 0.8);
      const me = currentPose();
      const near = me
        ? bots.current.filter((b) => Math.hypot(b.x - me.x, b.z - me.z) < DEMO_PLAYERS.chatRange)
        : [];
      const bot = near[Math.floor(Math.random() * near.length)];
      if (bot) {
        receiveChat({
          id: `${bot.profile.id}-${Date.now()}`,
          from: bot.profile.id,
          name: bot.profile.name,
          text: LINES[Math.floor(Math.random() * LINES.length)]!,
          t: Date.now(),
        });
      }
    }
  });

  return null;
}
