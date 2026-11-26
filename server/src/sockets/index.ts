import type { Server, Socket } from 'socket.io';
import { findRoom } from '../../../shared/buildings';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type ChatMessage,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type Stroke,
} from '../../../shared/types';
import { ANON_ID, ipFrom, loadUser } from '../lib/auth';
import { banNotice } from '../lib/bans';
import { presence } from '../lib/presence';
import { emitToUser, markOffline, markOnline } from '../lib/realtime';
import { DirectMessage } from '../models/DirectMessage';
import { Message } from '../models/Message';
import { StrokeModel } from '../models/Stroke';
import { User, displayNameOf } from '../models/User';
import { toDM } from '../routes/dms';

export interface SocketData {
  me?: { publicId: string; displayName: string; isAdmin: boolean };
  ip: string;
  rooms: Set<string>;
  lastChatAt: number;
  lastDmAt: number;
  strokeTimes: number[];
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type S = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const CHAT_HISTORY = 50;
const BOARD_HISTORY = 2000;
const TOOLS = new Set(['pen', 'line', 'rect', 'ellipse']);

function toChat(doc: { _id: unknown; roomId: string; authorId: string; authorName: string; text: string; createdAt?: Date }): ChatMessage {
  return {
    id: String(doc._id),
    roomId: doc.roomId,
    author: { publicId: doc.authorId, displayName: doc.authorName },
    text: doc.text,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

function validStroke(s: Stroke): boolean {
  return (
    !!s &&
    typeof s.id === 'string' &&
    s.id.length <= 64 &&
    TOOLS.has(s.tool) &&
    typeof s.color === 'string' &&
    s.color.length <= 20 &&
    typeof s.width === 'number' &&
    s.width >= 1 &&
    s.width <= 60 &&
    Array.isArray(s.points) &&
    s.points.length >= 1 &&
    s.points.length <= 5000 &&
    s.points.every(
      (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Math.abs(p.x) <= BOARD_WIDTH * 2 && Math.abs(p.y) <= BOARD_HEIGHT * 2,
    )
  );
}

export function registerSockets(io: IO) {
  const broadcastPresence = (roomId: string) => io.to(roomId).emit('room:presence', presence.snapshot(roomId));

  io.on('connection', (socket: S) => {
    socket.data.ip = ipFrom(socket.handshake.headers['x-forwarded-for'], socket.handshake.address);
    socket.data.rooms = new Set();
    socket.data.lastChatAt = 0;
    socket.data.lastDmAt = 0;
    socket.data.strokeTimes = [];

    const requireMe = () => {
      if (!socket.data.me) socket.emit('error:message', 'Say hello first.');
      return socket.data.me;
    };
    const inRoom = (roomId: string) => socket.data.rooms.has(roomId);

    socket.on('session:hello', async ({ anonId }, ack) => {
      try {
        if (typeof anonId !== 'string' || !ANON_ID.test(anonId)) return;
        const { user, ban } = await loadUser(anonId, socket.data.ip);
        if (ban) {
          socket.emit('banned', banNotice(ban));
          socket.disconnect(true);
          return;
        }
        if (socket.data.me) markOffline(socket.data.me.publicId, socket.id);
        socket.data.me = { publicId: user.publicId, displayName: displayNameOf(user), isAdmin: !!user.isAdmin };
        markOnline(user.publicId, socket.id);
        ack?.({
          publicId: user.publicId,
          displayName: displayNameOf(user),
          major: user.major ?? undefined,
          status: (user.status as 'commuter' | 'resident' | undefined) ?? undefined,
          lookingFor: user.lookingFor as never,
          hasDisplayName: !!user.displayName?.trim(),
          isAdmin: !!user.isAdmin,
        });
      } catch (err) {
        console.error('session:hello', err);
      }
    });

    socket.on('room:join', async ({ roomId }) => {
      const me = requireMe();
      if (!me || !findRoom(roomId) || inRoom(roomId)) return;
      socket.join(roomId);
      socket.data.rooms.add(roomId);
      presence.join(roomId, socket.id, me);
      broadcastPresence(roomId);

      try {
        const [messages, strokes] = await Promise.all([
          Message.find({ roomId }).sort({ createdAt: -1 }).limit(CHAT_HISTORY).lean(),
          StrokeModel.find({ roomId, tool: { $ne: 'eraser' } }).sort({ createdAt: -1 }).limit(BOARD_HISTORY).lean(),
        ]);
        socket.emit('chat:history', { roomId, messages: messages.reverse().map(toChat) });
        socket.emit('board:history', {
          roomId,
          strokes: strokes.reverse().map((s) => ({
            id: s.strokeId,
            authorId: s.authorId,
            authorName: s.authorName ?? undefined,
            tool: s.tool as Stroke['tool'],
            color: s.color,
            width: s.width,
            points: s.points.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })),
            ...(s.locked ? { locked: true } : {}),
          })),
        });
      } catch (err) {
        console.error('room:join history', err);
      }
    });

    socket.on('room:leave', ({ roomId }) => {
      if (!inRoom(roomId)) return;
      socket.leave(roomId);
      socket.data.rooms.delete(roomId);
      presence.leave(roomId, socket.id);
      broadcastPresence(roomId);
    });

    socket.on('chat:send', async ({ roomId, text }) => {
      const me = requireMe();
      if (!me || !inRoom(roomId) || typeof text !== 'string') return;
      const clean = text.trim().slice(0, 1000);
      if (!clean) return;
      const now = Date.now();
      if (now - socket.data.lastChatAt < 400) return socket.emit('error:message', 'Slow down a little.');
      socket.data.lastChatAt = now;

      try {
        const doc = await Message.create({ roomId, authorId: me.publicId, authorName: me.displayName, text: clean });
        io.to(roomId).emit('chat:message', toChat(doc));
      } catch (err) {
        console.error('chat:send', err);
      }
    });

    socket.on('board:stroke', async ({ roomId, stroke }) => {
      const me = requireMe();
      if (!me || !inRoom(roomId) || !validStroke(stroke)) return;
      // At most 60 strokes per 5 seconds per connection (pasting sends several at once).
      const now = Date.now();
      socket.data.strokeTimes = socket.data.strokeTimes.filter((t) => now - t < 5000);
      if (socket.data.strokeTimes.length >= 60) return;
      socket.data.strokeTimes.push(now);

      // The server decides who the author is — clients can't draw "as" someone else.
      const saved: Stroke = {
        id: stroke.id,
        authorId: me.publicId,
        authorName: me.displayName,
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map(({ x, y }) => ({ x, y })),
        ...(stroke.locked === true ? { locked: true } : {}),
      };
      socket.to(roomId).emit('board:stroke', { roomId, stroke: saved });
      try {
        await StrokeModel.create({
          roomId,
          strokeId: saved.id,
          authorId: saved.authorId,
          authorName: saved.authorName,
          tool: saved.tool,
          color: saved.color,
          width: saved.width,
          points: saved.points,
          locked: !!saved.locked,
        });
      } catch (err) {
        console.error('board:stroke', err);
      }
    });

    /** Erase strokes: yours, anyone's unlocked ink, or (admins) anything. Locked ink of others is refused. */
    socket.on('board:erase', async ({ roomId, strokeIds }) => {
      const me = requireMe();
      if (!me || !inRoom(roomId) || !Array.isArray(strokeIds)) return;
      const ids = strokeIds.filter((id) => typeof id === 'string').slice(0, 500);
      if (ids.length === 0) return;
      const filter = me.isAdmin
        ? { roomId, strokeId: { $in: ids } }
        : { roomId, strokeId: { $in: ids }, $or: [{ authorId: me.publicId }, { locked: { $ne: true } }] };
      const allowed = await StrokeModel.find(filter, { strokeId: 1 }).lean();
      if (allowed.length === 0) return;
      const allowedIds = allowed.map((s) => s.strokeId);
      await StrokeModel.deleteMany({ roomId, strokeId: { $in: allowedIds } });
      io.to(roomId).emit('board:removed', { roomId, strokeIds: allowedIds });
      if (allowedIds.length < ids.length) socket.emit('error:message', "Some ink is unerasable — only its author can erase it.");
    });

    socket.on('board:update', async ({ roomId, strokes }) => {
      const me = requireMe();
      if (!me || !inRoom(roomId) || !Array.isArray(strokes)) return;
      const incoming = strokes.slice(0, 500).filter(validStroke);
      if (incoming.length === 0) return;
      const filter = me.isAdmin
        ? { roomId, strokeId: { $in: incoming.map((s) => s.id) } }
        : { roomId, strokeId: { $in: incoming.map((s) => s.id) }, $or: [{ authorId: me.publicId }, { locked: { $ne: true } }] };
      const existing = new Map((await StrokeModel.find(filter).lean()).map((s) => [s.strokeId, s]));
      const updated: Stroke[] = [];
      for (const s of incoming) {
        const old = existing.get(s.id);
        if (!old) continue;
        const points = s.points.map(({ x, y }) => ({ x, y }));
        await StrokeModel.updateOne({ _id: old._id }, { $set: { points, tool: s.tool } });
        // Author, color, width and lock stay as they were: only the shape changes.
        updated.push({
          id: old.strokeId,
          authorId: old.authorId,
          authorName: old.authorName ?? undefined,
          tool: s.tool,
          color: old.color,
          width: old.width,
          points,
          ...(old.locked ? { locked: true } : {}),
        });
      }
      if (updated.length) socket.to(roomId).emit('board:updated', { roomId, strokes: updated });
      if (updated.length < incoming.length) socket.emit('error:message', "Some ink is unerasable — only its author can move it.");
    });

    socket.on('board:undo', async ({ roomId }) => {
      const me = requireMe();
      if (!me || !inRoom(roomId)) return;
      const last = await StrokeModel.findOneAndDelete({ roomId, authorId: me.publicId }, { sort: { createdAt: -1 } });
      if (last) io.to(roomId).emit('board:removed', { roomId, strokeIds: [last.strokeId] });
    });

    socket.on('board:clear-mine', async ({ roomId }) => {
      const me = requireMe();
      if (!me || !inRoom(roomId)) return;
      const mine = await StrokeModel.find({ roomId, authorId: me.publicId }, { strokeId: 1 }).lean();
      if (mine.length === 0) return;
      await StrokeModel.deleteMany({ roomId, authorId: me.publicId });
      io.to(roomId).emit('board:removed', { roomId, strokeIds: mine.map((s) => s.strokeId) });
    });

    socket.on('dm:send', async ({ to, text }, ack) => {
      const me = requireMe();
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!me) return reply({ error: 'Not connected' });
      if (typeof to !== 'string' || to === me.publicId || typeof text !== 'string') return reply({ error: 'Bad message' });
      const clean = text.trim().slice(0, 1000);
      if (!clean) return reply({ error: 'Empty message' });
      const now = Date.now();
      if (now - socket.data.lastDmAt < 400) return reply({ error: 'Slow down a little.' });
      socket.data.lastDmAt = now;
      try {
        if (!(await User.exists({ publicId: to }))) return reply({ error: 'User not found' });
        const dm = toDM(await DirectMessage.create({ from: me.publicId, to, text: clean }));
        emitToUser(to, 'dm:message', dm);
        // Your other tabs see it too.
        for (const id of io.sockets.sockets.keys()) {
          const other = io.sockets.sockets.get(id);
          if (other && other.id !== socket.id && other.data.me?.publicId === me.publicId) other.emit('dm:message', dm);
        }
        reply(dm);
      } catch (err) {
        console.error('dm:send', err);
        reply({ error: 'Could not send' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.me) markOffline(socket.data.me.publicId, socket.id);
      for (const roomId of socket.data.rooms) {
        presence.leave(roomId, socket.id);
        broadcastPresence(roomId);
      }
    });
  });
}
