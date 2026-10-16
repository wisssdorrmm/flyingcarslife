/**
 * Local save in IndexedDB (CLAUDE.md §5: save on events, never every frame). Cloud sync comes in
 * Phase 10; this is the guest save it will build on.
 */
import { useLife, type LifeSnapshot } from '../game/store/life';

const DB = 'flyingcarslife';
const STORE = 'saves';
const KEY = 'local';
const VERSION = 1;

interface SaveData {
  version: number;
  savedAt: number;
  life: LifeSnapshot;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function snapshot(): LifeSnapshot {
  const s = useLife.getState();
  return {
    money: s.money,
    fullness: s.fullness,
    energy: s.energy,
    mood: s.mood,
    fitness: s.fitness,
    education: s.education,
    weightKg: s.weightKg,
    minutes: s.minutes,
    kcalToday: s.kcalToday,
  };
}

export async function saveGame(): Promise<void> {
  try {
    const data: SaveData = { version: VERSION, savedAt: Date.now(), life: snapshot() };
    await withStore('readwrite', (s) => s.put(data, KEY));
  } catch (err) {
    console.warn('Save failed', err);
  }
}

export async function loadGame(): Promise<boolean> {
  try {
    const data = (await withStore('readonly', (s) => s.get(KEY))) as SaveData | undefined;
    if (!data || data.version !== VERSION) return false;
    useLife.getState().load(data.life);
    return true;
  } catch (err) {
    console.warn('Load failed', err);
    return false;
  }
}

/** Loads the save, then saves after every action, once a minute, and when the tab is hidden. */
export function startAutosave(): () => void {
  void loadGame();
  let lastMoney = useLife.getState().money;
  const unsub = useLife.subscribe((s) => {
    // Actions (purchases, workouts, sleep) change money or skip time; save right after them.
    if (s.money !== lastMoney) {
      lastMoney = s.money;
      void saveGame();
    }
  });
  const interval = window.setInterval(() => void saveGame(), 60_000);
  const onHide = () => {
    if (document.visibilityState === 'hidden') void saveGame();
  };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsub();
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onHide);
  };
}
