import { Router } from 'express';
import type { FriendsList } from '../../../shared/types';
import { currentUser, requireUser } from '../lib/auth';
import { toPublicUser } from '../lib/people';
import { audit } from '../lib/audit';
import { emitToUser, isOnline } from '../lib/realtime';
import { displayNameOf } from '../models/User';
import { Friendship, pairKey } from '../models/Friendship';
import { User } from '../models/User';

export const friendsRouter = Router();
friendsRouter.use(requireUser);

friendsRouter.get('/', async (_req, res, next) => {
  try {
    const me = currentUser(res).publicId;
    const links = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] }).lean();
    const otherIds = links.map((l) => (l.requester === me ? l.recipient : l.requester));
    const users = new Map((await User.find({ publicId: { $in: otherIds } }).lean()).map((u) => [u.publicId, u]));
    const list: FriendsList = { friends: [], incoming: [], outgoing: [] };
    for (const l of links) {
      const other = users.get(l.requester === me ? l.recipient : l.requester);
      if (!other) continue;
      const pub = toPublicUser(other);
      if (l.status === 'accepted') list.friends.push({ ...pub, online: isOnline(pub.publicId) });
      else if (l.requester === me) list.outgoing.push(pub);
      else list.incoming.push(pub);
    }
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** Send a friend request, or accept theirs if they already asked you. */
friendsRouter.post('/:publicId', async (req, res, next) => {
  try {
    const meDoc = currentUser(res);
    const me = meDoc.publicId;
    const other = req.params.publicId;
    if (other === me) return res.status(400).json({ error: "You can't friend yourself" });
    const otherDoc = await User.findOne({ publicId: other }).lean();
    if (!otherDoc) return res.status(404).json({ error: 'Not found' });
    const who = { actor: { publicId: me, displayName: displayNameOf(meDoc) }, target: { publicId: other, displayName: displayNameOf(otherDoc) } };

    const pair = pairKey(me, other);
    const existing = await Friendship.findOne({ pair });
    if (!existing) {
      await Friendship.create({ pair, requester: me, recipient: other });
      audit('friend-request', who);
    } else if (existing.status === 'pending' && existing.recipient === me) {
      existing.status = 'accepted';
      await existing.save();
      audit('friend-accept', who);
    }
    emitToUser(other, 'friend:update');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Unfriend, cancel your request, or decline theirs. */
friendsRouter.delete('/:publicId', async (req, res, next) => {
  try {
    const meDoc = currentUser(res);
    const me = meDoc.publicId;
    const { deletedCount } = await Friendship.deleteOne({ pair: pairKey(me, req.params.publicId) });
    if (deletedCount) {
      const otherDoc = await User.findOne({ publicId: req.params.publicId }).lean();
      audit('friend-remove', {
        actor: { publicId: me, displayName: displayNameOf(meDoc) },
        target: { publicId: req.params.publicId, displayName: otherDoc ? displayNameOf(otherDoc) : undefined },
        detail: 'unfriended, cancelled or declined',
      });
    }
    emitToUser(req.params.publicId, 'friend:update');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
