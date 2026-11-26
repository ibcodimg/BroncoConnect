/**
 * Fixed outline → chatroom links for outlines that automatic name matching can't place.
 * Keys are OpenStreetMap ids from client/public/buildings.geojson. 'none' = not a chatroom.
 * Admin links saved from the map (database) override these.
 */
export const STATIC_MAP_LINKS: Record<string, string> = {
  // University Library: three unnamed outlines (incl. the Starbucks) form one building
  'way/1337874285': 'building-15',
  'way/1337874286': 'building-15',
  'way/1337874288': 'building-15',
  // Art Department / Engineering Annex A, B, C belong with Building 13
  'way/431913493': 'building-13',
  'way/438457664': 'building-13',
  'way/466508845': 'building-13',
  // Marriott Learning Center is its own place (its name also mentions Collins College)
  'way/952858298': 'place-marriott-learning-center',
  // A second outline labelled "building 68: Hay Barn" on the east side; the real 68 is by the animal units
  'way/430638834': 'none',
  // University Village apartments (outlines named only with numbers)
  'way/430368270': 'place-university-village',
  'way/430368282': 'place-university-village',
  'way/430368301': 'place-university-village',
  'way/430368302': 'place-university-village',
  'way/430368303': 'place-university-village',
  'way/430368304': 'place-university-village',
  'way/430368305': 'place-university-village',
  'way/430368306': 'place-university-village',
  'way/430368307': 'place-university-village',
  'way/430368308': 'place-university-village',
  'way/430368309': 'place-university-village',
  'way/430368310': 'place-university-village',
  'way/430368311': 'place-university-village',
  'way/430368312': 'place-university-village',
  'way/430368313': 'place-university-village',
  'way/430368314': 'place-university-village',
  'way/430368315': 'place-university-village',
  'way/430368323': 'place-university-village',
  'way/430368324': 'place-university-village',
  'way/430368325': 'place-university-village',
  'way/430368326': 'place-university-village',
  'way/430368327': 'place-university-village',
  'way/430368334': 'place-university-village',
  'way/430368335': 'place-university-village',
  'way/430368336': 'place-university-village',
  'way/430368340': 'place-university-village',
  'way/467077850': 'place-university-village',
};
