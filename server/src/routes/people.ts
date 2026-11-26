import { Router } from 'express';
import type { FriendStatus, PublicProfile } from '../../../shared/types';
import { currentUser, requireUser } from '../lib/auth';
import { escapeRegex, toPublicUser } from '../lib/people';
import { isOnline } from '../lib/realtime';
import { Friendship, pairKey } from '../models/Friendship';
import { User } from '../models/User';

export const peopleRouter = Router();
peopleRouter.use(requireUser);

/** Search people by username. Only people who picked a username are searchable. */
peopleRouter.get('/search', async (req, res, next) => {
  try {
    const me = currentUser(res);
    const q = String(req.query.q ?? '').trim().slice(0, 32);
    if (!q) return res.json([]);
    const users = await User.find({
      displayName: { $regex: escapeRegex(q), $options: 'i' },
      publicId: { $ne: me.publicId },
    })
      .limit(20)
      .lean();
    res.json(users.map((u) => ({ ...toPublicUser(u), online: isOnline(u.publicId) })));
  } catch (err) {
    next(err);
  }
});

export async function friendStatus(me: string, other: string): Promise<FriendStatus> {
  const f = await Friendship.findOne({ pair: pairKey(me, other) }).lean();
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester === me ? 'outgoing' : 'incoming';
}

peopleRouter.get('/:publicId', async (req, res, next) => {
  try {
    const me = currentUser(res);
    const u = await User.findOne({ publicId: req.params.publicId }).lean();
    if (!u) return res.status(404).json({ error: 'Not found' });
    const profile: PublicProfile = {
      ...toPublicUser(u),
      online: isOnline(u.publicId),
      strongSubjects: u.strongSubjects ?? [],
      needHelpSubjects: u.needHelpSubjects ?? [],
      coursesTaken: (u.coursesTaken ?? []).map((c) => ({ course: c.course, professor: c.professor ?? undefined })),
      coursesNeedHelp: (u.coursesNeedHelp ?? []).map((c) => ({ course: c.course, professor: c.professor ?? undefined })),
      interests: u.interests ?? [],
      friendStatus: u.publicId === me.publicId ? 'none' : await friendStatus(me.publicId, u.publicId),
      isMe: u.publicId === me.publicId,
    };
    res.json(profile);
  } catch (err) {
    next(err);
  }
});
