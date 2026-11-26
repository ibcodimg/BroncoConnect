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
import { presence } from '../lib/presence';
import { Message } from '../models/Message';
import { StrokeModel } from '../models/Stroke';
import { displayNameOf, getOrCreateUser } from '../models/User';

export interface SocketData {
  me?: { publicId: string; displayName: string };
  rooms: Set<string>;
  lastChatAt: number;
  strokeTimes: number[];
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type S = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const CHAT_HISTORY = 50;
const BOARD_HISTORY = 2000;
const TOOLS = new Set(['pen', 'line', 'rect', 'ellipse', 'eraser']);

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
    socket.data.rooms = new Set();
    socket.data.lastChatAt = 0;
    socket.data.strokeTimes = [];

    const requireMe = () => {
      if (!socket.data.me) socket.emit('error:message', 'Say hello first.');
      return socket.data.me;
    };
    const inRoom = (roomId: string) => socket.data.rooms.has(roomId);

    socket.on('session:hello', async ({ anonId }, ack) => {
      try {
        if (typeof anonId !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(anonId)) return;
        const user = await getOrCreateUser(anonId);
        socket.data.me = { publicId: user.publicId, displayName: displayNameOf(user) };
        ack?.({
          publicId: user.publicId,
          displayName: displayNameOf(user),
          major: user.major ?? undefined,
          status: (user.status as 'commuter' | 'resident' | undefined) ?? undefined,
          lookingFor: user.lookingFor as never,
          hasDisplayName: !!user.displayName?.trim(),
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
          StrokeModel.find({ roomId }).sort({ createdAt: -1 }).limit(BOARD_HISTORY).lean(),
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
      // At most 30 strokes per 5 seconds per connection.
      const now = Date.now();
      socket.data.strokeTimes = socket.data.strokeTimes.filter((t) => now - t < 5000);
      if (socket.data.strokeTimes.length >= 30) return;
      socket.data.strokeTimes.push(now);

      // The server decides who the author is — clients can't draw "as" someone else.
      const saved: Stroke = { ...stroke, authorId: me.publicId, authorName: me.displayName };
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
          points: saved.points.map(({ x, y }) => ({ x, y })),
        });
      } catch (err) {
        console.error('board:stroke', err);
      }
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

    socket.on('disconnect', () => {
      for (const roomId of socket.data.rooms) {
        presence.leave(roomId, socket.id);
        broadcastPresence(roomId);
      }
    });
  });
}
