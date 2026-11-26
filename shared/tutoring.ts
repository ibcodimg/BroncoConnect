import { tagKey } from './tags';
import type { CourseEntry, LookingFor } from './types';

export interface TutorProfile {
  lookingFor: LookingFor[];
  strongSubjects: string[];
  needHelpSubjects: string[];
  coursesTaken: CourseEntry[];
  coursesNeedHelp: CourseEntry[];
}

/** key → label of everything someone can help with (strong subjects + courses they've taken). */
export function canTeach(p: TutorProfile): Map<string, string> {
  return new Map([...p.strongSubjects, ...p.coursesTaken.map((c) => c.course)].map((t) => [tagKey(t), t]));
}

/** key → label of everything someone wants help with. */
export function wantsHelp(p: TutorProfile): Map<string, string> {
  return new Map([...p.needHelpSubjects, ...p.coursesNeedHelp.map((c) => c.course)].map((t) => [tagKey(t), t]));
}

const intersect = (teach: Map<string, string>, want: Map<string, string>) => [...want].filter(([k]) => teach.has(k)).map(([, label]) => label);

/** Courses where the helper took the same professor the learner has (or had). */
function sameProf(helperTaken: CourseEntry[], learnerNeeds: CourseEntry[]): string[] {
  const taken = new Map(helperTaken.filter((c) => c.professor).map((c) => [`${tagKey(c.course)}|${tagKey(c.professor!)}`, c]));
  return learnerNeeds
    .filter((c) => c.professor && taken.has(`${tagKey(c.course)}|${tagKey(c.professor)}`))
    .map((c) => `${c.course} (${c.professor})`);
}

export interface TutoringFit {
  theyCanTeach: string[];
  youCanTeach: string[];
  sameProfessor: string[];
  kind: 'trade' | 'canHelpYou' | 'youCanHelp' | null;
}

/**
 * How `other` fits `me`:
 * - trade (Tutor4Tutor): both opted into trading, and each can help the other with something.
 * - canHelpYou (one-sided): they volunteer to tutor and know something you want help with.
 * - youCanHelp (one-sided): you volunteer to tutor and know something they want help with.
 */
export function tutoringFit(me: TutorProfile, other: TutorProfile): TutoringFit {
  const theyCanTeach = intersect(canTeach(other), wantsHelp(me));
  const youCanTeach = intersect(canTeach(me), wantsHelp(other));
  const sameProfessor = [...sameProf(other.coursesTaken, me.coursesNeedHelp), ...sameProf(me.coursesTaken, other.coursesNeedHelp)];

  let kind: TutoringFit['kind'] = null;
  if (me.lookingFor.includes('tutor4tutor') && other.lookingFor.includes('tutor4tutor') && theyCanTeach.length && youCanTeach.length) {
    kind = 'trade';
  } else if (other.lookingFor.includes('tutor-others') && theyCanTeach.length) {
    kind = 'canHelpYou';
  } else if (me.lookingFor.includes('tutor-others') && youCanTeach.length) {
    kind = 'youCanHelp';
  }
  return { theyCanTeach, youCanTeach, sameProfessor, kind };
}
