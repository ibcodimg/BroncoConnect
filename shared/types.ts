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

export type Tool = 'pen' | 'line' | 'rect' | 'ellipse' | 'eraser';

export interface Stroke {
  id: string;
  authorId: string;
  authorName?: string;
  tool: Tool;
  color: string;
  width: number;
  /** Pen: every point. Shapes: [start, end]. Logical board coords (BOARD_WIDTH × BOARD_HEIGHT). */
  points: Point[];
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
  'session:hello': (payload: { anonId: string }, ack: (me: PublicUser) => void) => void;
  'room:join': (payload: { roomId: string }) => void;
  'room:leave': (payload: { roomId: string }) => void;
  'chat:send': (payload: { roomId: string; text: string }) => void;
  'board:stroke': (payload: { roomId: string; stroke: Stroke }) => void;
  'board:undo': (payload: { roomId: string }) => void;
  'board:clear-mine': (payload: { roomId: string }) => void;
}

export interface ServerToClientEvents {
  'room:presence': (presence: RoomPresence) => void;
  'chat:history': (payload: { roomId: string; messages: ChatMessage[] }) => void;
  'chat:message': (message: ChatMessage) => void;
  'board:history': (payload: { roomId: string; strokes: Stroke[] }) => void;
  'board:stroke': (payload: { roomId: string; stroke: Stroke }) => void;
  'board:removed': (payload: { roomId: string; strokeIds: string[] }) => void;
  'error:message': (message: string) => void;
}
