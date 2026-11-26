import { Router } from 'express';
import { currentUser, requireUser } from '../lib/auth';
import { Suggestion } from '../models/Suggestion';

export const suggestionsRouter = Router();
suggestionsRouter.use(requireUser);

suggestionsRouter.post('/', async (req, res, next) => {
  try {
    const me = currentUser(res).publicId;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 2000) : '';
    if (!text) return res.status(400).json({ error: 'Write a suggestion first' });
    const hourAgo = new Date(Date.now() - 3600_000);
    if ((await Suggestion.countDocuments({ authorId: me, createdAt: { $gt: hourAgo } })) >= 10) {
      return res.status(429).json({ error: 'Thanks! That’s a lot of suggestions. Try again in a bit.' });
    }
    await Suggestion.create({ authorId: me, text });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
