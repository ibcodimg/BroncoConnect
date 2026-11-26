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

/** Subjects students ask for or offer help in: broad areas first, then common course names. Anyone can add their own. */
export const SUBJECT_SUGGESTIONS = [
  // Broad subjects
  'Math', 'English', 'Science', 'Writing', 'Reading', 'History', 'Art', 'Music', 'Biology', 'Chemistry', 'Physics',
  'Computer Science', 'Programming', 'Engineering', 'Business', 'Economics', 'Accounting', 'Finance', 'Marketing',
  'Management', 'Psychology', 'Sociology', 'Philosophy', 'Political Science', 'Anthropology', 'Geography', 'Geology',
  'Communication', 'Languages', 'Spanish', 'French', 'Japanese', 'Chinese (Mandarin)', 'Korean', 'German',
  'American Sign Language', 'Statistics', 'Nutrition', 'Kinesiology', 'Agriculture', 'Architecture', 'Design',
  'Hospitality', 'Education', 'Health Science', 'Ethnic Studies', 'Environmental Science',
  // Math
  'Pre-Algebra', 'Algebra', 'College Algebra', 'Geometry', 'Trigonometry', 'Pre-Calculus', 'Calculus', 'Calculus I',
  'Calculus II', 'Calculus III', 'Multivariable Calculus', 'Differential Equations', 'Linear Algebra', 'Discrete Math',
  'Probability', 'Intro to Statistics', 'Applied Statistics', 'Number Theory', 'Abstract Algebra', 'Real Analysis',
  'Numerical Methods', 'Proofs',
  // Sciences
  'General Chemistry', 'Organic Chemistry', 'Biochemistry', 'Analytical Chemistry', 'Physical Chemistry',
  'General Biology', 'Cell Biology', 'Molecular Biology', 'Genetics', 'Microbiology', 'Ecology', 'Evolution',
  'Zoology', 'Botany', 'Anatomy & Physiology', 'Human Anatomy', 'Physiology', 'Immunology', 'Neuroscience',
  'Physics (Mechanics)', 'Physics (Electricity & Magnetism)', 'Physics (Waves & Optics)', 'Modern Physics',
  'Astronomy', 'Earth Science', 'Oceanography', 'Environmental Biology', 'Animal Science', 'Plant Science',
  'Food Science', 'Soil Science',
  // Computing
  'Intro to Programming', 'Java', 'Python', 'C', 'C++', 'C#', 'JavaScript', 'TypeScript', 'HTML & CSS', 'React',
  'SQL', 'Databases', 'Data Structures', 'Algorithms', 'Object-Oriented Programming', 'Computer Architecture',
  'Operating Systems', 'Computer Networks', 'Cybersecurity', 'Software Engineering', 'Web Development',
  'Mobile App Development', 'Machine Learning', 'Artificial Intelligence', 'Data Science', 'Theory of Computation',
  'Compilers', 'Assembly / MIPS', 'Digital Logic', 'Linux / Command Line', 'Git', 'Game Development',
  'Computer Graphics', 'Excel', 'MATLAB', 'R',
  // Engineering
  'Engineering Graphics', 'CAD / SolidWorks', 'AutoCAD', 'Statics', 'Dynamics', 'Strength of Materials',
  'Thermodynamics', 'Heat Transfer', 'Fluid Mechanics', 'Circuits', 'Electronics', 'Signals & Systems',
  'Control Systems', 'Microcontrollers / Arduino', 'Materials Science', 'Manufacturing Processes', 'Surveying',
  'Structural Analysis', 'Engineering Economics', 'Aerodynamics',
  // Business & social sciences
  'Financial Accounting', 'Managerial Accounting', 'Microeconomics', 'Macroeconomics', 'Business Law',
  'Business Statistics', 'Operations Management', 'Supply Chain', 'Entrepreneurship', 'Personal Finance',
  'Investments', 'Intro to Psychology', 'Abnormal Psychology', 'Developmental Psychology', 'Research Methods',
  'Intro to Sociology', 'Criminology', 'US History', 'World History', 'American Government',
  // Writing & humanities
  'English Composition', 'Essay Writing', 'Research Papers', 'Creative Writing', 'Grammar', 'Literature',
  'Critical Thinking', 'Public Speaking', 'Rhetoric', 'Ethics', 'Logic', 'Art History', 'Music Theory', 'Drawing',
  'Graphic Design', 'Photography', 'Theatre',
  // Study skills
  'Study Skills', 'Time Management', 'Test Prep', 'Resume & Interviews',
] as const;

/** Personal interests (for making friends; not used by Tutor4Tutor). */
export const INTEREST_SUGGESTIONS = [
  'Gaming', 'Video Games', 'Board Games', 'Chess', 'Anime', 'Manga', 'K-Pop', 'Music', 'Concerts', 'Guitar', 'Piano',
  'Singing', 'Dancing', 'Movies', 'TV Shows', 'Reading', 'Writing', 'Poetry', 'Drawing', 'Painting', 'Photography',
  'Film Making', 'Fashion', 'Thrifting', 'Cooking', 'Baking', 'Coffee', 'Boba', 'Food', 'Traveling', 'Hiking',
  'Camping', 'Beach', 'Running', 'Gym', 'Weightlifting', 'Yoga', 'Basketball', 'Soccer', 'Volleyball', 'Tennis',
  'Badminton', 'Baseball', 'Football', 'Swimming', 'Skateboarding', 'Cycling', 'Rock Climbing', 'Martial Arts',
  'Esports', 'Coding', 'Hackathons', 'Robotics', 'Cars', 'Tech', 'Startups', 'Investing', 'Volunteering',
  'Religion / Faith', 'Clubs', 'Greek Life', 'Pets', 'Dogs', 'Cats', 'Plants', 'Gardening', 'Horses',
  'Sustainability', 'Languages', 'Memes', 'Podcasts', 'Theater', 'Comedy',
] as const;

const MAX_TAG = 40;

/** Comparison key: case/space-insensitive. */
export const tagKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const canonical = new Map<string, string>([...CPP_MAJORS, ...SUBJECT_SUGGESTIONS, ...INTEREST_SUGGESTIONS].map((t) => [tagKey(t), t]));

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
