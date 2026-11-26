import type { BuildingSummary, Match, UserProfile } from '@shared/types';
import { getAnonId } from './identity';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type MyProfile = UserProfile & { publicId: string };

export const api = {
  buildings: () => request<BuildingSummary[]>('/buildings'),
  building: (id: string) => request<BuildingSummary>(`/buildings/${encodeURIComponent(id)}`),
  myProfile: () => request<MyProfile>(`/users/${getAnonId()}`),
  saveProfile: (profile: UserProfile) =>
    request<MyProfile>(`/users/${getAnonId()}`, { method: 'PUT', body: JSON.stringify(profile) }),
  matches: () => request<Match[]>(`/users/${getAnonId()}/matches`),
};
