import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { BanView, ReportView } from '../../../shared/types';
import { config } from '../config';
import { currentUser, requireAdmin, requireUser } from '../lib/auth';
import { findActiveBan } from '../lib/bans';
import { escapeRegex, toPublicUser } from '../lib/people';
import { kickBanned } from '../lib/realtime';
import { Ban } from '../models/Ban';
import { Report } from '../models/Report';
import { User } from '../models/User';

export const adminRouter = Router();
adminRouter.use(requireUser);

function tokenMatches(given: unknown): boolean {
  if (!config.adminToken || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.adminToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Make this browser's identity an admin by entering ADMIN_TOKEN once. */
adminRouter.post('/claim', async (req, res, next) => {
  try {
    if (!config.adminToken) return res.status(503).json({ error: 'ADMIN_TOKEN is not set on the server.' });
    if (!tokenMatches(req.body?.token)) return res.status(403).json({ error: 'Wrong admin token.' });
    const me = currentUser(res);
    me.isAdmin = true;
    await me.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.use(requireAdmin);

// ---- Reports ----

adminRouter.get('/reports', async (req, res, next) => {
  try {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const reports = await Report.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
    const ids = [...new Set(reports.flatMap((r) => [r.reporterId, r.targetId]))];
    const users = new Map((await User.find({ publicId: { $in: ids } }).lean()).map((u) => [u.publicId, u]));
    const banned = new Set<string>();
    for (const id of new Set(reports.map((r) => r.targetId))) {
      const u = users.get(id);
      if (await findActiveBan({ publicId: id, ip: u?.lastIp ?? undefined })) banned.add(id);
    }
    const unknown = (publicId: string) => ({ publicId, displayName: '(deleted user)', lookingFor: [] });
    const result: ReportView[] = reports.map((r) => {
      const target = users.get(r.targetId);
      return {
        id: String(r._id),
        reason: r.reason as ReportView['reason'],
        details: r.details ?? undefined,
        roomId: r.roomId ?? undefined,
        status: r.status as ReportView['status'],
        createdAt: (r.createdAt ?? new Date()).toISOString(),
        reporter: users.get(r.reporterId) ? toPublicUser(users.get(r.reporterId)!) : unknown(r.reporterId),
        target: {
          ...(target ? toPublicUser(target) : unknown(r.targetId)),
          lastIp: target?.lastIp ?? undefined,
          banned: banned.has(r.targetId),
        },
        context: (r.context ?? []).map((c) => ({ text: c.text ?? '', createdAt: (c.createdAt ?? new Date()).toISOString() })),
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/reports/:id/:action(resolve|reopen)', async (req, res, next) => {
  try {
    await Report.updateOne({ _id: req.params.id }, { $set: { status: req.params.action === 'resolve' ? 'resolved' : 'open' } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Users ----

/** Look people up by username (admins also see their last IP). */
adminRouter.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim().slice(0, 32);
    const filter = q ? { $or: [{ displayName: { $regex: escapeRegex(q), $options: 'i' } }, { publicId: q }] } : {};
    const users = await User.find(filter).sort({ lastSeenAt: -1 }).limit(30).lean();
    res.json(
      users.map((u) => ({
        ...toPublicUser(u),
        lastIp: u.lastIp ?? undefined,
        isAdmin: !!u.isAdmin,
        lastSeenAt: (u.lastSeenAt ?? new Date()).toISOString(),
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---- Bans ----

adminRouter.get('/bans', async (_req, res, next) => {
  try {
    const bans = await Ban.find({ liftedAt: null, $or: [{ until: null }, { until: { $gt: new Date() } }] })
      .sort({ createdAt: -1 })
      .lean();
    const names = new Map(
      (await User.find({ publicId: { $in: bans.filter((b) => b.kind === 'user').map((b) => b.value) } }).lean()).map((u) => [
        u.publicId,
        toPublicUser(u).displayName,
      ]),
    );
    const result: BanView[] = bans.map((b) => ({
      id: String(b._id),
      kind: b.kind as BanView['kind'],
      value: b.value,
      displayName: b.kind === 'user' ? names.get(b.value) : undefined,
      reason: b.reason ?? undefined,
      until: b.until ? b.until.toISOString() : null,
      createdAt: (b.createdAt ?? new Date()).toISOString(),
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Ban someone. Body: { publicId, kind: 'user' | 'ip', hours?: number | null, reason?: string }.
 * kind 'ip' bans the IP they last used. hours null/absent = permanent.
 */
adminRouter.post('/bans', async (req, res, next) => {
  try {
    const admin = currentUser(res);
    const { publicId, kind, hours, reason } = req.body ?? {};
    if (kind !== 'user' && kind !== 'ip') return res.status(400).json({ error: 'kind must be user or ip' });
    const target = await User.findOne({ publicId }).lean();
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.isAdmin) return res.status(400).json({ error: "Admins can't be banned." });

    let value = target.publicId;
    if (kind === 'ip') {
      if (!target.lastIp) return res.status(400).json({ error: 'No IP recorded for this user yet.' });
      if (await User.exists({ isAdmin: true, lastIp: target.lastIp })) {
        return res.status(400).json({ error: 'That IP is also used by an admin (you?) — use a user ban instead.' });
      }
      value = target.lastIp;
    }

    const h = Number(hours);
    const until = hours == null || hours === '' || !Number.isFinite(h) || h <= 0 ? null : new Date(Date.now() + h * 3600_000);
    const ban = await Ban.create({
      kind,
      value,
      until,
      reason: typeof reason === 'string' ? reason.slice(0, 300) : undefined,
      createdBy: admin.publicId,
    });
    kickBanned(ban);
    res.json({ ok: true, id: String(ban._id) });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/bans/:id', async (req, res, next) => {
  try {
    await Ban.updateOne({ _id: req.params.id }, { $set: { liftedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
