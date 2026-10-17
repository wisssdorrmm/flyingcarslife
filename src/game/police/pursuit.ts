/**
 * The police brain (CLAUDE.md §6.3, §6.2 point 5): wanted stars, which cruisers are chasing,
 * line of sight, escaping, getting busted, and the offenses that bring stars. Plain module
 * state updated by PoliceSystem each frame; the HUD reads useWanted, missions use policeLink.
 */
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import type { Pt2 } from '../city/roadGraph';
import { POLICE } from '../config';
import { policeLink, type PoliceUnit } from '../missions/policeLink';
import { useCareer } from '../store/career';
import { toast } from '../store/toasts';
import { useWanted } from '../store/wanted';

export interface Unit extends PoliceUnit {
  id: number;
  /** Spawn transform (the cruiser's initial props). */
  start: [number, number, number];
  heading: number;
  body: RapierRigidBody | null;
  /** Road route toward the player and when to recompute it. */
  route: Pt2[];
  repathIn: number;
  /** Seconds since this unit last saw the player. */
  sinceSeen: number;
  /** Seconds lying on its roof or side. */
  flipped: number;
  /** Set once the pursuit is over: removed after this many seconds. */
  leaving: number | null;
  onBody: (rb: RapierRigidBody | null) => void;
  nav: (p: { x: number; z: number }, target: THREE.Vector3) => { x: number; z: number } | null;
}

let nextId = 1;

/** Shared mutable pursuit state. */
export const pursuit = {
  stars: 0,
  units: [] as Unit[],
  /** The helicopter, while one is up (position/velocity updated by PoliceHeli). */
  heli: null as PoliceUnit | null,
  /** Seconds the player has been out of every unit's sight. */
  outOfSight: 0,
  /** Seconds a unit has had the player boxed in. */
  boxedIn: 0,
  /** Bumped whenever the unit list changes, so PoliceSystem re-renders. */
  version: 0,
  listeners: new Set<() => void>(),

  changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  },

  /** Raise the wanted level to at least `stars` (missions, offenses). */
  raise(stars: number, reason: string): void {
    const next = Math.min(5, Math.max(this.stars, Math.round(stars)));
    if (next <= this.stars) {
      // Already that hot: still counts as being seen right now.
      this.outOfSight = 0;
      return;
    }
    const wasCalm = this.stars === 0;
    this.stars = next;
    this.outOfSight = 0;
    if (wasCalm) toast(`${reason} — police in pursuit`, 'warn');
    publish();
    this.changed();
  },

  /** Adds stars for an offense (only when police are close enough to see it). */
  offense(kind: keyof typeof POLICE.offenses, label: string, witnessed: boolean): void {
    if (!witnessed) return;
    this.raise(Math.max(1, this.stars + POLICE.offenses[kind]), label);
  },

  clear(): void {
    this.stars = 0;
    this.outOfSight = 0;
    this.boxedIn = 0;
    for (const u of this.units) u.leaving ??= 4;
    publish();
    this.changed();
  },

  addUnit(x: number, y: number, z: number, heading: number): Unit {
    const unit: Unit = {
      id: nextId++,
      start: [x, y, z],
      heading,
      body: null,
      position: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(),
      route: [],
      repathIn: 0,
      sinceSeen: 0,
      flipped: 0,
      leaving: null,
      onBody: (rb) => {
        unit.body = rb;
      },
      // Follow the road route until close and in sight, then drive straight at the player.
      nav: (p, target) => {
        if (Math.hypot(target.x - p.x, target.z - p.z) < POLICE.directRange && unit.sinceSeen < 1) {
          return null;
        }
        while (
          unit.route.length > 1 &&
          Math.hypot(unit.route[0]!.x - p.x, unit.route[0]!.z - p.z) < 9
        ) {
          unit.route.shift();
        }
        return unit.route[0] ?? null;
      },
    };
    this.units.push(unit);
    this.changed();
    return unit;
  },

  removeUnit(unit: Unit): void {
    const i = this.units.indexOf(unit);
    if (i < 0) return;
    this.units.splice(i, 1);
    this.changed();
  },

  /** Every police vehicle (cruisers and the helicopter), for missions and gunfire. */
  all(): PoliceUnit[] {
    const list: PoliceUnit[] = this.units.filter((u) => u.leaving === null);
    return this.heli ? [...list, this.heli] : list;
  },

  busted(): void {
    const fee = Math.min(useCareer.getState().cash, this.stars * POLICE.bustedFeePerStar);
    if (fee > 0) useCareer.getState().spend(fee);
    toast(fee > 0 ? `BUSTED  −$${fee.toLocaleString()}` : 'BUSTED', 'warn');
    bustedHooks.forEach((h) => h());
    this.clear();
  },

  evaded(): void {
    const reward = this.stars * POLICE.evadeRewardPerStar;
    if (reward > 0) useCareer.getState().addCash(reward);
    toast(`Evaded the police  +$${reward.toLocaleString()}`, 'reward');
    this.clear();
  },
};

export const bustedHooks = new Set<() => void>();

/** Pushes the HUD-facing values into the wanted store. */
export function publish(): void {
  const escapeFor = pursuit.stars > 0 ? POLICE.escapeSeconds : 1;
  useWanted.getState().set({
    stars: pursuit.stars,
    pursuit: pursuit.stars > 0,
    evadeReward: pursuit.stars * POLICE.evadeRewardPerStar,
    escape: pursuit.stars > 0 ? Math.min(1, pursuit.outOfSight / escapeFor) : 0,
  });
}

policeLink.api = {
  stars: () => pursuit.stars,
  raise: (stars, reason) => pursuit.raise(stars, reason),
  clear: () => pursuit.clear(),
  units: () => pursuit.all(),
  onBusted: bustedHooks,
};
