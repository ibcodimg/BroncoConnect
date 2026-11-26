import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { findRoom } from '../../../shared/buildings';
import { AUDIT_TYPES, type AdminStats, type AuditType, type AuditView, type BanView, type ReportView, type RoomMessageCount, type Stroke, type SuggestionView } from '../../../shared/types';
import { config } from '../config';
import { currentUser, requireAdmin, requireUser } from '../lib/auth';
import { findActiveBan } from '../lib/bans';
import { escapeRegex, toPublicUser } from '../lib/people';
import { audit } from '../lib/audit';
import { emitToRoom, kickBanned, onlineCount } from '../lib/realtime';
import { AuditEvent } from '../models/AuditEvent';
import { DirectMessage } from '../models/DirectMessage';
import { Friendship } from '../models/Friendship';
import { Message } from '../models/Message';
import { Suggestion } from '../models/Suggestion';
import { Ban } from '../models/Ban';
import { Report } from '../models/Report';
import { User, displayNameOf } from '../models/User';

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
    const ids = [...new Set(reports.flatMap((r) => [r.reporterId, r.targetId]).filter((id): id is string => !!id))];
    const users = new Map((await User.find({ publicId: { $in: ids } }).lean()).map((u) => [u.publicId, u]));
    const banned = new Set<string>();
    for (const id of new Set(reports.map((r) => r.targetId).filter((id): id is string => !!id))) {
      const u = users.get(id);
      if (await findActiveBan({ publicId: id, ip: u?.lastIp ?? undefined })) banned.add(id);
    }
    const unknown = (publicId: string) => ({ publicId, displayName: '(deleted user)', majors: [], lookingFor: [] });
    const result: ReportView[] = reports.map((r) => {
      const target = r.targetId ? users.get(r.targetId) : undefined;
      return {
        id: String(r._id),
        reason: r.reason as ReportView['reason'],
        details: r.details ?? undefined,
        roomId: r.roomId ?? undefined,
        status: r.status as ReportView['status'],
        createdAt: (r.createdAt ?? new Date()).toISOString(),
        reporter: users.get(r.reporterId) ? toPublicUser(users.get(r.reporterId)!) : unknown(r.reporterId),
        target: r.targetId
          ? {
              ...(target ? toPublicUser(target) : unknown(r.targetId)),
              lastIp: target?.lastIp ?? undefined,
              banned: banned.has(r.targetId),
            }
          : undefined,
        context: (r.context ?? []).map((c) => ({ text: c.text ?? '', createdAt: (c.createdAt ?? new Date()).toISOString() })),
        messageKind: (r.messageKind as ReportView['messageKind']) ?? undefined,
        surrounding: (r.surrounding ?? []).map((l) => ({
          authorId: l.authorId ?? '',
          authorName: l.authorName ?? '',
          text: l.text ?? '',
          createdAt: (l.createdAt ?? new Date()).toISOString(),
          ...(l.reported ? { reported: true } : {}),
        })),
        drawings: (Array.isArray(r.drawings) ? r.drawings : []) as { roomId: string; strokes: Stroke[] }[],
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/reports/:id/:action(resolve|reopen)', async (req, res, next) => {
  try {
    const r = await Report.findByIdAndUpdate(req.params.id, { $set: { status: req.params.action === 'resolve' ? 'resolved' : 'open' } }).lean();
    if (r && req.params.action === 'resolve') {
      const admin = currentUser(res);
      audit('report-resolved', { actor: { publicId: admin.publicId, displayName: displayNameOf(admin) }, detail: `${r.reason} report resolved` });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Suggestions ----

adminRouter.get('/suggestions', async (req, res, next) => {
  try {
    const status = req.query.status === 'done' ? 'done' : 'open';
    const list = await Suggestion.find({ status }).sort({ createdAt: -1 }).limit(300).lean();
    const users = new Map((await User.find({ publicId: { $in: list.map((s) => s.authorId) } }).lean()).map((u) => [u.publicId, u]));
    const result: SuggestionView[] = list.map((s) => ({
      id: String(s._id),
      text: s.text,
      status: s.status as SuggestionView['status'],
      createdAt: (s.createdAt ?? new Date()).toISOString(),
      author: users.get(s.authorId) ? toPublicUser(users.get(s.authorId)!) : { publicId: s.authorId, displayName: '(deleted user)', majors: [], lookingFor: [] },
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/suggestions/:id/:action(done|reopen)', async (req, res, next) => {
  try {
    await Suggestion.updateOne({ _id: req.params.id }, { $set: { status: req.params.action === 'done' ? 'done' : 'open' } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Chatrooms ----

/** Message counts per room (rooms with messages only). */
adminRouter.get('/rooms', async (_req, res, next) => {
  try {
    const counts = await Message.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$roomId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const result: RoomMessageCount[] = counts.map((c) => ({ roomId: c._id, count: c.count }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Purge every message in one chatroom, or in all of them (roomId = 'all'). */
adminRouter.delete('/rooms/:roomId/messages', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (roomId !== 'all' && !findRoom(roomId)) return res.status(404).json({ error: 'Unknown room' });
    const { deletedCount } = await Message.deleteMany(roomId === 'all' ? {} : { roomId });
    emitToRoom(roomId, 'chat:cleared', { roomId });
    const admin = currentUser(res);
    audit('chat-purged', {
      actor: { publicId: admin.publicId, displayName: displayNameOf(admin) },
      roomId: roomId === 'all' ? undefined : roomId,
      detail: `${deletedCount} message(s) deleted from ${roomId === 'all' ? 'ALL chatrooms' : roomId}`,
    });
    res.json({ ok: true, deleted: deletedCount });
  } catch (err) {
    next(err);
  }
});

// ---- Audit log ----

/**
 * Newest first, 100 per page. Query: types=a,b · user=<username or publicId> · roomId · q=<text> · before=<ISO date>
 * Private messages are never in the log.
 */
adminRouter.get('/audit', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = {};
    const types = String(req.query.types ?? '')
      .split(',')
      .filter((t): t is AuditType => (AUDIT_TYPES as readonly string[]).includes(t));
    if (types.length) filter.type = { $in: types };
    if (typeof req.query.roomId === 'string' && req.query.roomId) filter.roomId = req.query.roomId;
    if (typeof req.query.q === 'string' && req.query.q.trim()) filter.detail = { $regex: escapeRegex(req.query.q.trim().slice(0, 60)), $options: 'i' };
    if (typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before))) filter.createdAt = { $lt: new Date(req.query.before) };
    const who = typeof req.query.user === 'string' ? req.query.user.trim().slice(0, 32) : '';
    if (who) {
      const ids = (await User.find({ $or: [{ displayName: { $regex: escapeRegex(who), $options: 'i' } }, { publicId: who }] }, { publicId: 1 }).limit(50).lean()).map((u) => u.publicId);
      filter.$or = [{ actorId: { $in: ids } }, { targetId: { $in: ids } }];
    }
    const events = await AuditEvent.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const result: AuditView[] = events.map((e) => ({
      id: String(e._id),
      type: e.type as AuditType,
      createdAt: (e.createdAt ?? new Date()).toISOString(),
      actor: e.actorId ? { publicId: e.actorId, displayName: e.actorName ?? '' } : undefined,
      target: e.targetId ? { publicId: e.targetId, displayName: e.targetName ?? '' } : undefined,
      roomId: e.roomId ?? undefined,
      detail: e.detail ?? undefined,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---- Overview ----

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const day = new Date(Date.now() - 24 * 3600_000);
    const week = new Date(Date.now() - 7 * 24 * 3600_000);
    const [users, usersWithName, activeToday, activeThisWeek, chatMessages, directMessages, friendships, openReports, openSuggestions, activeBans, topRooms] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ displayName: { $exists: true, $nin: [null, ''] } }),
        User.countDocuments({ lastSeenAt: { $gt: day } }),
        User.countDocuments({ lastSeenAt: { $gt: week } }),
        Message.countDocuments(),
        DirectMessage.estimatedDocumentCount(),
        Friendship.countDocuments({ status: 'accepted' }),
        Report.countDocuments({ status: 'open' }),
        Suggestion.countDocuments({ status: 'open' }),
        Ban.countDocuments({ liftedAt: null, $or: [{ until: null }, { until: { $gt: new Date() } }] }),
        Message.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$roomId', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
      ]);
    const stats: AdminStats = {
      users,
      usersWithName,
      activeToday,
      activeThisWeek,
      onlineNow: onlineCount(),
      chatMessages,
      directMessages,
      friendships,
      openReports,
      openSuggestions,
      activeBans,
      topRooms: topRooms.map((r) => ({ roomId: r._id, count: r.count })),
    };
    res.json(stats);
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
    audit('ban', {
      actor: { publicId: admin.publicId, displayName: displayNameOf(admin) },
      target: { publicId: target.publicId, displayName: displayNameOf(target) },
      detail: `${kind === 'ip' ? 'IP' : 'user'} ban, ${until ? `until ${until.toISOString()}` : 'permanent'}${typeof reason === 'string' && reason ? ` · ${reason.slice(0, 200)}` : ''}`,
    });
    res.json({ ok: true, id: String(ban._id) });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/bans/:id', async (req, res, next) => {
  try {
    const ban = await Ban.findByIdAndUpdate(req.params.id, { $set: { liftedAt: new Date() } }).lean();
    if (ban) {
      const admin = currentUser(res);
      const target = ban.kind === 'user' ? await User.findOne({ publicId: ban.value }).lean() : null;
      audit('unban', {
        actor: { publicId: admin.publicId, displayName: displayNameOf(admin) },
        target: target ? { publicId: target.publicId, displayName: displayNameOf(target) } : undefined,
        detail: ban.kind === 'ip' ? `IP ${ban.value} unbanned` : 'user ban lifted',
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
