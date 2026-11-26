import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from './buildings';
import { roomIdForFeature } from './buildingMatch';

const match = (props: Parameters<typeof roomIdForFeature>[0]) => roomIdForFeature(props, BUILDINGS);

test('matches by ref tag, ignoring leading zeros and prefixes', () => {
  assert.equal(match({ ref: '8' }), 'building-8');
  assert.equal(match({ ref: '08' }), 'building-8');
  assert.equal(match({ ref: 'Bldg 162' }), 'building-162');
});

test('matches "Building N" style names', () => {
  assert.equal(match({ name: 'Building 8' }), 'building-8');
  assert.equal(match({ name: 'Bldg. 15 - Library' }), 'building-15');
  assert.equal(match({ name: 'Building One' }), 'building-1');
});

test('matches by real building name', () => {
  assert.equal(match({ name: 'University Library' }), 'building-15');
  assert.equal(match({ name: 'College of Science' }), 'building-8');
  assert.equal(match({ official_name: 'Bronco Student Center' }), 'building-35');
});

test('does not match unrelated buildings', () => {
  assert.equal(match({ name: 'Parking Structure 2' }), null);
  assert.equal(match({ name: 'Shed' }), null);
  assert.equal(match({}), null);
  assert.equal(match(null), null);
});

test('lettered annexes join their main building unless they have their own room', () => {
  assert.equal(match({ name: 'Building 24C' }), 'building-24');
  assert.equal(match({ name: 'Building 79B - Collins College of Hospitality Management' }), 'building-79');
  assert.equal(match({ name: 'Building 4A - BioTrek Learning Center' }), 'building-4a');
  assert.equal(match({ name: 'Building 209R: John T. Lyle Center for Regenerative Studies' }), 'building-209');
});
