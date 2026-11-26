import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';
import { banNotice } from './bans';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

let io: IO | null = null;
/** publicId → connected socket ids (one person can have several tabs open). */
const online = new Map<string, Set<string>>();

export const setIO = (server: unknown) => {
  io = server as IO;
};

export function markOnline(publicId: string, socketId: string) {
  if (!online.has(publicId)) online.set(publicId, new Set());
  online.get(publicId)!.add(socketId);
}

export function markOffline(publicId: string, socketId: string) {
  const set = online.get(publicId);
  set?.delete(socketId);
  if (set && set.size === 0) online.delete(publicId);
}

export const isOnline = (publicId: string) => online.has(publicId);

export function emitToUser<E extends keyof ServerToClientEvents>(
  publicId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  if (!io) return;
  for (const id of online.get(publicId) ?? []) io.to(id).emit(event, ...args);
}

/** Immediately disconnect everyone covered by a new ban (by user or by IP). Admins are skipped. */
export function kickBanned(ban: { kind: string; value: string; reason?: string | null; until?: Date | null }) {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    const d = socket.data as { me?: { publicId: string; isAdmin?: boolean }; ip?: string };
    if (d.me?.isAdmin) continue;
    const hit = ban.kind === 'user' ? d.me?.publicId === ban.value : d.ip === ban.value;
    if (hit) {
      socket.emit('banned', banNotice(ban));
      socket.disconnect(true);
    }
  }
}
