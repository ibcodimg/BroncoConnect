import { Router } from 'express';
import { ALL_ROOMS, findRoom } from '../../../shared/buildings';
import { campusNow, isHappeningNow } from '../../../shared/schedule';
import type { BuildingSummary, ScheduleBlock } from '../../../shared/types';
import { presence } from '../lib/presence';
import { User } from '../models/User';

export const buildingsRouter = Router();

/** buildingId → number of people whose schedule puts them there right now. */
async function onCampusNowCounts(): Promise<Map<string, number>> {
  const now = campusNow();
  const users = await User.find({ 'schedule.day': now.day }, { schedule: 1 }).lean();
  const counts = new Map<string, number>();
  let anywhere = 0;
  for (const u of users) {
    const here = new Set<string>();
    for (const block of u.schedule as ScheduleBlock[]) {
      if (isHappeningNow(block, now)) here.add(block.buildingId);
    }
    for (const id of here) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (here.size > 0) anywhere++;
  }
  counts.set('campus', anywhere);
  return counts;
}

buildingsRouter.get('/', async (_req, res, next) => {
  try {
    const counts = await onCampusNowCounts();
    const result: BuildingSummary[] = ALL_ROOMS.map((b) => ({
      ...b,
      onlineCount: presence.count(b.id),
      onCampusNow: counts.get(b.id) ?? 0,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

buildingsRouter.get('/:id', async (req, res, next) => {
  try {
    const building = findRoom(req.params.id);
    if (!building) return res.status(404).json({ error: 'Unknown building' });
    const counts = await onCampusNowCounts();
    const result: BuildingSummary = {
      ...building,
      onlineCount: presence.count(building.id),
      onCampusNow: counts.get(building.id) ?? 0,
    };
    res.json(result);
  } catch (err) {
    next(err);
  }
});
