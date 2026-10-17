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
  /** 0–100 scales. Drain values are per in-game hour. Fullness 100 = just ate, 0 = starving. */
  energyMax: 100,
  hungerMax: 100,
  energyDrainPerHour: 4,
  hungerDrainPerHour: 6,
  moodDrainPerHour: 1,
  /** Below this fullness, energy drains extra and mood drops. */
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
  jumpVelocity: 3.6,
  /** Character height in meters (the model is scaled to this). */
  height: 1.72,
  capsuleRadius: 0.3,
  /** Half the cylinder part of the capsule; total height = 2 * (halfHeight + radius). */
  capsuleHalfHeight: 0.56,
  /** Ground acceleration toward the target speed (m/s²) and air control fraction. */
  acceleration: 22,
  airControl: 0.25,
  /** Max step the controller climbs automatically (curbs are 0.15 m). */
  stepHeight: 0.35,
  maxSlopeDegrees: 50,
  /** Grace period after leaving a ledge, and how early a jump press is remembered. */
  coyoteTime: 0.12,
  jumpBuffer: 0.12,
  /** Visual turn rate toward the movement direction (rad/s). */
  turnSpeed: 12,
  spawn: [-30, 0.2, 10.8] as [number, number, number],
  /** Starting camera yaw: facing east down Main Street. */
  spawnYaw: -Math.PI / 2,
} as const;

/**
 * Animation clip names tried in order for each state. Drop-in Mixamo exports just need their clip
 * names listed here. `natural` is the ground speed (m/s) the clip was authored at, used to scale
 * playback so feet don't slide.
 */
export const PLAYER_ANIMATIONS = {
  idle: { clips: ['Idle', 'idle'], natural: 0 },
  walk: { clips: ['Walk', 'walk', 'Walking'], natural: 1.45 },
  run: { clips: ['Run', 'run', 'Running', 'Jog'], natural: 3.9 },
  sprint: { clips: ['Sprint', 'sprint', 'Run'], natural: 3.9 },
  jump: { clips: ['Jump', 'jump'], natural: 0 },
  fall: { clips: ['Fall', 'Falling', 'fall'], natural: 0 },
} as const;

export const CAMERA = {
  fov: 60,
  distance: 4.2,
  minDistance: 0.8,
  /** Orbit pivot height above the feet. */
  pivotHeight: 1.55,
  /** Over-the-shoulder offset to the right. */
  shoulder: 0.45,
  pitchMin: -0.55,
  pitchMax: 1.2,
  startPitch: 0.12,
  /** Space kept between the camera and any wall it would clip into. */
  collisionMargin: 0.3,
  /** How fast the camera eases back out after a wall stops blocking it (m/s). */
  returnSpeed: 4,
  /** Vertical pivot smoothing so curb steps don't jolt the view (1/s). */
  pivotSmoothing: 14,
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
  map: ['KeyM'],
} as const;

export const INPUT = {
  /** Radians of camera rotation per pixel of mouse movement. */
  mouseSensitivity: 0.0022,
  /** Radians per pixel of touch drag on the look area. */
  touchSensitivity: 0.005,
  /** Joystick deflection (0–1) above which the player runs instead of walks. */
  joystickRunThreshold: 0.6,
} as const;

/** Flying Car EV handling. Forces in newtons, masses in kg, angles in radians. */
export const VEHICLE = {
  /** Body mass, plus a low battery-pack mass that keeps the center of gravity down. */
  bodyMass: 900,
  batteryMass: 850,
  /** All-wheel drive split: share of engine force sent to the rear axle. */
  rearBias: 0.6,
  maxEngineForce: 8500,
  reverseForce: 3200,
  brakeForce: 45,
  handbrakeForce: 90,
  /** Rolling + aerodynamic resistance: F = rolling + drag * v². */
  rollingResistance: 120,
  aeroDrag: 0.42,
  maxSteer: 0.55,
  /** Steering is reduced to this fraction at highSpeedSteerAt (m/s). */
  highSpeedSteerFactor: 0.35,
  highSpeedSteerAt: 35,
  /** How fast the wheels turn toward the requested angle (rad/s). */
  steerRate: 2.6,
  wheelRadius: 0.36,
  suspensionRestLength: 0.22,
  suspensionStiffness: 32,
  suspensionCompression: 3.2,
  suspensionRelaxation: 4.2,
  maxSuspensionTravel: 0.2,
  maxSuspensionForce: 60000,
  frictionSlip: 2.2,
  /** Rear grip multiplier while the handbrake is held (lets the tail slide). */
  handbrakeGrip: 0.45,
  sideFrictionStiffness: 1,
  /** Range on a full battery at steady throttle, in real seconds of full-throttle driving. */
  batteryFullThrottleSeconds: 720,
  /** Collision impulses (N·s) below this don't damage the car. */
  damageThreshold: 6000,
  /** Damage per N·s above the threshold (damage runs 0–100). */
  damagePerImpulse: 0.0012,
  /** At 100 damage: engine force multiplier and a constant steering pull (rad). */
  damagedEngineFactor: 0.45,
  damagedSteerPull: 0.08,
  /** How close (m) the player must be to any side of the car's body to get in. */
  enterDistance: 3,
} as const;

export const CHASE_CAMERA = {
  distance: 6.2,
  height: 1.9,
  lookHeight: 1.1,
  /** Camera position follow stiffness (1/s); higher = tighter. */
  stiffness: 6,
  fovBase: 60,
  fovAtSpeed: 72,
  fovSpeed: 45,
  /** Seconds after manual look input before the camera swings back behind the car. */
  recenterDelay: 1.6,
} as const;

/** Speed units for the HUD: 'mph' (US setting) or 'kmh'. */
export const HUD_UNITS: 'mph' | 'kmh' = 'mph';

/** Body and calories. Everything is in game time (1 real second = 1 game minute). */
export const BODY = {
  startWeightKg: 68,
  heightM: 1.72,
  age: 24,
  /** kcal burned per game minute on top of resting metabolism, by movement. */
  activityKcalPerMinute: { walk: 4, run: 10, sprint: 14, drive: 0.4 },
  /** Real physiology: ~7700 kcal of surplus per kg. Multiplied so changes show within play. */
  kcalPerKg: 7700,
  weightChangeSpeed: 5,
  minWeightKg: 40,
  maxWeightKg: 160,
  /** BMI bands (WHO). */
  bmi: { underweight: 18.5, overweight: 25, obese: 30 },
  /** Movement multipliers by band: [run, sprint, jump]. */
  movement: {
    underweight: [0.95, 0.9, 0.95],
    healthy: [1, 1, 1],
    overweight: [0.95, 0.88, 0.9],
    obese: [0.85, 0.72, 0.75],
  },
  /** Extra energy drain per game hour when not at a healthy weight. */
  unhealthyEnergyDrainPerHour: 1.5,
  /** Visual body width at the extremes of BMI (1 = model as authored). */
  widthAtBmi: { low: 15, lowScale: 0.88, high: 40, highScale: 1.6 },
} as const;
