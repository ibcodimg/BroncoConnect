import type { BanNotice } from '../../../shared/types';
import { Ban } from '../models/Ban';

/** The active ban (if any) covering this user or IP. Expired and lifted bans don't count. */
export async function findActiveBan({ publicId, ip }: { publicId?: string; ip?: string }) {
  const or = [
    ...(publicId ? [{ kind: 'user', value: publicId }] : []),
    ...(ip ? [{ kind: 'ip', value: ip }] : []),
  ];
  if (or.length === 0) return null;
  return Ban.findOne({
    $or: or,
    liftedAt: null,
    $and: [{ $or: [{ until: null }, { until: { $gt: new Date() } }] }],
  })
    .sort({ until: -1 })
    .lean();
}

export function banNotice(ban: { reason?: string | null; until?: Date | null }): BanNotice {
  return { reason: ban.reason ?? undefined, until: ban.until ? ban.until.toISOString() : null };
}
