/**
 * The mission ladder. Levels 1–8 are handcrafted and escalate: tighter timers, more stars, police
 * who start shooting and shoot better. After that, endless "contracts" are generated from the same
 * building blocks with difficulty that keeps climbing.
 */
import { MISSIONS } from '../config';
import { seeded } from '../../lib/rand';
import type { MissionDef, Stage } from './types';

export const HANDCRAFTED: MissionDef[] = [
  {
    level: 1,
    title: 'Wheelman',
    tagline: 'Every crew needs a driver.',
    briefing:
      'Nico needs a ride and he hates waiting. Pick him up at Washington Square and get him to the top of Telegraph Hill before his meeting starts.',
    start: 'washsq',
    armor: 100,
    reward: 400,
    stages: [
      { kind: 'pickup', at: 'washsq', who: 'Nico', count: 1, text: 'Pick up Nico' },
      { kind: 'dropoff', at: 'coit', time: 120, text: 'Drop Nico at Coit Tower' },
    ],
  },
  {
    level: 2,
    title: 'Hot Delivery',
    tagline: 'Three drops. One clock.',
    briefing:
      'Some packages that are better not opened. Hit every drop in North Beach before the buyers walk.',
    start: 'church',
    armor: 100,
    reward: 750,
    stages: [
      {
        kind: 'checkpoints',
        points: ['church', 'levis', 'pier39'],
        time: 150,
        text: 'Make every drop',
      },
      {
        kind: 'escape',
        text: 'Lose the police',
        announce: 'Someone tipped off the cops!',
        heat: { stars: 1 },
      },
    ],
  },
  {
    level: 3,
    title: 'Sweet Tooth',
    tagline: 'Grab the case, lose the heat.',
    briefing:
      'A courier left a briefcase at Ghirardelli Square. Collect it, shake off the patrol that will be on you, and bring it to the Russian Hill garage.',
    start: 'ghirardelli',
    armor: 100,
    reward: 1200,
    stages: [
      { kind: 'drive', to: 'ghirardelli', stop: true, text: 'Collect the briefcase' },
      {
        kind: 'escape',
        text: 'Lose the police',
        announce: 'Alarm tripped — police are on the way!',
        heat: { stars: 2 },
      },
      { kind: 'dropoff', at: 'hideout', time: 100, text: 'Bring the case to the garage' },
    ],
  },
  {
    level: 4,
    title: 'Sky Heist',
    tagline: 'A cargo plane. A countdown. A pilot who runs.',
    briefing:
      'A cargo plane is parked on The Embarcadero for the air show. It takes off when the clock runs out. Get to it first, take it, and grab the pilot — he knows the vault codes. The whole city will know about it.',
    start: 'washsq',
    armor: 100,
    reward: 3500,
    plane: true,
    stages: [
      {
        kind: 'hijack',
        departIn: 150,
        hold: 3,
        text: 'Reach the plane before it takes off',
      },
      {
        kind: 'catch',
        who: 'the pilot',
        speed: 5.2,
        escapeDistance: 260,
        text: 'Catch the pilot',
        announce: 'The pilot jumped out and is running!',
      },
      {
        kind: 'escape',
        text: 'Lose the police',
        announce: 'Hijack reported — police are shooting!',
        heat: { stars: 3, fire: { rate: 0.5, accuracy: 0.18 } },
      },
      { kind: 'dropoff', at: 'hideout', time: 150, text: 'Take the pilot to the hideout' },
    ],
  },
  {
    level: 5,
    title: 'The Getaway',
    tagline: 'They rob it. You get them out.',
    briefing:
      'Two of our people are inside the bank by the Pyramid. Wait for them — the alarm will already be ringing — then lose every cruiser in the city and drop them at the hideout.',
    start: 'church',
    armor: 100,
    reward: 4500,
    stages: [
      { kind: 'drive', to: 'bank', time: 110, text: 'Get to the bank' },
      {
        kind: 'pickup',
        at: 'bank',
        who: 'the crew',
        count: 2,
        wait: 8,
        text: 'Wait for the crew',
        announce: 'Alarm! Police are coming!',
        heat: { stars: 2 },
      },
      {
        kind: 'escape',
        text: 'Lose the police',
        heat: { stars: 3, fire: { rate: 0.6, accuracy: 0.2 } },
      },
      { kind: 'dropoff', at: 'hideout2', time: 140, text: 'Drop the crew at the hideout' },
    ],
  },
  {
    level: 6,
    title: 'Rush Hour Run',
    tagline: 'Five checkpoints. Bullets flying.',
    briefing:
      'The cops already know your car. Clear five checkpoints across the city while they shoot at you, then disappear.',
    start: 'aquatic',
    armor: 100,
    reward: 6000,
    stages: [
      {
        kind: 'checkpoints',
        points: ['aquatic', 'turnaround', 'lombard', 'washsq', 'levis'],
        time: 170,
        text: 'Clear every checkpoint',
        heat: { stars: 3, fire: { rate: 0.7, accuracy: 0.22 } },
      },
      { kind: 'escape', text: 'Lose the police' },
    ],
  },
  {
    level: 7,
    title: 'Red-Eye',
    tagline: 'Same plane. Less time. Angrier cops.',
    briefing:
      'They moved the cargo flight up. Less time, a faster pilot and the police will be waiting. Take the plane, catch the pilot and get him to the hideout in one piece.',
    start: 'lombard',
    armor: 110,
    reward: 9000,
    plane: true,
    stages: [
      {
        kind: 'hijack',
        departIn: 110,
        hold: 3.5,
        text: 'Reach the plane before it takes off',
        heat: { stars: 1 },
      },
      {
        kind: 'catch',
        who: 'the pilot',
        speed: 6,
        escapeDistance: 240,
        text: 'Catch the pilot',
        announce: 'The pilot is running!',
        heat: { stars: 3, fire: { rate: 0.6, accuracy: 0.2 } },
      },
      {
        kind: 'escape',
        text: 'Lose the police',
        announce: 'Every unit is after you!',
        heat: { stars: 4, fire: { rate: 0.9, accuracy: 0.26 } },
      },
      { kind: 'dropoff', at: 'hideout', time: 130, text: 'Take the pilot to the hideout' },
    ],
  },
  {
    level: 8,
    title: 'Most Wanted',
    tagline: 'Five stars. Ninety seconds. Survive.',
    briefing:
      'This is the big one. The whole department is coming. Stay alive for ninety seconds under fire, then lose them and get to the hideout.',
    start: 'pier39',
    armor: 140,
    reward: 15000,
    stages: [
      {
        kind: 'survive',
        time: 90,
        text: 'Survive',
        announce: 'Five stars. Good luck.',
        heat: { stars: 5, fire: { rate: 1.1, accuracy: 0.3 } },
      },
      { kind: 'escape', text: 'Lose the police' },
      { kind: 'dropoff', at: 'hideout2', time: 120, text: 'Get to the hideout' },
    ],
  },
];

