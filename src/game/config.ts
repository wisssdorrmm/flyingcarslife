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

/** Bright, dusty West Coast midday (CLAUDE.md §10). */
export const WORLD_LIGHTING = {
  sunIntensity: 4.2,
  sunColor: '#ffeccc',
  /** The HDRI already contains the sun; keep IBL lower so it isn't counted twice. */
  environmentIntensity: 0.7,
  backgroundIntensity: 1,
  /**
   * Sky rotation about +Y (rad). Puts the HDRI sun in the north, so looking south toward the
   * hills and the HARBOR HILLS sign you have the sun at your back and they are front-lit.
   */
  skyRotation: 2.16,
  exposure: 0.92,
  /** Blue-grey atmospheric haze (exponential, so far towers soften but never vanish). */
  fogColor: '#aebfcf',
  fogDensity: 0.0016,
  /** Warm dusty grade, applied in linear light before tone mapping. */
  grade: {
    /** Per-channel white balance gain (warm = more red, less blue). */
    gain: [1.06, 1.0, 0.9] as [number, number, number],
    /** Dusty lift added to shadows, linear RGB. */
    lift: [0.012, 0.009, 0.005] as [number, number, number],
    saturation: 0.94,
    contrast: 1.06,
  },
} as const;

/** OpenStreetMap city tiles (src/game/city/CityTiles.tsx). */
export const CITY_STREAMING = {
  /** Tiles whose square is within this distance (m) of the car are drawn. */
  viewRadius: { low: 330, medium: 450, high: 600, ultra: 750 },
  /** Extra view radius while flying (you can see much further from the air). */
  flyingBonus: 300,
  /** Loaded tiles are dropped once this much further than the view radius. */
  unloadMargin: 150,
  /** Tiles this close get trimesh colliders. */
  physicsRadius: 140,
  maxConcurrentLoads: 3,
  /** Seconds between streaming checks. */
  checkInterval: 0.3,
  /** Tiles loaded around the spawn before the game starts (m). */
  preloadRadius: 260,
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
  social: ['KeyX'],
  camera: ['KeyC'],
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

/**
 * Arcade handling layered on the raycast vehicle (vehicles/arcadeHandling.ts): the wheels give
 * suspension and drive force; sideways grip and turning come from this model.
 */
export const DRIVING = {
  /** Rapier wheel friction: forward traction, and sideways (kept low, the arcade layer grips). */
  wheelTraction: 3,
  wheelSideFriction: 0.2,
  engineForce: 15000,
  reverseForce: 6500,
  /** Rapier wheel brake strength (service brakes, handbrake on the rear). */
  brakeForce: 70,
  handbrakeForce: 35,
  /** Resistance F = rolling + drag·v²; top speed ≈ √(engineForce / drag). */
  rolling: 160,
  drag: 2.6,
  /** Extra down force per (m/s)² so the car stays planted at speed. */
  downforce: 1.3,
  /** Lateral grip: how fast sideways velocity dies out (1/s), normal and drifting. */
  grip: 9,
  driftGrip: 1.15,
  /** Seconds for grip to come back after a drift. */
  gripRecovery: 0.7,
  /** Yaw: target rate = speed / radius, radius = base + perMs·speed, capped. */
  turnRadiusBase: 5.5,
  turnRadiusPerMs: 0.3,
  yawRateMax: 2.5,
  /** How tightly the car follows the target yaw rate (1/s). */
  yawResponse: 7,
  /** Extra rotation while drifting. */
  driftYawBoost: 1.7,
  /** Share of the sideways speed lost in a drift that carries on as forward speed. */
  driftCarry: 0.6,
  /** ESP keeps the slide angle under this (rad). */
  espMaxSlip: 0.55,
  /** TCS off: full throttle below this speed (m/s) breaks rear grip (power slides). */
  tcsOffSlipSpeed: 14,
  /** ABS off: grip multiplier while braking hard above 10 m/s. */
  absOffGrip: 0.35,
  /** Six gears: top speed (m/s) and force multiplier. */
  gearTop: [14, 24, 34, 45, 58, 76],
  gearForce: [1.35, 1.15, 1.0, 0.9, 0.8, 0.72],
  /** Airborne: how fast the car levels itself (1/s). */
  airLevel: 2.2,
  /** Upside down and slow for this long → flipped back onto its wheels. */
  autoFlipSeconds: 2.2,
} as const;

/** Drift scoring (vehicles/drift.ts). */
export const DRIFT = {
  minSpeed: 8,
  /** Slide angle (rad) that counts as drifting (~14°). */
  minSlip: 0.25,
  /** Points per second = speed · slip factor · this. */
  pointsRate: 9,
  /** Every this many seconds of unbroken drifting adds ×1, up to maxMultiplier. */
  comboStep: 2.2,
  maxMultiplier: 5,
  /** Drift banks after this long without sliding. */
  endAfter: 1.1,
  /** Cash paid per banked point (after the multiplier). */
  cashPerPoint: 0.05,
} as const;

/** AI traffic (src/game/traffic). Speeds in m/s. */
export const TRAFFIC = {
  /** Cars kept around the player, by quality tier. */
  count: { low: 14, medium: 24, high: 34, ultra: 44 },
  /** Share of spawns that are buses (on bus routes only). */
  busShare: 0.15,
  spawnMin: 90,
  spawnMax: 330,
  despawn: 420,
  /** Agents within this distance get collision bodies. */
  physicsRadius: 90,
  /** Cruising speed by road class. */
  speed: { major: 15, minor: 13, residential: 10, service: 6 },
  /** Intelligent-driver model: max accel, comfortable braking, min gap (m), time headway (s). */
  accel: 2.4,
  brake: 4,
  minGap: 2.5,
  headway: 1.3,
  /** Signal cycle per approach: green, yellow, all-red (s). */
  green: 11,
  yellow: 3,
  allRed: 1.2,
  /** A hit harder than this (N·s) wrecks an AI car (it becomes a physics body). */
  wreckImpulse: 2500,
  /** Seconds a wreck stays before it's cleared. */
  wreckSeconds: 25,
} as const;

/** Pedestrians on the sidewalks (src/game/npc). */
export const PEDESTRIANS = {
  count: { low: 6, medium: 12, high: 20, ultra: 28 },
  spawnMin: 25,
  spawnMax: 130,
  despawn: 170,
  walkSpeed: 1.35,
  runSpeed: 4.2,
  /** Distance from the road edge to the walking line (m). */
  sidewalkOffset: 1.7,
  /** A car closer than this and faster than fleeSpeed (m/s), heading at them, scares them. */
  fleeDistance: 11,
  fleeSpeed: 5,
  fleeSeconds: 2.6,
  /** Hit by the car: down for this long. */
  hitDistance: 1.7,
  downSeconds: 4,
  /** Full animation updates within this range; further ones update less often. */
  animRange: 55,
  /** A rocket launch this close makes people stop, look up and point (some film it). */
  lookRadius: 40,
  lookSeconds: 7,
  phoneShare: 0.35,
} as const;

/**
 * Rocket launch and flight (vehicles/flight.ts, CLAUDE.md §6.2) — the `flying` tuning block.
 * Speeds in m/s, times in s, angles in degrees, battery in % per second.
 */
export const FLYING = {
  noseUpDeg: 82,
  noseUpTime: 0.4,
  keepForwardVel: 0.4,
  climbAccel: 30,
  climbMaxSpeed: 60,
  tumbleTime: 2.0,
  tumbleRotations: 1.5,
  stabilizeTime: 0.6,
  flightMaxSpeed: 70,
  maxAltitude: 400,
  autoLandHeight: 6,
  batteryDrainPerSec: 0.8,
  /** Each flight lasts this long (s, from the launch); then the car comes down by itself. */
  flightSeconds: 10,
  /** Sink rate once time is up (eases off near the ground for the auto-landing). */
  timeUpSink: 28,
  // Derived feel (not in the spec list):
  /** Battery % a launch costs. */
  launchCost: 4,
  flightAccel: 16,
  reverseSpeed: 10,
  /** Climb / descend speed, and the gentle climb right after stabilizing. */
  climbSpeed: 16,
  gentleClimb: 3,
  /** Turn rate (rad/s) and the automatic bank / climb pitch (rad). */
  yawRate: 1.3,
  bankAngle: 0.5,
  pitchAngle: 0.18,
  /** Empty battery: forward speed and sink rate while gliding down. */
  glideSpeed: 14,
  glideSink: 3.5,
  /** Camera: distance/height in flight, and during the launch (further back, looking up). */
  cameraDistance: 11,
  cameraHeight: 3.4,
  launchCameraDistance: 17,
} as const;

/** Debug test scenes for the rocket launch (src/game/debug, `?debug` panel). Local meters. */
export const TEST_SCENES = {
  /** Multi-level rooftop car park, built on the surface lot at Fisherman's Wharf. */
  carPark: {
    /** Center of the footprint and its size (x across, z along the ramps). */
    x: -223,
    z: -377,
    width: 40,
    length: 60,
    levels: 3,
    levelHeight: 3.4,
    /** Strip on the +x side where the ramps climb (m). */
    rampWidth: 9,
  },
  /** "Bridge launch": The Embarcadero heading south toward the Ferry Building and downtown towers. */
  bridge: { street: 'The Embarcadero', near: [1450, 520] as [number, number] },
  /** The police car starts this far behind the player. */
  policeBehind: 22,
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
export const HUD_UNITS: 'mph' | 'kmh' = 'kmh';

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

/** Online play. Rooms are copies of the city; players only see others in the same room. */
export const NET = {
  roomCapacity: 60,
  /** Movement updates sent per second. */
  stateRate: 10,
  /** Remote players are drawn this far in the past (s) so they can be interpolated smoothly. */
  interpolationDelay: 0.12,
  /** A player who hasn't sent anything for this long (s) is dropped. */
  timeout: 8,
  /** Name tags show within this range (m). */
  nameTagRange: 60,
  /** Other players beyond this range (m) aren't drawn or animated. */
  drawRange: 150,
  chat: { maxLength: 140, minIntervalMs: 1000, bubbleSeconds: 6, historySize: 60 },
  voice: { range: 25, maxPeers: 6 },
  /** How close (m) another player must be to interact (X). */
  interactRange: 4,
  /** Unanswered requests expire after this many seconds. */
  requestTimeout: 20,
} as const;

/** Simulated players for trying the social features before real players exist. */
export const DEMO_PLAYERS = {
  /** Count when playing locally (no Supabase); `?bots=N` overrides, 0 turns them off. */
  localCount: 24,
  /** Count when online with real players (off by default). */
  onlineCount: 0,
  walkSpeed: [1.25, 1.6] as [number, number],
  jogSpeed: 3.4,
  /** Demo players chat only when you're within this range (m). */
  chatRange: 35,
  /** Seconds between unprompted chat lines from the crowd. */
  chatEvery: 22,
  acceptChance: 0.85,
} as const;

/** Harbor City look: wear, dirt, palms and hills (CLAUDE.md §10). */
export const STYLE = {
  /** Sun-faded light grey asphalt; each road gets a slightly different tint. */
  asphaltTint: '#d7d3cc',
  asphaltTintVariation: 0.1,
  /** Light concrete sidewalk slabs. */
  pavingTint: '#b2aca2',
  curbTint: '#cfc9be',
  decals: {
    /** Average road decals (cracks, patches, seams, oil, tire marks) per meter of road. */
    roadPerMeter: 0.55,
    /** Average sidewalk decals (stains, gum, cracks, litter) per meter of block side. */
    sidewalkPerMeter: 0.45,
    /** Decals are chunked; chunks farther than this (m) are hidden. */
    visibleDistance: { low: 70, medium: 110, high: 160, ultra: 220 },
  },
  /** Chance a corner gets a red no-parking curb, and its length (m). */
  redCurbChance: 0.6,
  redCurbLength: [5, 9] as [number, number],
  palms: {
    /** Spacing along the avenues (m). */
    spacing: 16,
    tallHeight: [13, 19] as [number, number],
    shortHeight: [4.5, 7] as [number, number],
    /** Crown sway at the top of a palm (m) and its speed (rad/s). */
    swayAmplitude: 0.22,
    swaySpeed: 0.85,
    /** Palms are tall and read from afar, but still get culled per chunk. */
    visibleDistance: { low: 140, medium: 220, high: 320, ultra: 420 },
  },
  hills: {
    /** Ring of dry hills around the city: inner foot and outer ridge radius (m). */
    innerRadius: 760,
    outerRadius: 1350,
    /** Peak height behind the hillside sign (south) and elsewhere (m). */
    peakHeight: 230,
    baseHeight: 95,
    /** Exponential haze density for the backdrop (it ignores scene fog). */
    hazeDensity: 0.0003,
    treeCount: 2200,
    /** The hillside sign faces the city straight down 1st Ave (angle from +x toward +z). */
    sign: { text: 'HARBOR HILLS', letterHeight: 30, angle: Math.PI * 0.5, radius: 930 },
  },
} as const;

/** Bystander "Phone camera" mode: vertical filming and clip recording (CLAUDE.md §10). */
export const PHONE_CAM = {
  /** Eye height and how far in front of the face the phone is held (m). */
  eyeHeight: 1.58,
  holdDistance: 0.32,
  /** Vertical field of view, roughly a phone's main camera. */
  fov: 68,
  pitchMin: -1.35,
  pitchMax: 1.35,
  /** Handheld shake: rotation (rad) and position (m) amplitude. */
  shakeRotation: 0.0045,
  shakePosition: 0.004,
  /** Auto-exposure: exposure when looking at the ground vs at the sky, and adapt rate (1/s). */
  exposureGround: 1.12,
  exposureSky: 0.82,
  exposureAdapt: 1.6,
  /** Focus hunt blur (px) when filming starts or the view swings fast, and its decay (1/s). */
  focusBlur: 5,
  focusDecay: 3.5,
  /** Look speed (rad/s) above which focus hunts again. */
  refocusTurnRate: 2.2,
  /** Recorded clip size (9:16) and limits. */
  clipWidth: 720,
  clipHeight: 1280,
  clipFps: 30,
  maxClipSeconds: 20,
  videoBitsPerSecond: 6_000_000,
  watermark: 'Flying Cars Life',
} as const;
