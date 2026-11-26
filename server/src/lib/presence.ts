import type { RoomPresence } from '../../../shared/types';

interface Member {
  publicId: string;
  displayName: string;
}

/** In-memory "who is in which chatroom right now". Resets on server restart, which is fine. */
class Presence {
  private rooms = new Map<string, Map<string, Member>>(); // roomId → socketId → member

  join(roomId: string, socketId: string, member: Member) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Map());
    this.rooms.get(roomId)!.set(socketId, member);
  }

  leave(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    room?.delete(socketId);
    if (room && room.size === 0) this.rooms.delete(roomId);
  }

  /** Unique people (one person with two tabs counts once). */
  snapshot(roomId: string): RoomPresence {
    const unique = new Map<string, Member>();
    for (const m of this.rooms.get(roomId)?.values() ?? []) unique.set(m.publicId, m);
    const users = [...unique.values()];
    return { roomId, count: users.length, users };
  }

  count(roomId: string): number {
    return this.snapshot(roomId).count;
  }
}

export const presence = new Presence();
