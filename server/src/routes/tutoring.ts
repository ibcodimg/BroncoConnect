import { Router } from 'express';
import { scheduleOverlaps } from '../../../shared/schedule';
import { tutoringFit, type TutorProfile } from '../../../shared/tutoring';
import type { CourseEntry, LookingFor, ScheduleBlock, TutoringMatch, TutoringResults } from '../../../shared/types';
import { currentUser, requireUser } from '../lib/auth';
import { toPublicUser } from '../lib/people';
import { isOnline } from '../lib/realtime';
import { User } from '../models/User';

export const tutoringRouter = Router();
tutoringRouter.use(requireUser);

type Doc = {
  lookingFor?: unknown;
  strongSubjects?: string[] | null;
  needHelpSubjects?: string[] | null;
  coursesTaken?: { course: string; professor?: string | null }[] | null;
  coursesNeedHelp?: { course: string; professor?: string | null }[] | null;
};

const courses = (v: Doc['coursesTaken']): CourseEntry[] =>
  (v ?? []).map((c) => ({ course: c.course, ...(c.professor ? { professor: c.professor } : {}) }));

const asTutor = (u: Doc): TutorProfile => ({
  lookingFor: (u.lookingFor as LookingFor[]) ?? [],
  strongSubjects: u.strongSubjects ?? [],
  needHelpSubjects: u.needHelpSubjects ?? [],
  coursesTaken: courses(u.coursesTaken),
  coursesNeedHelp: courses(u.coursesNeedHelp),
});

/** Tutor4Tutor trades, plus one-sided tutoring both ways. People who share your campus schedule rank higher. */
tutoringRouter.get('/', async (_req, res, next) => {
  try {
    const meDoc = currentUser(res);
    const me = asTutor(meDoc.toObject());
    const mySchedule = (meDoc.schedule ?? []) as ScheduleBlock[];

    const candidates = await User.find({
      anonId: { $ne: meDoc.anonId },
      $or: [
        { 'strongSubjects.0': { $exists: true } },
        { 'needHelpSubjects.0': { $exists: true } },
        { 'coursesTaken.0': { $exists: true } },
        { 'coursesNeedHelp.0': { $exists: true } },
      ],
    })
      .limit(5000)
      .lean();

    const results: TutoringResults = { trades: [], canHelpYou: [], youCanHelp: [] };
    for (const u of candidates) {
      const fit = tutoringFit(me, asTutor(u));
      if (!fit.kind) continue;
      const match: TutoringMatch = {
        ...toPublicUser(u),
        online: isOnline(u.publicId),
        theyCanTeach: fit.theyCanTeach,
        youCanTeach: fit.youCanTeach,
        sameProfessor: fit.sameProfessor,
        overlaps: scheduleOverlaps(mySchedule, (u.schedule ?? []) as ScheduleBlock[]),
      };
      const bucket = { trade: 'trades', canHelpYou: 'canHelpYou', youCanHelp: 'youCanHelp' } as const;
      results[bucket[fit.kind]].push(match);
    }

    const score = (m: TutoringMatch) => m.sameProfessor.length * 100 + m.overlaps.length * 10 + m.theyCanTeach.length + m.youCanTeach.length;
    for (const list of Object.values(results)) list.sort((a: TutoringMatch, b: TutoringMatch) => score(b) - score(a));
    res.json({ trades: results.trades.slice(0, 50), canHelpYou: results.canHelpYou.slice(0, 50), youCanHelp: results.youCanHelp.slice(0, 50) });
  } catch (err) {
    next(err);
  }
});