/** Places contracts are generated from. */
const SPOTS = [
  'washsq',
  'coit',
  'pier39',
  'lombard',
  'ghirardelli',
  'aquatic',
  'church',
  'turnaround',
  'levis',
  'wharfsign',
  'filbert',
];

/**
 * Endless contracts after the handcrafted ladder. `tier` = how far past the ladder (1, 2, …);
 * everything gets tighter and hotter as it climbs.
 */
function contract(level: number): MissionDef {
  const tier = level - HANDCRAFTED.length;
  const rand = seeded(level * 7919);
  const pick = () => SPOTS[Math.floor(rand() * SPOTS.length)]!;
  const d = MISSIONS.contracts;
  const tighten = Math.pow(d.timeFactorPerTier, tier);
  const stars = Math.min(5, 3 + Math.floor(tier / 2));
  const fire = {
    rate: Math.min(d.maxFireRate, 0.8 + tier * 0.08),
    accuracy: Math.min(d.maxAccuracy, 0.24 + tier * 0.02),
  };
  const kind = tier % 3;
  let stages: Stage[];
  let title: string;
  let tagline: string;
  let plane = false;
  if (kind === 0) {
    plane = true;
    title = `Sky Heist ${tier + 1}`;
    tagline = 'The plane is back. So are the cops.';
    stages = [
      {
        kind: 'hijack',
        departIn: Math.max(60, 120 * tighten),
        hold: 3.5,
        text: 'Reach the plane before it takes off',
        heat: { stars: 2 },
      },
      {
        kind: 'catch',
        who: 'the pilot',
        speed: Math.min(7.5, 6 + tier * 0.15),
        escapeDistance: 230,
        text: 'Catch the pilot',
        heat: { stars, fire },
      },
      { kind: 'escape', text: 'Lose the police', heat: { stars: Math.min(5, stars + 1), fire } },
      {
        kind: 'dropoff',
        at: 'hideout',
        time: Math.max(70, 130 * tighten),
        text: 'Get to the hideout',
      },
    ];
  } else if (kind === 1) {
    title = `Hot Run ${tier + 1}`;
    tagline = 'Checkpoints under fire.';
    const points = [pick(), pick(), pick(), pick(), pick()].filter((p, i, a) => a.indexOf(p) === i);
    stages = [
      {
        kind: 'checkpoints',
        points,
        time: Math.max(80, 170 * tighten),
        text: 'Clear every checkpoint',
        heat: { stars, fire },
      },
      { kind: 'escape', text: 'Lose the police' },
    ];
  } else {
    title = `Extraction ${tier + 1}`;
    tagline = 'Pick them up. Get them out.';
    const at = pick();
    stages = [
      { kind: 'drive', to: at, time: Math.max(60, 110 * tighten), text: 'Get to the pickup' },
      {
        kind: 'pickup',
        at,
        who: 'the crew',
        count: 2,
        wait: 6,
        text: 'Wait for the crew',
        heat: { stars, fire },
      },
      { kind: 'survive', time: Math.min(120, 40 + tier * 8), text: 'Survive the ambush' },
      { kind: 'escape', text: 'Lose the police' },
      {
        kind: 'dropoff',
        at: 'hideout2',
        time: Math.max(70, 120 * tighten),
        text: 'Get to the hideout',
      },
    ];
  }
  return {
    level,
    title,
    tagline,
    briefing: 'A new contract came in. It pays more than the last one — and it is harder.',
    start: pick(),
    armor: 120 + tier * 5,
    reward: Math.round(HANDCRAFTED.at(-1)!.reward * Math.pow(d.rewardFactorPerTier, tier)),
    plane,
    stages,
  };
}

export function missionFor(level: number): MissionDef {
  return HANDCRAFTED[level - 1] ?? contract(level);
}
