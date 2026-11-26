/**
 * Tag vocabularies for profiles.
 *
 * CPP_MAJORS: undergraduate majors from Cal Poly Pomona's 2023–24 viewbook
 * (https://cpp.edu/viewbook/viewbook-11-22-24.pdf). Options/concentrations (e.g. Accounting under
 * Business Administration) aren't separate majors there; students can add them as custom tags.
 */
export const CPP_MAJORS = [
  'Aerospace Engineering',
  'Agribusiness and Food Industry Management',
  'Agricultural Science',
  'Animal Health Science',
  'Animal Science',
  'Anthropology',
  'Apparel Merchandising and Management',
  'Architecture',
  'Art History',
  'Biology',
  'Biotechnology',
  'Business Administration',
  'Chemical Engineering',
  'Chemistry',
  'Civil Engineering',
  'Communication',
  'Computer Engineering',
  'Computer Science',
  'Construction Engineering and Management',
  'Criminology',
  'Early Childhood Studies',
  'Economics',
  'Electrical Engineering',
  'Electromechanical Systems Engineering Technology',
  'Electronic Systems Engineering Technology',
  'English',
  'Environmental Biology',
  'Food Science and Technology',
  'Gender, Ethnicity, and Multicultural Studies',
  'Geography',
  'Geology',
  'History',
  'Hospitality Management',
  'Industrial Engineering',
  'Kinesiology',
  'Landscape Architecture',
  'Liberal Studies',
  'Manufacturing Engineering',
  'Mathematics',
  'Mechanical Engineering',
  'Music',
  'Nutrition',
  'Philosophy',
  'Physics',
  'Plant Science',
  'Political Science',
  'Psychology',
  'Science, Technology, and Society',
  'Sociology',
  'Spanish',
  'Theatre',
  'Urban and Regional Planning',
  'Visual Communications Design',
  'Undeclared',
] as const;

/** Common subjects students ask for or offer help in. Anyone can add their own. */
export const SUBJECT_SUGGESTIONS = [
  'Pre-Calculus',
  'Calculus I',
  'Calculus II',
  'Calculus III',
  'Differential Equations',
  'Linear Algebra',
  'Discrete Math',
  'Statistics',
  'Probability',
  'Physics (Mechanics)',
  'Physics (Electricity & Magnetism)',
  'General Chemistry',
  'Organic Chemistry',
  'Biochemistry',
  'General Biology',
  'Anatomy & Physiology',
  'Microbiology',
  'Genetics',
  'Intro to Programming',
  'Java',
  'Python',
  'C / C++',
  'JavaScript',
  'Data Structures',
  'Algorithms',
  'Computer Architecture',
  'Operating Systems',
  'Databases / SQL',
  'Web Development',
  'Circuits',
  'Statics',
  'Dynamics',
  'Thermodynamics',
  'Fluid Mechanics',
  'Strength of Materials',
  'CAD / SolidWorks',
  'MATLAB',
  'Excel',
  'Financial Accounting',
  'Managerial Accounting',
  'Microeconomics',
  'Macroeconomics',
  'Finance',
  'Marketing',
  'Writing / Essays',
  'Public Speaking',
  'Research Papers',
  'Spanish',
  'Psychology',
  'History',
  'Philosophy',
  'Music Theory',
  'Drawing / Design',
] as const;

const MAX_TAG = 40;

/** Comparison key: case/space-insensitive. */
export const tagKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const canonical = new Map<string, string>([...CPP_MAJORS, ...SUBJECT_SUGGESTIONS].map((t) => [tagKey(t), t]));

/** Clean up a tag; known tags get their official spelling ("computer science" → "Computer Science"). */
export function normalizeTag(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG);
  return canonical.get(tagKey(t)) ?? t;
}

/** "cs3310" / "CS-3310" / "cs 3310l" → "CS 3310" / "CS 3310L". Other text is just tidied. */
export function normalizeCourse(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  const m = /^([A-Za-z]{2,5})\s*-?\s*(\d{3,4}[A-Za-z]{0,2})$/.exec(t);
  return (m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : t).slice(0, MAX_TAG);
}

/** Dedupe (case-insensitive) and drop empties, keeping the first spelling. */
export function uniqueTags(tags: string[], normalize: (s: string) => string = normalizeTag, max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalize(raw);
    const k = tagKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
