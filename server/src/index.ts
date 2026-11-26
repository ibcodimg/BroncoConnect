import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types';
import { config } from './config';
import { setIO } from './lib/realtime';
import { adminRouter } from './routes/admin';
import { buildingsRouter } from './routes/buildings';
import { dmsRouter } from './routes/dms';
import { friendsRouter } from './routes/friends';
import { mapLinksRouter } from './routes/mapLinks';
import { peopleRouter } from './routes/people';
import { reportsRouter } from './routes/reports';
import { usersRouter } from './routes/users';
import { registerSockets, type SocketData } from './sockets';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});
app.use('/api/buildings', buildingsRouter);
app.use('/api/users', usersRouter);
app.use('/api/people', peopleRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/dms', dmsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/map-links', mapLinksRouter);

// In production, serve the built client from the same server.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
app.use(
  express.static(clientDist, {
    // Hashed JS/CSS can be cached forever; index.html and data files must always be re-checked
    // so a new deploy shows up on the next refresh.
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }),
);
// Client-side routes (e.g. /room/building-8) get the app. Paths that look like files (have a dot) and
// weren't found above get a real 404 instead of index.html.
app.get(/^\/(?!api\/|socket\.io)[^.]*$/, (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: config.clientOrigin },
});
setIO(io);
registerSockets(io);

async function main() {
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDb });
  console.log(`MongoDB connected (db: ${config.mongoDb})`);
  httpServer.listen(config.port, () => {
    console.log(`BroncoConnect server on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
