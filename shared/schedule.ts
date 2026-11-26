import type { Day, ScheduleBlock } from './types';
import { DAYS } from './types';

export const CAMPUS_TIME_ZONE = 'America/Los_Angeles';

/** "HH:MM" → minutes since midnight. Returns NaN for bad input. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

export function isValidBlock(b: ScheduleBlock): boolean {
  const s = toMinutes(b.start);
  const e = toMinutes(b.end);
  return DAYS.includes(b.day) && !Number.isNaN(s) && !Number.isNaN(e) && s < e && !!b.buildingId;
}

/** Same day, same building, and the time ranges overlap. Returns the overlapping block or null. */
export function overlap(a: ScheduleBlock, b: ScheduleBlock): ScheduleBlock | null {
  if (a.day !== b.day || a.buildingId !== b.buildingId) return null;
  const start = Math.max(toMinutes(a.start), toMinutes(b.start));
  const end = Math.min(toMinutes(a.end), toMinutes(b.end));
  if (!(start < end)) return null;
  return { day: a.day, buildingId: a.buildingId, start: fromMinutes(start), end: fromMinutes(end) };
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** All overlaps between two schedules. O(n·m), fine for weekly schedules. */
export function scheduleOverlaps(mine: ScheduleBlock[], theirs: ScheduleBlock[]): ScheduleBlock[] {
  const result: ScheduleBlock[] = [];
  for (const a of mine) {
    for (const b of theirs) {
      const o = overlap(a, b);
      if (o) result.push(o);
    }
  }
  return result;
}

/** Current day + minutes on campus (Pomona time), regardless of the server's time zone. */
export function campusNow(date = new Date()): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = get('weekday').slice(0, 3).toLowerCase() as Day;
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function isHappeningNow(block: ScheduleBlock, now = campusNow()): boolean {
  return block.day === now.day && toMinutes(block.start) <= now.minutes && now.minutes < toMinutes(block.end);
}

export const DAY_LABELS: Record<Day, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
