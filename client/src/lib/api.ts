import type {
  BanNotice,
  BanView,
  BuildingSummary,
  Conversation,
  DirectMessage,
  FriendsList,
  Match,
  PublicProfile,
  PublicUser,
  ReportReason,
  ReportView,
  UserProfile,
} from '@shared/types';
import { getAnonId } from './identity';

/** Fired when the server says this browser/IP is banned; the session shows the ban screen. */
export const BANNED_EVENT = 'broncoconnect:banned';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Anon-Id': getAnonId(), ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && body?.error === 'banned') {
      window.dispatchEvent(new CustomEvent<BanNotice>(BANNED_EVENT, { detail: body.ban }));
    }
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });

export type MyProfile = UserProfile & { publicId: string };
export type AdminUser = PublicUser & { lastIp?: string; isAdmin: boolean; lastSeenAt: string };

export const api = {
  buildings: () => request<BuildingSummary[]>('/buildings'),
  building: (id: string) => request<BuildingSummary>(`/buildings/${encodeURIComponent(id)}`),

  myProfile: () => request<MyProfile>(`/users/${getAnonId()}`),
  saveProfile: (profile: UserProfile) => request<MyProfile>(`/users/${getAnonId()}`, json('PUT', profile)),
  matches: () => request<Match[]>(`/users/${getAnonId()}/matches`),

  searchPeople: (q: string) => request<(PublicUser & { online: boolean })[]>(`/people/search?q=${encodeURIComponent(q)}`),
  person: (publicId: string) => request<PublicProfile>(`/people/${encodeURIComponent(publicId)}`),

  friends: () => request<FriendsList>('/friends'),
  addFriend: (publicId: string) => request<{ ok: true }>(`/friends/${encodeURIComponent(publicId)}`, json('POST')),
  removeFriend: (publicId: string) => request<{ ok: true }>(`/friends/${encodeURIComponent(publicId)}`, json('DELETE')),

  conversations: () => request<Conversation[]>('/dms'),
  thread: (publicId: string) => request<DirectMessage[]>(`/dms/${encodeURIComponent(publicId)}`),

  report: (r: { targetId: string; reason: ReportReason; details?: string; roomId?: string }) =>
    request<{ ok: true }>('/reports', json('POST', r)),

  admin: {
    claim: (token: string) => request<{ ok: true }>('/admin/claim', json('POST', { token })),
    reports: (status: 'open' | 'resolved') => request<ReportView[]>(`/admin/reports?status=${status}`),
    setReport: (id: string, action: 'resolve' | 'reopen') => request<{ ok: true }>(`/admin/reports/${id}/${action}`, json('POST')),
    users: (q: string) => request<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`),
    bans: () => request<BanView[]>('/admin/bans'),
    ban: (b: { publicId: string; kind: 'user' | 'ip'; hours: number | null; reason?: string }) =>
      request<{ ok: true }>('/admin/bans', json('POST', b)),
    unban: (id: string) => request<{ ok: true }>(`/admin/bans/${id}`, json('DELETE')),
  },
};
