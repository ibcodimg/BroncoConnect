import { Router } from 'express';
import { findRoom } from '../../../shared/buildings';
import { currentUser, requireAdmin, requireUser } from '../lib/auth';
import { CustomOutline } from '../models/CustomOutline';
import { MapLink } from '../models/MapLink';

/** Public: admin map fixes — outline→room links and hand-drawn outlines. */
export const mapLinksRouter = Router();

const isRoom = (roomId: unknown): roomId is string => typeof roomId === 'string' && roomId !== 'campus' && !!findRoom(roomId);

mapLinksRouter.get('/', async (_req, res, next) => {
  try {
    const [links, outlines] = await Promise.all([MapLink.find().lean(), CustomOutline.find().lean()]);
    res.json({
      links: Object.fromEntries(links.map((l) => [l.featureId, l.roomId])),
      outlines: outlines.map((o) => ({ id: String(o._id), roomId: o.roomId, coordinates: o.coordinates })),
    });
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
    } else if (roomId === 'none' || isRoom(roomId)) {
      await MapLink.updateOne({ featureId }, { $set: { roomId } }, { upsert: true });
    } else {
      return res.status(400).json({ error: 'Bad roomId' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Admin: save a hand-drawn outline. Body: { roomId, coordinates: [[lng, lat], ...] } (3–200 corners, near campus). */
mapLinksRouter.post('/outlines', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const { roomId, coordinates } = req.body ?? {};
    if (!isRoom(roomId)) return res.status(400).json({ error: 'Bad roomId' });
    const ok =
      Array.isArray(coordinates) &&
      coordinates.length >= 3 &&
      coordinates.length <= 200 &&
      coordinates.every(
        (c: unknown) =>
          Array.isArray(c) &&
          c.length === 2 &&
          Number.isFinite(c[0]) &&
          Number.isFinite(c[1]) &&
          c[0] > -117.85 &&
          c[0] < -117.79 &&
          c[1] > 34.03 &&
          c[1] < 34.08,
      );
    if (!ok) return res.status(400).json({ error: 'Outline must be 3–200 points on campus' });
    const o = await CustomOutline.create({ roomId, coordinates, createdBy: currentUser(res).publicId });
    res.json({ id: String(o._id) });
  } catch (err) {
    next(err);
  }
});

mapLinksRouter.delete('/outlines/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    await CustomOutline.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
