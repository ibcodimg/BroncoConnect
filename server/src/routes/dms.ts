import { Router } from 'express';
import type { Conversation, DirectMessage as DM } from '../../../shared/types';
import { currentUser, requireUser } from '../lib/auth';
import { toPublicUser } from '../lib/people';
import { isOnline } from '../lib/realtime';
import { DirectMessage } from '../models/DirectMessage';
import { User } from '../models/User';

export const dmsRouter = Router();
dmsRouter.use(requireUser);

export function toDM(d: {
  _id: unknown;
  from: string;
  to: string;
  text: string;
  read?: boolean | null;
  createdAt?: Date;
  editedAt?: Date | null;
  edits?: { text?: string | null; editedAt?: Date | null }[] | null;
}): DM {
  const created = d.createdAt ?? new Date();
  return {
    id: String(d._id),
    from: d.from,
    to: d.to,
    text: d.text,
    read: !!d.read,
    createdAt: created.toISOString(),
    ...(d.editedAt
      ? {
          editedAt: d.editedAt.toISOString(),
          edits: (d.edits ?? []).map((e) => ({ text: e.text ?? '', editedAt: (e.editedAt ?? created).toISOString() })),
        }
      : {}),
  };
}

/** Your conversations, newest first, with unread counts. */
dmsRouter.get('/', async (_req, res, next) => {
  try {
    const me = currentUser(res).publicId;
    const recent = await DirectMessage.find({ $or: [{ from: me }, { to: me }] })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const byOther = new Map<string, { last: (typeof recent)[number]; unread: number }>();
    for (const m of recent) {
      const other = m.from === me ? m.to : m.from;
      const entry = byOther.get(other) ?? { last: m, unread: 0 };
      if (m.to === me && !m.read) entry.unread++;
      byOther.set(other, entry);
    }
    const users = new Map((await User.find({ publicId: { $in: [...byOther.keys()] } }).lean()).map((u) => [u.publicId, u]));
    const conversations: Conversation[] = [];
    for (const [other, { last, unread }] of byOther) {
      const u = users.get(other);
      if (!u) continue;
      conversations.push({ other: { ...toPublicUser(u), online: isOnline(other) }, last: toDM(last), unread });
    }
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

/** Messages with one person (oldest first). Marks their messages to you as read. */
dmsRouter.get('/:publicId', async (req, res, next) => {
  try {
    const me = currentUser(res).publicId;
    const other = req.params.publicId;
    const msgs = await DirectMessage.find({
      $or: [
        { from: me, to: other },
        { from: other, to: me },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    await DirectMessage.updateMany({ from: other, to: me, read: false }, { $set: { read: true } });
    res.json(msgs.reverse().map(toDM));
  } catch (err) {
    next(err);
  }
});
