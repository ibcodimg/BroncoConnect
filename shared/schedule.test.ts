import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campusNow, isHappeningNow, isValidBlock, overlap, scheduleOverlaps, toMinutes } from './schedule';
import type { ScheduleBlock } from './types';

const block = (day: ScheduleBlock['day'], start: string, end: string, buildingId = 'building-8'): ScheduleBlock => ({
  day,
  start,
  end,
  buildingId,
});

test('toMinutes parses HH:MM and rejects junk', () => {
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('13:45'), 13 * 60 + 45);
  assert.ok(Number.isNaN(toMinutes('25:00')));
  assert.ok(Number.isNaN(toMinutes('noon')));
});

test('overlap requires same day, same building, and overlapping time', () => {
  assert.deepEqual(overlap(block('mon', '10:00', '11:15'), block('mon', '11:00', '12:00')), block('mon', '11:00', '11:15'));
  assert.equal(overlap(block('mon', '10:00', '11:00'), block('mon', '11:00', '12:00')), null); // touching ≠ overlapping
  assert.equal(overlap(block('mon', '10:00', '11:00'), block('tue', '10:00', '11:00')), null);
  assert.equal(overlap(block('mon', '10:00', '11:00'), block('mon', '10:00', '11:00', 'building-9')), null);
});

test('scheduleOverlaps finds every shared block', () => {
  const mine = [block('mon', '09:00', '12:00'), block('wed', '09:00', '12:00')];
  const theirs = [block('mon', '11:00', '13:00'), block('wed', '08:00', '09:30'), block('fri', '09:00', '12:00')];
  assert.equal(scheduleOverlaps(mine, theirs).length, 2);
});

test('isValidBlock rejects end before start', () => {
  assert.equal(isValidBlock(block('tue', '12:00', '11:00')), false);
  assert.equal(isValidBlock(block('tue', '11:00', '12:00')), true);
});

test('campusNow uses Pomona time regardless of server time zone', () => {
  // 2026-11-26 05:57 UTC = Wed 21:57 in Pomona (PST, UTC-8)
  const now = campusNow(new Date('2026-11-26T05:57:00Z'));
  assert.deepEqual(now, { day: 'wed', minutes: 21 * 60 + 57 });
  assert.equal(isHappeningNow(block('wed', '21:00', '22:00'), now), true);
  assert.equal(isHappeningNow(block('wed', '22:00', '23:00'), now), false);
});
