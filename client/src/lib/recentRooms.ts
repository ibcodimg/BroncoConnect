import { useSyncExternalStore } from 'react';

const KEY = 'broncoconnect:recent-rooms';
const EVENT = 'broncoconnect:recent-rooms';
const MAX = 8;

export interface RecentRoom {
  roomId: string;
  visitedAt: number;
}

let cache: RecentRoom[] | null = null;

function read(): RecentRoom[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(v) ? v : [];
  } catch {
    cache = [];
  }
  return cache!;
}

/** Remember a room visit (most recent first, no duplicates). */
export function recordVisit(roomId: string) {
  const next = [{ roomId, visitedAt: Date.now() }, ...read().filter((r) => r.roomId !== roomId)].slice(0, MAX);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export const useRecentRooms = () => useSyncExternalStore(subscribe, read, read);
