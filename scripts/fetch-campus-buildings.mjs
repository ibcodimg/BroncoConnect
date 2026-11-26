#!/usr/bin/env node
// Downloads Cal Poly Pomona building outlines from OpenStreetMap (Overpass API)
// and writes client/public/buildings.geojson for the campus map.
//
//   npm run fetch:buildings
//
// Buildings are matched to chatrooms by their OSM "ref" tag (the building number).
// Check the output on the map; fix any missing/wrong refs by editing the GeoJSON
// (or better: improve OpenStreetMap itself). Map data © OpenStreetMap contributors, ODbL.

import { mkdir, writeFile } from 'node:fs/promises';
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

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BroncoConnect student project' },
  body: new URLSearchParams({ data: query }),
});
if (!res.ok) {
  console.error(`Overpass error ${res.status}: ${await res.text()}`);
  process.exit(1);
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
    properties: { ref: tags.ref ?? null, name: tags.name ?? null },
    geometry,
  });
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify({ type: 'FeatureCollection', features }));

const withRef = features.filter((f) => f.properties.ref).length;
console.log(`Wrote ${features.length} buildings (${withRef} with a building number) to ${path.relative(process.cwd(), outFile)}`);
