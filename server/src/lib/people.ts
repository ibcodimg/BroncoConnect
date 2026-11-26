import type { PublicUser } from '../../../shared/types';
import { displayNameOf } from '../models/User';

type UserLike = {
  publicId: string;
  displayName?: string | null;
  major?: string | null;
  status?: string | null;
  lookingFor?: unknown;
};

export function toPublicUser(u: UserLike): PublicUser {
  return {
    publicId: u.publicId,
    displayName: displayNameOf(u),
    major: u.major ?? undefined,
    status: (u.status as PublicUser['status']) ?? undefined,
    lookingFor: (u.lookingFor as PublicUser['lookingFor']) ?? [],
  };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
