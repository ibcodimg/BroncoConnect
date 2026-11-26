import { Router } from 'express';
import { REPORT_REASONS, type ReportReason } from '../../../shared/types';
import { findRoom } from '../../../shared/buildings';
import { currentUser, requireUser } from '../lib/auth';
import { Message } from '../models/Message';
import { Report } from '../models/Report';
import { User } from '../models/User';

export const reportsRouter = Router();
reportsRouter.use(requireUser);

reportsRouter.post('/', async (req, res, next) => {
  try {
    const me = currentUser(res).publicId;
    const { targetId, reason, details, roomId } = req.body ?? {};
    if (typeof targetId !== 'string' || targetId === me) return res.status(400).json({ error: 'Bad target' });
    if (!REPORT_REASONS.includes(reason as ReportReason)) return res.status(400).json({ error: 'Bad reason' });
    if (!(await User.exists({ publicId: targetId }))) return res.status(404).json({ error: 'Not found' });

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if ((await Report.countDocuments({ reporterId: me, createdAt: { $gt: hourAgo } })) >= 10) {
      return res.status(429).json({ error: 'Too many reports. Try again later.' });
    }

    const room = typeof roomId === 'string' && findRoom(roomId) ? roomId : undefined;
    const context = await Message.find({ authorId: targetId, ...(room ? { roomId: room } : {}) })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    await Report.create({
      reporterId: me,
      targetId,
      reason,
      details: typeof details === 'string' ? details.slice(0, 1000) : undefined,
      roomId: room,
      context: context.reverse().map((m) => ({ text: m.text, createdAt: m.createdAt })),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
