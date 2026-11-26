import type { Building } from './types';

export interface FeatureProps {
  ref?: string | null;
  name?: string | null;
  alt_name?: string | null;
  short_name?: string | null;
  official_name?: string | null;
}

/** "08", "Bldg 8", "8" → "8"; "98P" → "98p". */
function normalizeNumber(s: string): string | null {
  const m = /(\d+)\s*([a-z])?\b/i.exec(s);
  return m ? `${Number(m[1])}${(m[2] ?? '').toLowerCase()}` : null;
}

const normalizeName = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Figures out which chatroom an OpenStreetMap building belongs to.
 * OSM data is inconsistent, so try (1) the ref tag, (2) "Building 8"-style names, (3) the building's real name.
 */
export function roomIdForFeature(props: FeatureProps | null | undefined, buildings: Building[]): string | null {
  if (!props) return null;
  const byNumber = new Map(buildings.filter((b) => b.id !== 'campus').map((b) => [b.number.toLowerCase(), b.id]));
  const names = [props.name, props.alt_name, props.short_name, props.official_name].filter((n): n is string => !!n);

  const numberCandidates = [
    props.ref ? normalizeNumber(props.ref) : null,
    ...names.map((n) => {
      const m = /\b(?:building|bldg\.?)\s*#?\s*(\d+\s*[a-z]?)\b/i.exec(n);
      return m ? normalizeNumber(m[1]) : null;
    }),
  ];
  for (const n of numberCandidates) {
    if (n && byNumber.has(n)) return byNumber.get(n)!;
  }
  // Lettered annexes (24A, 79B, 209R…) join the main building when they don't have their own room.
  for (const n of numberCandidates) {
    const base = n?.replace(/[a-z]$/, '');
    if (base && base !== n && byNumber.has(base)) return byNumber.get(base)!;
  }

  for (const raw of names) {
    const n = normalizeName(raw);
    if (n.length < 5) continue;
    const hit = buildings.find((b) => {
      if (b.id === 'campus') return false;
      const bn = normalizeName(b.name);
      return bn === n || (bn.length >= 8 && (n.includes(bn) || bn.includes(n)));
    });
    if (hit) return hit.id;
  }
  return null;
}
