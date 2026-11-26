import type { PublicUser } from '../../../shared/types';
import { displayNameOf, majorsOf } from '../models/User';

type UserLike = {
  publicId: string;
  displayName?: string | null;
  major?: string | null;
  majors?: string[] | null;
  status?: string | null;
  lookingFor?: unknown;
};

export function toPublicUser(u: UserLike): PublicUser {
  return {
    publicId: u.publicId,
    displayName: displayNameOf(u),
    majors: majorsOf(u),
    status: (u.status as PublicUser['status']) ?? undefined,
    lookingFor: (u.lookingFor as PublicUser['lookingFor']) ?? [],
  };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
