/**
 * Mission data model. A mission is a list of stages run in order; each stage has one objective.
 * Places are named (landmarks or fixed points) and resolved to road positions at runtime.
 */

/** Where something happens: a named landmark (geo.ts LANDMARKS id) or a mission place id. */
export type PlaceRef = string;

/** Police heat a stage turns on. */
export interface Heat {
  /** Wanted stars to raise to (never lowers the current level). */
  stars: number;
  /** Police open fire: shots per second per unit in range, and hit chance (0–1) at 10 m. */
  fire?: { rate: number; accuracy: number };
}

interface StageBase {
  /** Objective line shown on the HUD ("Get to the plane before it leaves"). */
  text: string;
  /** Optional toast when the stage starts ("The pilot is making a run for it!"). */
  announce?: string;
  /** Heat applied when the stage starts. */
  heat?: Heat;
}

/** Drive to a place (optionally stop there), optionally within a time limit. */
export interface DriveStage extends StageBase {
  kind: 'drive';
  to: PlaceRef;
  /** Seconds allowed; omitted = no limit. */
  time?: number;
  /** Must come to a stop inside the marker. */
  stop?: boolean;
}

/** Stop at a place; people walk out and get in the car. */
export interface PickupStage extends StageBase {
  kind: 'pickup';
  at: PlaceRef;
  /** Who gets in (shown in the HUD: "Nico", "the crew"). */
  who: string;
  count: number;
  /** Seconds to wait at the marker after stopping (e.g. robbers finishing inside). */
  wait?: number;
  time?: number;
}

/** Stop at a place; passengers get out. */
export interface DropoffStage extends StageBase {
  kind: 'dropoff';
  at: PlaceRef;
  time?: number;
}

/** Drive through checkpoints in order within a time limit. */
export interface CheckpointStage extends StageBase {
  kind: 'checkpoints';
  points: PlaceRef[];
  time: number;
}

/**
 * The plane job: reach the parked cargo plane before it leaves, and stop at its door for a few
 * seconds. After the deadline it starts its take-off roll; you can still catch it by matching its
 * speed alongside the door, until it lifts off.
 */
export interface HijackStage extends StageBase {
  kind: 'hijack';
  /** Seconds until the plane starts rolling. */
  departIn: number;
  /** Seconds to hold position at the door. */
  hold: number;
}

/** Someone runs for it on foot; catch them (pull up next to them and stop). */
export interface CatchStage extends StageBase {
  kind: 'catch';
  who: string;
  /** Running speed (m/s). */
  speed: number;
  /** How far they get (m) before they're gone for good. */
  escapeDistance: number;
}

/** Lose the police (stars back to zero). */
export interface EscapeStage extends StageBase {
  kind: 'escape';
}

/** Stay alive under fire for a while. */
export interface SurviveStage extends StageBase {
  kind: 'survive';
  time: number;
}

export type Stage =
  | DriveStage
  | PickupStage
  | DropoffStage
  | CheckpointStage
  | HijackStage
  | CatchStage
  | EscapeStage
  | SurviveStage;

export interface MissionDef {
  /** 1-based level number. */
  level: number;
  title: string;
  /** One-line hook on the mission card. */
  tagline: string;
  /** Short briefing (2–3 sentences). */
  briefing: string;
  /** Where the mission starts (drive into the marker to begin). */
  start: PlaceRef;
  /** Car armor for this mission (gunfire drains it; 0 = wrecked). */
  armor: number;
  reward: number;
  /** Uses the cargo plane (spawned at the airstrip). */
  plane?: boolean;
  stages: Stage[];
}
