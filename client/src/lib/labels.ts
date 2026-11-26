import type { LookingFor } from '@shared/types';

export const LOOKING_LABELS: Record<LookingFor, string> = {
  friends: 'Making friends',
  tutoring: 'Looking for a tutor',
  'tutor-others': 'Willing to tutor others (one-sided)',
  tutor4tutor: 'Tutor4Tutor (trade help)',
  'study-group': 'Study group',
};

/** Short phrases for "looking for …" lines on cards. */
export const LOOKING_SHORT: Record<LookingFor, string> = {
  friends: 'friends',
  tutoring: 'a tutor',
  'tutor-others': 'people to tutor',
  tutor4tutor: 'Tutor4Tutor trades',
  'study-group': 'a study group',
};
