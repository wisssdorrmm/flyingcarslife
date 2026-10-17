/**
 * Local save in IndexedDB (frontend only for now). Saves on events — cash changes, new streets,
 * purchases — plus once a minute and when the tab is hidden. Never every frame.
 */
import { useCareer, type CareerSnapshot } from '../game/store/career';

const DB = 'flyingcarslife';
const STORE = 'saves';
const KEY = 'career';
const VERSION = 2;

interface SaveData {
  version: number;
  savedAt: number;
  career: CareerSnapshot;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGame(): Promise<void> {
  try {
    const data: SaveData = { version: VERSION, savedAt: Date.now(), career: useCareer.getState().snapshot() };
    await withStore('readwrite', (s) => s.put(data, KEY));
  } catch (err) {
    console.warn('Save failed', err);
  }
}

export async function loadGame(): Promise<boolean> {
  try {
    const data = (await withStore('readonly', (s) => s.get(KEY))) as SaveData | undefined;
    if (!data || data.version !== VERSION) return false;
    useCareer.getState().load(data.career);
    return true;
  } catch (err) {
    console.warn('Load failed', err);
    return false;
  }
}

/** Loads the save, then saves after progress changes, once a minute, and when the tab is hidden. */
export function startAutosave(): () => void {
  void loadGame();
  let last = '';
  let timer = 0;
  const unsub = useCareer.subscribe((s) => {
    const key = `${s.cash}|${s.discovered.length}|${s.cars.length}|${s.currentCar}|${JSON.stringify(s.assists)}`;
    if (key === last) return;
    last = key;
    // Debounce bursts (e.g. drift payouts) into one write.
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveGame(), 800);
  });
  const interval = window.setInterval(() => void saveGame(), 60_000);
  const onHide = () => {
    if (document.visibilityState === 'hidden') void saveGame();
  };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsub();
    window.clearTimeout(timer);
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onHide);
  };
}
