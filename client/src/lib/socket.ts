import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same origin: Vite proxies /socket.io to the server in dev; Express serves both in prod.
export const socket: AppSocket = io({ autoConnect: false });
