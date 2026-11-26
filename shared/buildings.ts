import type { Building } from './types';

/**
 * Every Cal Poly Pomona building that gets a chatroom.
 * Sources: CPP Facilities Planning & Management building list, and building names on OpenStreetMap
 * (client/public/buildings.geojson). Parking structures are deliberately left out (future parking feature).
 *
 * Lettered annexes (24A–F, 31A/B, 68A, 79A/B, 209R/S, 220A–C) share their main building's chatroom
 * automatically — see shared/buildingMatch.ts. Room ids never change once created (chat history uses them).
 */
export const CAMPUS_ROOM: Building = { id: 'campus', number: '', name: 'Entire Campus' };

// [number, name] — chatroom id is `building-<number>` (lowercase).
const NUMBERED: [string, string][] = [
  ['1', 'Building One'],
  ['2', 'College of Agriculture'],
  ['3', 'Science Laboratory'],
  ['4', 'Biotechnology Building'],
  ['4A', 'BioTrek Learning Center'],
  ['5', 'College of Letters, Arts and Social Sciences'],
  ['6', 'College of Education and Integrative Studies'],
  ['7', 'College of Environmental Design'],
  ['8', 'College of Science'],
  ['9', 'College of Engineering'],
  ['13', 'Art Department and Engineering Annex'],
  ['15', 'University Library'],
  ['17', 'Engineering Laboratories'],
  ['20', 'Encinitas Residence Hall'],
  ['21', 'Montecito Residence Hall'],
  ['22', 'Alamitos Residence Hall'],
  ['23', 'Aliso Residence Hall'],
  ['24', 'Music'],
  ['25', 'Drama Department / Theatre'],
  ['26', 'University Plaza'],
  ['30', 'Agricultural Unit'],
  ['31', 'Poultry Unit'],
  ['32', 'Beef Unit'],
  ['33', 'Feedmill'],
  ['34', 'Meat Laboratory'],
  ['35', 'Bronco Student Center'],
  ['35A', 'Art Gallery'],
  ['37', 'Swine Unit'],
  ['38', 'Sheep Unit'],
  ['39', 'Building 39'],
  ['41', 'Darlene May Gymnasium'],
  ['42', 'Bronco Recreation Intramural Complex (BRIC)'],
  ['43', 'Kellogg Arena'],
  ['45', 'Apparel Merchandising and Management'],
  ['46', 'Health Services'],
  ['54', 'Residence Suites'],
  ['56', 'Storage'],
  ['57', 'Palmitas Residence Hall (closed)'],
  ['58', 'Cedritos Residence Hall (closed)'],
  ['59', 'La Cienega Center and Housing Services'],
  ['60', 'Residence Suites – Vista Bonita'],
  ['61', 'Residence Suites'],
  ['62', 'Residence Suites'],
  ['63', 'Residence Suites'],
  ['65', 'Pesticide Building'],
  ['66', 'Bronco Bookstore'],
  ['67', 'Equine Research Facility'],
  ['68', 'Hay Barn'],
  ['70', 'Los Olivos Commons (closed)'],
  ['71', 'Recreation and Maintenance'],
  ['72', 'Centerpointe Dining Commons'],
  ['73', 'Sicomoro Residence Hall'],
  ['74', 'Secoya Residence Hall'],
  ['76', 'Kellogg West Education/Dining'],
  ['77', 'Kellogg West Main Lodge'],
  ['78', 'Kellogg West Addition'],
  ['79', 'Collins College of Hospitality Management'],
  ['89', 'Interim Design Center'],
  ['92', 'Laboratory Facility'],
  ['94', 'University Office Building'],
  ['95', 'Cultural Centers'],
  ['97', 'Campus Center'],
  ['98', 'Classroom/Laboratory/Administration (CLA)'],
  ['98P', 'CLA Paseo'],
  ['99', 'Storage'],
  ['100', 'Storage'],
  ['111', 'Manor House'],
  ['114', 'Building 114'],
  ['116', 'Child Care Center'],
  ['121', 'Student Services Building'],
  ['123', 'Building 123'],
  ['124', 'Building 124'],
  ['125', 'Building 125'],
  ['128', 'I-Poly High School'],
  ['141', 'Building 141'],
  ['158', 'Orientation Services'],
  ['162', 'College of Business Administration'],
  ['163', 'College of Business Administration'],
  ['191', 'Building 191'],
  ['193', 'Chilled Water Central Plant'],
  ['209', 'John T. Lyle Center for Regenerative Studies'],
  ['211', 'Agriscapes and Farm Store'],
  ['215', 'Edison SCE2'],
  ['216', 'Innovation Village SCE'],
  ['218', 'American Red Cross Headquarters'],
  ['219', 'Edison SCE1'],
  ['220', 'Center for Training, Technology and Incubation & College of Professional and Global Education'],
];

// Places without a building number — chatroom id is `place-<slug>`.
const PLACES: [string, string][] = [
  ['university-village', 'University Village (apartments)'],
  ['english-language-institute', 'English Language Institute'],
  ['marriott-learning-center', 'Marriott Learning Center'],
  ['vista-marketplace', "Denny's / Vista Marketplace"],
  ['masa-house', 'MASA House'],
  ['kellogg-house-pomona', 'Kellogg House Pomona'],
  ['kellogg-guest-house', 'Kellogg Guest House'],
  ['its', 'Information and Technology Services'],
  ['fruit-and-crops-unit', 'Fruit and Crops Unit'],
  ['rose-float-lab', 'Rose Float Lab'],
  ['cpp-enterprises', 'Cal Poly Pomona Enterprises'],
];

/** Building-specific extras. Math & Statistics live in the College of Science (Building 8). */
const FEATURES: Record<string, Building['features']> = {
  'building-8': ['graphing-calculator'],
};

const withFeatures = (b: Building): Building => (FEATURES[b.id] ? { ...b, features: FEATURES[b.id] } : b);

export const BUILDINGS: Building[] = [
  ...NUMBERED.map(([number, name]) => withFeatures({ id: `building-${number.toLowerCase()}`, number, name })),
  ...PLACES.map(([slug, name]) => withFeatures({ id: `place-${slug}`, number: '', name })),
];

export const ALL_ROOMS: Building[] = [CAMPUS_ROOM, ...BUILDINGS];

export function findRoom(roomId: string): Building | undefined {
  return ALL_ROOMS.find((b) => b.id === roomId);
}

/** "Building 8", "Campus-wide", or "" for places without a number. */
export function roomKicker(b: Pick<Building, 'id' | 'number'>): string {
  if (b.id === 'campus') return 'Campus-wide';
  return b.number ? `Building ${b.number}` : '';
}

/** Short label for lists: "8", "★" for campus, "•" for unnumbered places. */
export function roomTag(b: Pick<Building, 'id' | 'number'>): string {
  if (b.id === 'campus') return '★';
  return b.number || '•';
}
