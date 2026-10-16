/**
 * Every tunable number in the game lives here (CLAUDE.md §4).
 * Values are starting points from CLAUDE.md §5 and will be rebalanced in Phase 8.
 */

export const TIME = {
  /** Real seconds per in-game day (24 real minutes). */
  realSecondsPerGameDay: 24 * 60,
  /** Game hour the player wakes on a new save. */
  startHour: 8,
  rentIntervalDays: 3,
  /** Missed rent payments before the player is downgraded. */
  missedRentBeforeDowngrade: 2,
} as const;

export const NEEDS = {
  /** 0–100 scales. Drain values are per in-game hour. */
  energyMax: 100,
  hungerMax: 100,
  energyDrainPerHour: 4,
  hungerDrainPerHour: 6,
  /** Below this hunger, energy drains extra. */
  hungerLowThreshold: 20,
  hungerLowExtraEnergyDrainPerHour: 3,
  /** Below this energy, movement and job pay are reduced. */
  energyLowThreshold: 20,
  lowEnergySpeedMultiplier: 0.75,
  lowEnergyPayMultiplier: 0.8,
  sleepRestorePerHour: 12.5,
} as const;

export const START = {
  cash: 500,
  home: 'studio',
  vehicle: 'bicycle',
} as const;

export const PRICES = {
  rent: { studio: 150, apartment: 450 },
  homes: { suburbanHouse: 120_000, penthouse: 650_000 },
  cars: { used: 4_000, mid: 18_000 },
  flightLicense: 8_000,
  flyingCar: 45_000,
  fuel: { min: 30, max: 60 },
  hospital: { base: 500, cashPercent: 0.1 },
  weaponPermit: 2_000,
} as const;

export const JOBS = {
  delivery: { payMin: 40, payMax: 80, timerBonusMax: 25 },
  rideHail: { payMin: 80, payMax: 200, tipMax: 50 },
  mechanic: { payMin: 150, payMax: 300 },
  airTaxi: { payMin: 400, payMax: 900 },
  rooftopCargo: { payMin: 600, payMax: 1_500 },
} as const;

export const WANTED = {
  maxStars: 5,
  stars: {
    publicFight: 1,
    drawWeapon: 1,
    carTheft: 2,
    hitAndRun: 2,
    recklessDriving: 1,
    shooting: 3,
    injuring: 2,
    noFlyZone: 2,
    attackPolice: 4,
  },
  /** Seconds out of police line of sight before stars start fading. */
  escapeSeconds: 20,
  repaintStarsRemoved: { min: 1, max: 2 },
  /** Game days a crime-free record needed to buy a weapon permit. */
  permitCleanDays: 3,
} as const;

export const PLAYER = {
  walkSpeed: 1.6,
  runSpeed: 3.8,
  sprintSpeed: 6.2,
  jumpVelocity: 5,
} as const;

export const PHYSICS = {
  gravity: [0, -9.81, 0] as [number, number, number],
  /** Fixed physics step (seconds). Rapier interpolates rendering between steps. */
  timeStep: 1 / 60,
} as const;

export const SAVE = {
  /** Impressions are batched and sent at most once per this many ms (CLAUDE.md §6). */
  adImpressionFlushMs: 60_000,
} as const;

export const WORLD_LIGHTING = {
  sunIntensity: 3.2,
  sunColor: '#fff3e0',
  /** The HDRI already contains the sun; keep IBL lower so it isn't counted twice. */
  environmentIntensity: 0.75,
  backgroundIntensity: 1,
  exposure: 0.9,
  fogColor: '#c9d3dc',
  fogNear: 60,
  fogFar: 450,
} as const;

export const DEBUG_CAMERA = {
  start: [-34, 1.7, 10.5] as [number, number, number],
  lookAt: [10, 5, -2] as [number, number, number],
  speed: 8,
  fastSpeed: 30,
  lookSpeed: 0.0025,
} as const;

/** Traffic signal cycle in seconds. Phase A = Main Street (E–W), Phase B = 1st Avenue (N–S). */
export const TRAFFIC_SIGNALS = {
  greenA: 22,
  yellowA: 4,
  allRedA: 2,
  greenB: 16,
  yellowB: 4,
  allRedB: 2,
} as const;

/** Desktop key bindings (KeyboardEvent.code). Remappable in Phase 12. */
export const KEYMAP = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  walk: ['AltLeft', 'AltRight'],
  jump: ['Space'],
  flyDown: ['ControlLeft', 'ControlRight'],
  interact: ['KeyE'],
  attack: ['KeyF'],
  reload: ['KeyR'],
  phone: ['KeyP'],
} as const;

export const INPUT = {
  /** Radians of camera rotation per pixel of mouse movement. */
  mouseSensitivity: 0.0022,
  /** Radians per pixel of touch drag on the look area. */
  touchSensitivity: 0.005,
  /** Joystick deflection (0–1) above which the player runs instead of walks. */
  joystickRunThreshold: 0.6,
} as const;
