import { Router } from 'express';
import { findRoom } from '../../../shared/buildings';
import { isValidBlock, scheduleOverlaps } from '../../../shared/schedule';
import { LOOKING_FOR, type Match, type ScheduleBlock, type UserProfile } from '../../../shared/types';
import { User, displayNameOf, getOrCreateUser } from '../models/User';

export const usersRouter = Router();

const ANON_ID = /^[A-Za-z0-9-]{16,64}$/;

function toProfile(u: {
  displayName?: string | null;
  major?: string | null;
  status?: string | null;
  schedule: unknown;
  lookingFor: unknown;
  strongSubjects: unknown;
  needHelpSubjects: unknown;
}): UserProfile & { publicId?: string } {
  return {
    displayName: u.displayName ?? undefined,
    major: u.major ?? undefined,
    status: (u.status as UserProfile['status']) ?? undefined,
    schedule: u.schedule as ScheduleBlock[],
    lookingFor: u.lookingFor as UserProfile['lookingFor'],
    strongSubjects: u.strongSubjects as string[],
    needHelpSubjects: u.needHelpSubjects as string[],
  };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || undefined : undefined);
const strList = (v: unknown, max: number) =>
  Array.isArray(v) ? v.map((s) => str(s, max)).filter((s): s is string => !!s).slice(0, 20) : [];

/** Keep only fields we know about, with sane limits. Everything is optional. */
function sanitize(body: Record<string, unknown>): UserProfile {
  const schedule = (Array.isArray(body.schedule) ? body.schedule : [])
    .slice(0, 50)
    .map((b: Record<string, unknown>) => ({
      day: b.day,
      start: b.start,
      end: b.end,
      buildingId: b.buildingId,
      ...(str(b.label, 40) ? { label: str(b.label, 40) } : {}),
    }))
    .filter((b): b is ScheduleBlock => isValidBlock(b as ScheduleBlock) && !!findRoom(String(b.buildingId)));

  return {
    displayName: str(body.displayName, 32),
    major: str(body.major, 60),
    status: body.status === 'commuter' || body.status === 'resident' ? body.status : undefined,
    schedule,
    lookingFor: (Array.isArray(body.lookingFor) ? body.lookingFor : []).filter((x): x is UserProfile['lookingFor'][number] =>
      (LOOKING_FOR as readonly string[]).includes(x as string),
    ),
    strongSubjects: strList(body.strongSubjects, 40),
    needHelpSubjects: strList(body.needHelpSubjects, 40),
  };
}

usersRouter.param('anonId', (req, res, next, anonId: string) => {
  if (!ANON_ID.test(anonId)) return res.status(400).json({ error: 'Bad id' });
  next();
});

usersRouter.get('/:anonId', async (req, res, next) => {
  try {
    const user = await getOrCreateUser(req.params.anonId);
    res.json({ ...toProfile(user), publicId: user.publicId });
  } catch (err) {
    next(err);
  }
});

usersRouter.put('/:anonId', async (req, res, next) => {
  try {
    const profile = sanitize(req.body ?? {});
    const user = await User.findOneAndUpdate(
      { anonId: req.params.anonId },
      { $set: { ...profile, lastSeenAt: new Date() }, $setOnInsert: { anonId: req.params.anonId } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    res.json({ ...toProfile(user), publicId: user.publicId });
  } catch (err) {
    next(err);
  }
});

/** People who are in the same building, on the same day, at the same time as you. */
usersRouter.get('/:anonId/matches', async (req, res, next) => {
  try {
    const me = await User.findOne({ anonId: req.params.anonId }).lean();
    if (!me || me.schedule.length === 0) return res.json([]);

    const mine = me.schedule as ScheduleBlock[];
    const candidates = await User.find({
      anonId: { $ne: me.anonId },
      schedule: {
        $elemMatch: {
          $or: mine.map((b) => ({ day: b.day, buildingId: b.buildingId })),
        },
      },
    })
      .limit(500)
      .lean();

    const matches: Match[] = candidates
      .map((u) => ({
        publicId: u.publicId,
        displayName: displayNameOf(u),
        major: u.major ?? undefined,
        status: (u.status as Match['status']) ?? undefined,
        lookingFor: u.lookingFor as Match['lookingFor'],
        overlaps: scheduleOverlaps(mine, u.schedule as ScheduleBlock[]),
      }))
      .filter((m) => m.overlaps.length > 0)
      .sort((a, b) => b.overlaps.length - a.overlaps.length)
      .slice(0, 50);

    res.json(matches);
  } catch (err) {
    next(err);
  }
});
