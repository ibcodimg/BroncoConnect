#!/usr/bin/env node
// Downloads every course (code + title) from Cal Poly Pomona's online catalog (catalog.cpp.edu)
// and writes client/public/cpp-courses.json, which powers the course tag picker in profiles.
//
//   npm run fetch:courses
//   npm run fetch:courses -- --url "https://catalog.cpp.edu/content.php?catoid=XX&navoid=YYYY"
//
// The catalog is an Acalog site: its "Course Descriptions" page lists courses 100 per page as links
// like "CS 3310 - Design and Analysis of Algorithms". Commit the JSON afterwards so deploys have it.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://catalog.cpp.edu';
// 2026–27 catalog "Course Descriptions" page. Used when the link can't be found on the home page.
const DEFAULT_LISTING = 'https://catalog.cpp.edu/content.php?catoid=78&navoid=7093';
const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, '../client/public/cpp-courses.json');

const argUrl = (() => {
  const i = process.argv.indexOf('--url');
  return i > -1 ? process.argv[i + 1] : null;
})();

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BroncoConnect student project (course list)' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

/** Find the current catalog's course listing link on the catalog home page. */
async function findListingUrl() {
  const html = await get(`${BASE}/`);
  const links = [...html.matchAll(/<a[^>]+href="([^"]*content\.php\?catoid=\d+&(?:amp;)?navoid=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1].replace(/&amp;/g, '&'),
    text: decode(m[2]),
  }));
  const hit = links.find((l) => /course descriptions/i.test(l.text)) ?? links.find((l) => /^courses?$/i.test(l.text));
  if (!hit) {
    console.log('Could not find the "Course Descriptions" link on the catalog home page; using the 2026–27 default.');
    return DEFAULT_LISTING;
  }
  return new URL(hit.href, BASE).toString();
}

const COURSE = /^([A-Z]{2,5})\s+(\d{3,4}[A-Z]{0,2})\s*[-–—]\s*(.+)$/;

async function main() {
  const listing = argUrl ?? (await findListingUrl());
  console.log(`Course listing: ${listing}`);
  const courses = new Map(); // code → title

  for (let page = 1; page <= 200; page++) {
    const url = `${listing}&filter%5Bitem_type%5D=3&filter%5Bonly_active%5D=1&filter%5B3%5D=1&filter%5Bcpage%5D=${page}`;
    const html = await get(url);
    const before = courses.size;
    for (const m of html.matchAll(/<a[^>]+href="[^"]*preview_course[^"]*coid=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = decode(m[1]);
      const c = COURSE.exec(text);
      if (c) courses.set(`${c[1]} ${c[2]}`, c[3]);
    }
    const added = courses.size - before;
    process.stdout.write(`page ${page}: +${added} (total ${courses.size})\n`);
    if (added === 0) break;
    await new Promise((r) => setTimeout(r, 300)); // be polite to the catalog server
  }

  if (courses.size < 50) {
    console.error(`Only found ${courses.size} courses; the catalog layout may have changed. Nothing written.`);
    console.error('Tip: on Windows, put the URL in quotes — an unquoted & cuts it off.');
    process.exit(1);
  }

  const sorted = [...courses].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(sorted));
  console.log(`Wrote ${sorted.length} courses to ${path.relative(process.cwd(), outFile)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
