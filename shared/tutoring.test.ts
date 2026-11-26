import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCourse, normalizeTag, uniqueTags } from './tags';
import { tutoringFit, type TutorProfile } from './tutoring';

const p = (over: Partial<TutorProfile>): TutorProfile => ({
  lookingFor: [],
  strongSubjects: [],
  needHelpSubjects: [],
  coursesTaken: [],
  coursesNeedHelp: [],
  ...over,
});

test('tags: known names get official spelling, courses get normalized', () => {
  assert.equal(normalizeTag('  computer   science '), 'Computer Science');
  assert.equal(normalizeTag('Underwater Basket Weaving'), 'Underwater Basket Weaving');
  assert.equal(normalizeCourse('cs3310'), 'CS 3310');
  assert.equal(normalizeCourse('chm-1210l'), 'CHM 1210L');
  assert.deepEqual(uniqueTags(['Python', 'python', ' PYTHON ', 'Java']), ['Python', 'Java']);
});

test('Tutor4Tutor trade needs both opted in and help flowing both ways', () => {
  const me = p({ lookingFor: ['tutor4tutor'], strongSubjects: ['Java'], needHelpSubjects: ['Calculus II'] });
  const them = p({ lookingFor: ['tutor4tutor'], strongSubjects: ['calculus ii'], needHelpSubjects: ['Java'] });
  const fit = tutoringFit(me, them);
  assert.equal(fit.kind, 'trade');
  assert.deepEqual(fit.theyCanTeach, ['Calculus II']);
  assert.deepEqual(fit.youCanTeach, ['Java']);
});

test('one-sided: a volunteer tutor helps without needing anything back', () => {
  const me = p({ needHelpSubjects: ['Organic Chemistry'] });
  const volunteer = p({ lookingFor: ['tutor-others'], strongSubjects: ['Organic Chemistry'] });
  assert.equal(tutoringFit(me, volunteer).kind, 'canHelpYou');
  assert.equal(tutoringFit(volunteer, me).kind, 'youCanHelp');
});

test('no match without a volunteer or a two-way trade', () => {
  const me = p({ lookingFor: ['tutor4tutor'], needHelpSubjects: ['Statistics'] });
  const them = p({ lookingFor: ['tutor4tutor'], strongSubjects: ['Statistics'] }); // they need nothing from me
  assert.equal(tutoringFit(me, them).kind, null);
});

test('courses taken count as teachable, and same professor is noticed', () => {
  const me = p({ coursesNeedHelp: [{ course: 'CS 3310', professor: 'Smith' }] });
  const them = p({ lookingFor: ['tutor-others'], coursesTaken: [{ course: 'CS 3310', professor: 'smith' }] });
  const fit = tutoringFit(me, them);
  assert.equal(fit.kind, 'canHelpYou');
  assert.deepEqual(fit.sameProfessor, ['CS 3310 (Smith)']);
});
