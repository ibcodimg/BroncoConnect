import { Router } from 'express';
import { findRoom } from '../../../shared/buildings';
import { requireAdmin, requireUser } from '../lib/auth';
import { MapLink } from '../models/MapLink';

/** Public: featureId → roomId (or 'none'). */
export const mapLinksRouter = Router();

mapLinksRouter.get('/', async (_req, res, next) => {
  try {
    const links = await MapLink.find().lean();
    res.json(Object.fromEntries(links.map((l) => [l.featureId, l.roomId])));
  } catch (err) {
    next(err);
  }
});

/** Admin: link an outline to a room. Body: { featureId, roomId } where roomId is a room id, 'none', or null (= back to automatic). */
mapLinksRouter.put('/', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const { featureId, roomId } = req.body ?? {};
    if (typeof featureId !== 'string' || !/^(way|relation)\/\d+$/.test(featureId)) return res.status(400).json({ error: 'Bad featureId' });
    if (roomId === null) {
      await MapLink.deleteOne({ featureId });
    } else if (roomId === 'none' || (typeof roomId === 'string' && findRoom(roomId) && roomId !== 'campus')) {
      await MapLink.updateOne({ featureId }, { $set: { roomId } }, { upsert: true });
    } else {
      return res.status(400).json({ error: 'Bad roomId' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
