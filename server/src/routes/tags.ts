import { Router } from 'express';
import { tagKey } from '../../../shared/tags';
import type { TagStats } from '../../../shared/types';
import { currentUser, requireUser } from '../lib/auth';
import { User, majorsOf } from '../models/User';

export const tagsRouter = Router();
tagsRouter.use(requireUser);

/** How many OTHER people (not you) use each major / subject / course tag. */
tagsRouter.get('/stats', async (_req, res, next) => {
  try {
    const me = currentUser(res);
    const users = await User.find(
      { anonId: { $ne: me.anonId } },
      { majors: 1, major: 1, strongSubjects: 1, needHelpSubjects: 1, coursesTaken: 1, coursesNeedHelp: 1, interests: 1 },
    )
      .limit(20000)
      .lean();

    const tally = () => new Map<string, [string, number]>();
    const majors = tally();
    const subjects = tally();
    const courses = tally();
    const interests = tally();
    const add = (m: Map<string, [string, number]>, labels: string[]) => {
      for (const label of new Set(labels.map((l) => l.trim()).filter(Boolean))) {
        const k = tagKey(label);
        const cur = m.get(k);
        m.set(k, [cur?.[0] ?? label, (cur?.[1] ?? 0) + 1]);
      }
    };

    for (const u of users) {
      add(majors, majorsOf(u));
      // A person counts once per subject, whether they're strong in it or want help.
      add(subjects, [...(u.strongSubjects ?? []), ...(u.needHelpSubjects ?? [])]);
      add(courses, [...(u.coursesTaken ?? []), ...(u.coursesNeedHelp ?? [])].map((c) => c.course));
      add(interests, u.interests ?? []);
    }

    const sorted = (m: Map<string, [string, number]>) => [...m.values()].sort((a, b) => b[1] - a[1]);
    const stats: TagStats = {
      majors: sorted(majors),
      subjects: sorted(subjects),
      courses: sorted(courses),
      interests: sorted(interests),
    };
    res.json(stats);
  } catch (err) {
    next(err);
  }
});
