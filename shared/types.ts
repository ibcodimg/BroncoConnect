// Types shared by the client and the server.

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

/**
 * tutoring = looking for a tutor · tutor-others = willing to tutor one-sided (nothing in return)
 * tutor4tutor = open to trading help
 */
export const LOOKING_FOR = ['friends', 'tutoring', 'tutor-others', 'tutor4tutor', 'study-group'] as const;
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

/** A course you've taken or want help in. Professor is optional ("same professor" matches rank higher). */
export interface CourseEntry {
  course: string;
  professor?: string;
}

/** Everything is optional — BroncoConnect never requires identifying info. */
export interface UserProfile {
  displayName?: string;
  majors: string[];
  status?: CampusStatus;
  schedule: ScheduleBlock[];
  lookingFor: LookingFor[];
  strongSubjects: string[];
  needHelpSubjects: string[];
  coursesTaken: CourseEntry[];
  coursesNeedHelp: CourseEntry[];
  /** Personal interests (friend-making only; not used by Tutor4Tutor). */
  interests: string[];
}

/** What other users can see about you. Never includes your private anonId. */
export interface PublicUser {
  publicId: string;
  displayName: string;
  majors: string[];
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
  coursesTaken: CourseEntry[];
  coursesNeedHelp: CourseEntry[];
  interests: string[];
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

export const REPORT_REASONS = ['harassment', 'spam', 'inappropriate-drawing', 'inappropriate-message', 'bug', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** A message line saved with a report (the reported one is flagged). */
export interface ReportContextLine {
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  reported?: boolean;
}

export interface ReportView {
  id: string;
  reason: ReportReason;
  /** When a specific message was reported: where it was. */
  messageKind?: 'chat' | 'dm';
  /** The reported message with up to 5 messages before and after it (snapshot at report time). */
  surrounding: ReportContextLine[];
  /** The reported person's recent drawings at report time, grouped by room. */
  drawings: { roomId: string; strokes: Stroke[] }[];
  details?: string;
  roomId?: string;
  status: 'open' | 'resolved';
  createdAt: string;
  reporter: PublicUser;
  /** Missing for general reports (bugs / problems not about a person). */
  target?: PublicUser & { lastIp?: string; banned: boolean };
  /** Target's recent messages in that room when the report was made. */
  context: { text: string; createdAt: string }[];
}

export const AUDIT_TYPES = [
  'chat-message',
  'chat-deleted',
  'chat-purged',
  'report',
  'report-resolved',
  'suggestion',
  'friend-request',
  'friend-accept',
  'friend-remove',
  'name-change',
  'ban',
  'unban',
] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

/** Admin audit log entry. Private messages are never logged. */
export interface AuditView {
  id: string;
  type: AuditType;
  createdAt: string;
  actor?: { publicId: string; displayName: string };
  target?: { publicId: string; displayName: string };
  roomId?: string;
  /** Short description or the chat text (trimmed). */
  detail?: string;
}

export interface AdminStats {
  users: number;
  usersWithName: number;
  activeToday: number;
  activeThisWeek: number;
  onlineNow: number;
  chatMessages: number;
  /** Count only — admins can't read private messages. */
  directMessages: number;
  friendships: number;
  openReports: number;
  openSuggestions: number;
  activeBans: number;
  topRooms: { roomId: string; count: number }[];
}

export interface SuggestionView {
  id: string;
  text: string;
  status: 'open' | 'done';
  createdAt: string;
  author: PublicUser;
}

export interface RoomMessageCount {
  roomId: string;
  count: number;
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

/** How many OTHER people use each tag: [label, count], most popular first. */
export interface TagStats {
  majors: [string, number][];
  subjects: [string, number][];
  courses: [string, number][];
  interests: [string, number][];
}

export interface TutoringMatch extends PublicUser {
  online: boolean;
  /** Subjects/courses they can help you with. */
  theyCanTeach: string[];
  /** Subjects/courses you can help them with. */
  youCanTeach: string[];
  /** Courses where you both list the same professor. */
  sameProfessor: string[];
  /** Times you're both in the same building. */
  overlaps: ScheduleBlock[];
}

export interface TutoringResults {
  /** Tutor4Tutor: you each help the other. */
  trades: TutoringMatch[];
  /** One-sided: they volunteer to tutor what you need. */
  canHelpYou: TutoringMatch[];
  /** One-sided: you volunteer, they need what you know. */
  youCanHelp: TutoringMatch[];
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
  /** Admin only: delete one message. */
  'chat:delete': (payload: { roomId: string; messageId: string }) => void;
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
  'chat:removed': (payload: { roomId: string; messageId: string }) => void;
  /** An admin purged a room's messages ('all' = every room). */
  'chat:cleared': (payload: { roomId: string }) => void;
  'board:history': (payload: { roomId: string; strokes: Stroke[] }) => void;
  'board:stroke': (payload: { roomId: string; stroke: Stroke }) => void;
  'board:removed': (payload: { roomId: string; strokeIds: string[] }) => void;
  'board:updated': (payload: { roomId: string; strokes: Stroke[] }) => void;
  'error:message': (message: string) => void;
  'dm:message': (message: DirectMessage) => void;
  'friend:update': () => void;
  banned: (notice: BanNotice) => void;
}
