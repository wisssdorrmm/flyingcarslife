/**
 * Device detection + quality tiers (CLAUDE.md §9).
 * Detection is a best-effort heuristic; the player can override it in settings
 * (persisted in localStorage) or with `?quality=low|medium|high|ultra` in the URL.
 */

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySettings {
  tier: QualityTier;
  /** Device pixel ratio range passed to the R3F canvas. */
  dpr: [number, number];
  targetFps: number;
  /** Max texture edge in pixels; the asset loader picks the matching variant. */
  textureSize: 512 | 1024 | 2048 | 4096;
  shadows: boolean;
  shadowMapSize: number;
  shadowCascades: number;
  /** Half-size in meters of the area around the camera that receives sun shadows. */
  shadowExtent: number;
  antialias: 'fxaa' | 'smaa';
  bloom: boolean;
  ssao: boolean;
  colorGrading: boolean;
  motionBlur: boolean;
  /** Draw-call budget for profiling warnings. */
  maxDrawCalls: number;
  /** City chunks kept loaded around the player (radius in chunks). */
  chunkRadius: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    dpr: [0.75, 1],
    targetFps: 30,
    textureSize: 512,
    shadows: true,
    shadowMapSize: 1024,
    shadowCascades: 1,
    shadowExtent: 35,
    antialias: 'fxaa',
    bloom: false,
    ssao: false,
    colorGrading: false,
    motionBlur: false,
    maxDrawCalls: 300,
    chunkRadius: 1,
  },
  medium: {
    tier: 'medium',
    dpr: [1, 1.5],
    targetFps: 45,
    textureSize: 1024,
    shadows: true,
    shadowMapSize: 2048,
    shadowCascades: 2,
    shadowExtent: 50,
    antialias: 'smaa',
    bloom: true,
    ssao: false,
    colorGrading: false,
    motionBlur: false,
    maxDrawCalls: 500,
    chunkRadius: 2,
  },
  high: {
    tier: 'high',
    dpr: [1, 2],
    targetFps: 60,
    textureSize: 2048,
    shadows: true,
    shadowMapSize: 4096,
    shadowCascades: 3,
    shadowExtent: 70,
    antialias: 'smaa',
    bloom: true,
    ssao: true,
    colorGrading: false,
    motionBlur: false,
    maxDrawCalls: 800,
    chunkRadius: 2,
  },
  ultra: {
    tier: 'ultra',
    dpr: [1, 2],
    targetFps: 60,
    textureSize: 4096,
    shadows: true,
    shadowMapSize: 4096,
    shadowCascades: 4,
    shadowExtent: 90,
    antialias: 'smaa',
    bloom: true,
    ssao: true,
    colorGrading: true,
    motionBlur: true,
    maxDrawCalls: 1200,
    chunkRadius: 3,
  },
};

const STORAGE_KEY = 'fcl.quality';

export interface DeviceInfo {
  isMobile: boolean;
  isTouch: boolean;
  cores: number;
  /** GB, Chrome-only API; undefined elsewhere. */
  memory: number | undefined;
  gpu: string;
  screenPixels: number;
}

function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as readonly string[]).includes(value);
}

function readGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(renderer ?? 'unknown').toLowerCase();
  } catch {
    return 'unknown';
  }
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  // iPadOS reports a desktop Mac UA; touch support gives it away.
  const isIPad = /Macintosh/.test(ua) && isTouch;
  const isMobile = /Android|iPhone|iPod|iPad|Mobile|Silk|Kindle/i.test(ua) || isIPad;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    isMobile,
    isTouch,
    cores: navigator.hardwareConcurrency || 4,
    memory: nav.deviceMemory,
    gpu: readGpuRenderer(),
    screenPixels: window.screen.width * window.screen.height * (window.devicePixelRatio || 1) ** 2,
  };
}

const LOW_END_GPU =
  /(mali-[4-7]|mali-g(31|51|52|57)|adreno \(tm\) [2-5]\d\d|adreno [2-5]\d\d|powervr|sgx|intel\(r\) (hd|uhd) graphics [2-6]\d\d|swiftshader|llvmpipe|software)/;
// Only clearly modern discrete / Apple Pro-class GPUs earn Ultra; older "Radeon Pro" laptop chips don't.
const HIGH_END_GPU =
  /(rtx [2-9]\d{3}|radeon rx [6-9]\d{3}|radeon pro w[6-9]|apple m[1-9] (pro|max|ultra)|apple m[3-9])/;
// Older mid-range laptop GPUs: playable at Medium, not High.
const MID_LAPTOP_GPU =
  /(radeon pro [4-5]\d{2}|radeon pro vega|intel\(r\) (iris|uhd)|geforce (gtx|mx) ?[1-9]\d{2}\b)/;

/** Pick a tier from device signals. Conservative: when in doubt, go lower. */
export function detectTier(info: DeviceInfo = detectDevice()): QualityTier {
  const { isMobile, cores, memory, gpu } = info;

  if (gpu === 'none' || LOW_END_GPU.test(gpu)) return 'low';

  if (isMobile) {
    // Recent iPhones/flagship Android can handle medium; everything else stays low.
    const strongPhone = cores >= 6 && (memory === undefined || memory >= 6);
    const flagshipGpu =
      /apple gpu|adreno \(tm\) (7[3-9]\d|8\d\d)|adreno (7[3-9]\d|8\d\d)|mali-g(7[1-9]|7\d\d)|immortalis/.test(
        gpu,
      );
    return strongPhone && flagshipGpu ? 'medium' : 'low';
  }

  if (memory !== undefined && memory <= 4) return 'medium';
  if (MID_LAPTOP_GPU.test(gpu)) return 'medium';
  if (HIGH_END_GPU.test(gpu) && cores >= 8) return 'ultra';
  if (cores >= 6) return 'high';
  return 'medium';
}

/** URL override > saved player choice > auto-detect. */
export function resolveInitialTier(): QualityTier {
  const fromUrl = new URLSearchParams(window.location.search).get('quality');
  if (isQualityTier(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isQualityTier(saved)) return saved;
  } catch {
    // Storage blocked (private mode etc.) — fall through to detection.
  }
  return detectTier();
}

export function saveTierChoice(tier: QualityTier | null): void {
  try {
    if (tier) localStorage.setItem(STORAGE_KEY, tier);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal: the choice just won't persist.
  }
}

/**
 * Debug-only per-setting overrides from the URL, e.g. `?ssao=0&shadowMapSize=2048`.
 * Lets us tune individual costs on real devices without a settings UI.
 */
export function applyUrlOverrides(base: QualitySettings): QualitySettings {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('debug')) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, raw] of params) {
    if (!(key in base) || key === 'tier') continue;
    const current = out[key];
    if (typeof current === 'boolean') out[key] = raw === '1' || raw === 'true';
    else if (typeof current === 'number' && Number.isFinite(Number(raw))) out[key] = Number(raw);
    else if (typeof current === 'string') out[key] = raw;
  }
  return out as unknown as QualitySettings;
}
