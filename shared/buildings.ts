import type { Building } from './types';

/**
 * Cal Poly Pomona buildings.
 * Source: CPP Facilities Planning & Management hydration-station building list
 * (https://www.cpp.edu/fpm/docs/resources/hydration-station-map-and-list.pdf).
 * TODO: verify against the current campus map (https://www.cpp.edu/maps/) and add missing buildings.
 */
export const CAMPUS_ROOM: Building = { id: 'campus', number: '—', name: 'Entire Campus' };

const list: [number: string, name: string][] = [
  ['1', 'Building One'],
  ['2', 'College of Agriculture'],
  ['3', 'Science Laboratory'],
  ['4', 'Biotechnology Building'],
  ['5', 'College of Letters, Arts and Social Sciences'],
  ['6', 'College of Education and Integrative Studies'],
  ['7', 'College of Environmental Design'],
  ['8', 'College of Science'],
  ['9', 'College of Engineering'],
  ['13', 'Art Department and Engineering Annex'],
  ['15', 'University Library'],
  ['17', 'Engineering Laboratories'],
  ['24', 'Music'],
  ['25', 'Drama Department / Theatre'],
  ['26', 'University Plaza'],
  ['35', 'Bronco Student Center'],
  ['41', 'Darlene May Gymnasium'],
  ['42', 'Bronco Recreation Intramural Complex (BRIC)'],
  ['43', 'Kellogg Arena'],
  ['46', 'Health Services'],
  ['54', 'Residence Suites'],
  ['60', 'Residence Suites – Vista Bonita'],
  ['61', 'Residence Suites'],
  ['62', 'Residence Suites'],
  ['63', 'Residence Suites'],
  ['66', 'Bronco Bookstore'],
  ['92', 'Laboratory Facility'],
  ['94', 'University Office Building'],
  ['95', 'Cultural Centers'],
  ['97', 'Campus Center'],
  ['98', 'Classroom/Laboratory/Administration (CLA)'],
  ['121', 'Student Services Building'],
  ['162', 'College of Business Administration'],
];

/** Building-specific extras. Math & Statistics live in the College of Science (Building 8). */
const FEATURES: Record<string, Building['features']> = {
  '8': ['graphing-calculator'],
};

export const BUILDINGS: Building[] = list.map(([number, name]) => ({
  id: `building-${number}`,
  number,
  name,
  ...(FEATURES[number] ? { features: FEATURES[number] } : {}),
}));

export const ALL_ROOMS: Building[] = [CAMPUS_ROOM, ...BUILDINGS];

export function findRoom(roomId: string): Building | undefined {
  return ALL_ROOMS.find((b) => b.id === roomId);
}
