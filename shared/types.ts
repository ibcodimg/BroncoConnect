// Types shared by the client and the server.

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

export const LOOKING_FOR = ['friends', 'tutoring', 'study-group', 'tutor4tutor'] as const;
export type LookingFor = (typeof LOOKING_FOR)[number];

export type CampusStatus = 'commuter' | 'resident';

/** One recurring block of time on campus, e.g. Mon 10:00–11:15 in Building 8. */
export interface ScheduleBlock {
  day: Day;
  /** 24h "HH:MM" */
  start: string;
  /** 24h "HH:MM" */
  end: string;
  buildingId: string;
  /** Optional label, e.g. "CS 3310" */
  label?: string;
}

/** Everything is optional — BroncoConnect never requires identifying info. */
export interface UserProfile {
  displayName?: string;
  major?: string;
  status?: CampusStatus;
  schedule: ScheduleBlock[];
  lookingFor: LookingFor[];
  strongSubjects: string[];
  needHelpSubjects: string[];
}

/** What other users can see about you. Never includes your private anonId. */
export interface PublicUser {
  publicId: string;
  displayName: string;
  major?: string;
  status?: CampusStatus;
  lookingFor: LookingFor[];
}

/** You, as the server describes you after `session:hello`. */
export interface Me extends PublicUser {
  /** False until you've picked a username (displayName falls back to "Bronco #abcd"). */
  hasDisplayName: boolean;
  isAdmin: boolean;
}

/** What you see when you click someone's name. */
export interface PublicProfile extends PublicUser {
  online: boolean;
  strongSubjects: string[];
  needHelpSubjects: string[];
  /** Your relationship to them. */
  friendStatus: FriendStatus;
  isMe: boolean;
}

export type FriendStatus = 'none' | 'friends' | 'outgoing' | 'incoming';

export interface FriendsList {
  friends: (PublicUser & { online: boolean })[];
  incoming: PublicUser[];
  outgoing: PublicUser[];
}

export interface DirectMessage {
  id: string;
  from: string; // publicId
  to: string; // publicId
  text: string;
  createdAt: string;
  read: boolean;
}

export interface Conversation {
  other: PublicUser & { online: boolean };
  last: DirectMessage;
  unread: number;
}

export const REPORT_REASONS = ['harassment', 'spam', 'inappropriate-drawing', 'inappropriate-message', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface ReportView {
  id: string;
  reason: ReportReason;
  details?: string;
  roomId?: string;
  status: 'open' | 'resolved';
  createdAt: string;
  reporter: PublicUser;
  target: PublicUser & { lastIp?: string; banned: boolean };
  /** Target's recent messages in that room when the report was made. */
  context: { text: string; createdAt: string }[];
}

export interface BanView {
  id: string;
  kind: 'user' | 'ip';
  /** publicId for user bans, IP for IP bans */
  value: string;
  displayName?: string;
  reason?: string;
  /** null = permanent */
  until: string | null;
  createdAt: string;
}

export interface BanNotice {
  reason?: string;
  until: string | null;
}

/** Client-side mute: hide someone's drawings or messages in one building or everywhere. */
export interface MuteRule {
  publicId: string;
  displayName: string;
  kind: 'draw' | 'text';
  /** roomId, or 'all' for every building */
  scope: string;
}

export interface Match extends PublicUser {
  overlaps: ScheduleBlock[];
}

export type BuildingFeature = 'graphing-calculator';

export interface Building {
  /** Room id used everywhere, e.g. "building-8" or "campus" */
  id: string;
  /** Number shown on campus signs, e.g. "8" */
  number: string;
  name: string;
  features?: BuildingFeature[];
}

export interface BuildingSummary extends Building {
  /** People currently connected to this building's chatroom */
  onlineCount: number;
  /** People whose saved schedule says they're in this building right now */
  onCampusNow: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  author: { publicId: string; displayName: string };
  text: string;
  createdAt: string;
}

export interface Point {
  x: number;
  y: number;
}

/** Tools that create strokes. (Select and eraser are board modes, not stroke types.) */
export type Tool = 'pen' | 'line' | 'rect' | 'ellipse';

export interface Stroke {
  id: string;
  authorId: string;
  authorName?: string;
  tool: Tool;
  color: string;
  width: number;
  /** Pen: every point. Shapes: [start, end]. Logical board coords (BOARD_WIDTH × BOARD_HEIGHT). */
  points: Point[];
  /** "Unerasable" ink on the collaborative board: only the author (or an admin) can erase it. */
  locked?: boolean;
}

export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 1000;

export interface RoomPresence {
  roomId: string;
  count: number;
  users: Pick<PublicUser, 'publicId' | 'displayName'>[];
}

// ---- Socket.io event contracts ----

export interface ClientToServerEvents {
  'session:hello': (payload: { anonId: string }, ack: (me: Me) => void) => void;
  'room:join': (payload: { roomId: string }) => void;
  'room:leave': (payload: { roomId: string }) => void;
  'chat:send': (payload: { roomId: string; text: string }) => void;
  'board:stroke': (payload: { roomId: string; stroke: Stroke }) => void;
  'board:undo': (payload: { roomId: string }) => void;
  'board:clear-mine': (payload: { roomId: string }) => void;
  /** Erase or delete strokes. Server only removes ones you're allowed to (yours, unlocked, or any if admin). */
  'board:erase': (payload: { roomId: string; strokeIds: string[] }) => void;
  /** Move/resize/rotate: new points (and tool) for existing strokes. Same permissions as erasing. */
  'board:update': (payload: { roomId: string; strokes: Stroke[] }) => void;
  'dm:send': (payload: { to: string; text: string }, ack: (msg: DirectMessage | { error: string }) => void) => void;
}

export interface ServerToClientEvents {
  'room:presence': (presence: RoomPresence) => void;
  'chat:history': (payload: { roomId: string; messages: ChatMessage[] }) => void;
  'chat:message': (message: ChatMessage) => void;
  'board:history': (payload: { roomId: string; strokes: Stroke[] }) => void;
  'board:stroke': (payload: { roomId: string; stroke: Stroke }) => void;
  'board:removed': (payload: { roomId: string; strokeIds: string[] }) => void;
  'board:updated': (payload: { roomId: string; strokes: Stroke[] }) => void;
  'error:message': (message: string) => void;
  'dm:message': (message: DirectMessage) => void;
  'friend:update': () => void;
  banned: (notice: BanNotice) => void;
}
