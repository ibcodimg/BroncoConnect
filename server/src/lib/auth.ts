import type { NextFunction, Request, Response } from 'express';
import { getOrCreateUser } from '../models/User';
import { banNotice, findActiveBan } from './bans';

export const ANON_ID = /^[A-Za-z0-9-]{16,64}$/;

/** Real client IP. Render (and most hosts) put the original address first in X-Forwarded-For. */
export function ipFrom(forwarded: string | string[] | undefined, fallback?: string): string {
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = header?.split(',')[0]?.trim() || fallback || 'unknown';
  return ip.replace(/^::ffff:/, '');
}

export const requestIp = (req: Request) => ipFrom(req.headers['x-forwarded-for'], req.socket.remoteAddress);

export type AuthedUser = Awaited<ReturnType<typeof getOrCreateUser>>;

/**
 * Loads the caller from the X-Anon-Id header (creating them if new), records their IP,
 * and blocks banned users/IPs. Admins are never blocked, so you can't lock yourself out.
 */
export async function loadUser(anonId: string, ip: string) {
  const user = await getOrCreateUser(anonId);
  if (user.lastIp !== ip) {
    user.lastIp = ip;
    await user.save();
  }
  const ban = user.isAdmin ? null : await findActiveBan({ publicId: user.publicId, ip });
  return { user, ban };
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const anonId = String(req.headers['x-anon-id'] ?? '');
    if (!ANON_ID.test(anonId)) return res.status(401).json({ error: 'Missing X-Anon-Id' });
    const { user, ban } = await loadUser(anonId, requestIp(req));
    if (ban) return res.status(403).json({ error: 'banned', ban: banNotice(ban) });
    res.locals.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(res.locals.user as AuthedUser | undefined)?.isAdmin) return res.status(403).json({ error: 'Admins only' });
  next();
}

export const currentUser = (res: Response) => res.locals.user as NonNullable<AuthedUser>;
