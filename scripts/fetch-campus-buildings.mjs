#!/usr/bin/env node
// Downloads Cal Poly Pomona building outlines from OpenStreetMap (Overpass API)
// and writes client/public/buildings.geojson for the campus map.
//
//   npm run fetch:buildings
//
// Buildings are matched to chatrooms by their OSM "ref" tag (the building number).
// Check the output on the map; fix any missing/wrong refs by editing the GeoJSON
// (or better: improve OpenStreetMap itself). Map data © OpenStreetMap contributors, ODbL.

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Rough bounding box around the main CPP campus: south, west, north, east. Adjust if buildings are cut off.
const BBOX = [34.048, -117.832, 34.066, -117.81];

const query = `
[out:json][timeout:60];
(
  way["building"](${BBOX.join(',')});
  relation["building"](${BBOX.join(',')});
);
out geom tags;
`;

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, '../client/public/buildings.geojson');

// --if-missing: keep an existing (e.g. committed, hand-fixed) file instead of downloading again.
if (process.argv.includes('--if-missing')) {
  const exists = await access(outFile).then(() => true, () => false);
  if (exists) {
    console.log('buildings.geojson already exists, skipping download');
    process.exit(0);
  }
}

// Public Overpass servers are often busy; try a few mirrors.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

let res = null;
for (const url of MIRRORS) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BroncoConnect student project' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(60_000),
    });
    if (r.ok) {
      res = r;
      break;
    }
    console.error(`${url} → ${r.status}`);
  } catch (err) {
    console.error(`${url} → ${err.message}`);
  }
}
if (!res) {
  // Don't fail a deploy over map outlines: the building list still works without them.
  // Committing client/public/buildings.geojson avoids this download entirely.
  console.error('Could not download building outlines from any OpenStreetMap mirror.');
  process.exit(process.argv.includes('--if-missing') ? 0 : 1);
}
const { elements } = await res.json();

const ring = (geometry) => {
  const coords = geometry.map((p) => [p.lon, p.lat]);
  const [first, last] = [coords[0], coords[coords.length - 1]];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) coords.push(first);
  return coords;
};

const features = [];
for (const el of elements) {
  const tags = el.tags ?? {};
  let geometry = null;
  if (el.type === 'way' && el.geometry?.length >= 3) {
    geometry = { type: 'Polygon', coordinates: [ring(el.geometry)] };
  } else if (el.type === 'relation') {
    const outers = (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry?.length >= 3);
    if (outers.length) geometry = { type: 'MultiPolygon', coordinates: outers.map((m) => [ring(m.geometry)]) };
  }
  if (!geometry) continue;
  features.push({
    type: 'Feature',
    id: `${el.type}/${el.id}`,
    // Several name tags so the app can match a building to its chatroom even when "ref" (the number) is missing.
    properties: {
      ref: tags.ref ?? null,
      name: tags.name ?? null,
      alt_name: tags.alt_name ?? null,
      short_name: tags.short_name ?? null,
      official_name: tags.official_name ?? null,
    },
    geometry,
  });
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify({ type: 'FeatureCollection', features }));

const withRef = features.filter((f) => f.properties.ref).length;
console.log(`Wrote ${features.length} buildings (${withRef} with a building number) to ${path.relative(process.cwd(), outFile)}`);
