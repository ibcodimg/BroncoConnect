import { Router } from 'express';
import { findRoom } from '../../../shared/buildings';
import { REPORT_REASONS, type ReportReason, type Stroke } from '../../../shared/types';
import { audit } from '../lib/audit';
import { currentUser, requireUser } from '../lib/auth';
import { DirectMessage } from '../models/DirectMessage';
import { Message } from '../models/Message';
import { Report } from '../models/Report';
import { StrokeModel } from '../models/Stroke';
import { User, displayNameOf } from '../models/User';

export const reportsRouter = Router();
reportsRouter.use(requireUser);

const OBJECT_ID = /^[a-f0-9]{24}$/;
type Line = { authorId: string; authorName: string; text: string; createdAt: Date; reported?: boolean; edits?: string[] };
const versionsOf = (m: { edits?: { text?: string | null }[] | null }) =>
  m.edits && m.edits.length > 0 ? { edits: m.edits.map((e) => e.text ?? '') } : {};

/** Up to 5 messages before and after a chat message, in order. */
async function chatContext(msg: { _id: unknown; roomId: string; createdAt?: Date }): Promise<Line[]> {
  const at = msg.createdAt ?? new Date();
  const [before, after] = await Promise.all([
    Message.find({ roomId: msg.roomId, createdAt: { $lt: at } }).sort({ createdAt: -1 }).limit(5).lean(),
    Message.find({ roomId: msg.roomId, createdAt: { $gt: at } }).sort({ createdAt: 1 }).limit(5).lean(),
  ]);
  const line = (m: (typeof before)[number], reported = false): Line => ({
    authorId: m.authorId,
    authorName: m.authorName,
    text: m.text,
    createdAt: m.createdAt ?? at,
    ...versionsOf(m),
    ...(reported ? { reported } : {}),
  });
  return [...before.reverse().map((m) => line(m)), line(msg as (typeof before)[number], true), ...after.map((m) => line(m))];
}

/** Same for a DM, limited to the two people in that conversation. */
async function dmContext(dm: { _id: unknown; from: string; to: string; createdAt?: Date }): Promise<Line[]> {
  const at = dm.createdAt ?? new Date();
  const convo = { $or: [{ from: dm.from, to: dm.to }, { from: dm.to, to: dm.from }] };
  const [before, after, people] = await Promise.all([
    DirectMessage.find({ ...convo, createdAt: { $lt: at } }).sort({ createdAt: -1 }).limit(5).lean(),
    DirectMessage.find({ ...convo, createdAt: { $gt: at } }).sort({ createdAt: 1 }).limit(5).lean(),
    User.find({ publicId: { $in: [dm.from, dm.to] } }).lean(),
  ]);
  const names = new Map(people.map((u) => [u.publicId, displayNameOf(u)]));
  const line = (m: (typeof before)[number], reported = false): Line => ({
    authorId: m.from,
    authorName: names.get(m.from) ?? 'Someone',
    text: m.text,
    createdAt: m.createdAt ?? at,
    ...versionsOf(m),
    ...(reported ? { reported } : {}),
  });
  return [...before.reverse().map((m) => line(m)), line(dm as (typeof before)[number], true), ...after.map((m) => line(m))];
}

/** The person's 40 most recent strokes, grouped by room; long pen strokes thinned to ≤400 points. */
async function recentDrawings(publicId: string) {
  const strokes = await StrokeModel.find({ authorId: publicId, tool: { $ne: 'eraser' } }).sort({ createdAt: -1 }).limit(40).lean();
  const byRoom = new Map<string, Stroke[]>();
  for (const s of strokes.reverse()) {
    const pts = s.points.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
    const step = Math.ceil(pts.length / 400);
    const stroke: Stroke = {
      id: s.strokeId,
      authorId: s.authorId,
      tool: s.tool as Stroke['tool'],
      color: s.color,
      width: s.width,
      points: step > 1 ? pts.filter((_, i) => i % step === 0 || i === pts.length - 1) : pts,
    };
    byRoom.set(s.roomId, [...(byRoom.get(s.roomId) ?? []), stroke]);
  }
  return [...byRoom].map(([roomId, list]) => ({ roomId, strokes: list }));
}

/**
 * Report a person, a specific message (chat or DM), or a general problem.
 * Body: { reason, details?, targetId?, roomId?, message?: { kind: 'chat' | 'dm', id } }
 */
reportsRouter.post('/', async (req, res, next) => {
  try {
    const meDoc = currentUser(res);
    const me = meDoc.publicId;
    const { reason, details, roomId, message } = req.body ?? {};
    let targetId: string | undefined = typeof req.body?.targetId === 'string' && req.body.targetId ? req.body.targetId : undefined;
    if (!REPORT_REASONS.includes(reason as ReportReason)) return res.status(400).json({ error: 'Bad reason' });

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if ((await Report.countDocuments({ reporterId: me, createdAt: { $gt: hourAgo } })) >= 10) {
      return res.status(429).json({ error: 'Too many reports. Try again later.' });
    }

    let room = typeof roomId === 'string' && findRoom(roomId) ? roomId : undefined;
    let surrounding: Line[] = [];
    let messageKind: 'chat' | 'dm' | undefined;
    let messageId: string | undefined;

    if (message && (message.kind === 'chat' || message.kind === 'dm') && typeof message.id === 'string' && OBJECT_ID.test(message.id)) {
      messageKind = message.kind;
      messageId = message.id;
      if (message.kind === 'chat') {
        const msg = await Message.findById(message.id).lean();
        if (!msg) return res.status(404).json({ error: 'That message no longer exists' });
        targetId = msg.authorId;
        room = msg.roomId;
        surrounding = await chatContext(msg);
      } else {
        const dm = await DirectMessage.findById(message.id).lean();
        // You can only report a private message from your own conversation, and only one the other person sent.
        if (!dm || (dm.from !== me && dm.to !== me)) return res.status(404).json({ error: 'Message not found' });
        targetId = dm.from;
        surrounding = await dmContext(dm);
      }
    }

    const general = !targetId;
    if (general && !(typeof details === 'string' && details.trim())) return res.status(400).json({ error: 'Please describe the problem' });
    if (targetId === me) return res.status(400).json({ error: "You can't report yourself" });
    const target = targetId ? await User.findOne({ publicId: targetId }).lean() : null;
    if (targetId && !target) return res.status(404).json({ error: 'Not found' });

    // Person reports without a specific message keep the old behavior: their 10 latest room messages.
    const context =
      target && !messageKind
        ? await Message.find({ authorId: targetId, ...(room ? { roomId: room } : {}) }).sort({ createdAt: -1 }).limit(10).lean()
        : [];

    await Report.create({
      reporterId: me,
      targetId,
      reason,
      details: typeof details === 'string' ? details.slice(0, 1000) : undefined,
      roomId: room,
      context: context.reverse().map((m) => ({ text: m.text, createdAt: m.createdAt })),
      messageKind,
      messageId,
      surrounding,
      drawings: targetId ? await recentDrawings(targetId) : [],
    });

    audit('report', {
      actor: { publicId: me, displayName: displayNameOf(meDoc) },
      target: target ? { publicId: target.publicId, displayName: displayNameOf(target) } : undefined,
      roomId: room,
      // Never put DM text in the audit log.
      detail: `${reason}${messageKind ? ` · reported a ${messageKind === 'dm' ? 'private message' : 'chat message'}` : general ? ' · general problem' : ''}`,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
