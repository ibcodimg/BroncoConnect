# BroncoConnect

**Meet Cal Poly Pomona students who'll be in the same building, on the same day, at the same time as you.**

Meeting people as a commuter is hard: your schedule never lines up with your friends', and nobody wants to cross campus to hang out. BroncoConnect turns the CPP campus map into a set of building chatrooms. It also uses your (optional) weekly schedule to find people who are near you anyway.

CS 4800 project by Bill Ma. The original pitch is in [`docs/CS4800_Project_Idea_Pitch.pdf`](docs/CS4800_Project_Idea_Pitch.pdf).

## Features

| Status | Feature |
| --- | --- |
| ✅ scaffolded | **Campus map**: an interactive CPP map. Click a building to see its number and name, how many people are in its chatroom, and how many are there right now according to their schedules. |
| ✅ scaffolded | **Building chatrooms**: real-time chat for every building, plus one for the whole campus. |
| ✅ scaffolded | **Whiteboards**: a personal board (stays in your browser) and a collaborative board per room. Pen, line, rectangle, ellipse, eraser, color, and thickness. You can copy and paste between boards, undo, clear your own strokes, and mute other people's drawings. |
| ✅ scaffolded | **Building-specific tools**: a graphing calculator in Building 8 (College of Science, home of Math & Stats). |
| ✅ scaffolded | **Anonymous, optional profile**: display name, major, commuter or resident, what you're looking for, and your weekly schedule. No account; the site remembers you through a random id in your browser. |
| ✅ scaffolded | **Find people**: matches by same building, same day, and overlapping time. |
| 🔜 planned | **Tutor4Tutor**: find someone who has taken your course or professor and trade help. |
| 🔜 planned | **Proficiency matching**: pair what you're good at with what others need help with, and form peer groups. |
| 🔜 planned | Reporting and moderation, direct messages, a lasso tool for copying part of a board, and more building tools. |

## Tech stack

- **Client:** React 19, Vite, TypeScript, Leaflet / react-leaflet (OpenStreetMap), Socket.IO client, math.js
- **Server:** Node 20+, Express, Socket.IO, Mongoose
- **Database:** MongoDB Atlas (database `broncoconnect`)
- **Monorepo:** npm workspaces (`client/`, `server/`, plus `shared/` types used by both)

## Getting started

```bash
# 1. Install
npm install

# 2. Configure the server
cp .env.example server/.env
#    then edit server/.env and paste your Atlas connection string into MONGODB_URI

# 3. Get building outlines for the map (one time; downloads from OpenStreetMap)
npm run fetch:buildings

# 4. Run client + server together
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000, and Vite forwards `/api` and `/socket.io` to it.

To test chat and matching with two people, open a second browser or a private window. Each one gets its own anonymous identity.

### MongoDB Atlas checklist

- **Network Access:** add your current IP, or `0.0.0.0/0` while developing.
- **Database Access:** use a database user with a password that has never been shared.
- The app writes to the `broncoconnect` database, so the `sample_mflix` sample data is left alone.

## Project structure

```
broncoconnect/
├── client/                  React app (Vite)
│   ├── public/              static files (buildings.geojson goes here)
│   └── src/
│       ├── components/      CampusMap, BuildingPanel, Chat, Whiteboard, BoardClipboard
│       ├── features/        building-specific tools (GraphingCalculator) + registry
│       ├── lib/             api, socket, session, anonymous identity
│       └── pages/           Campus, Room, Profile, Matches
├── server/
│   └── src/
│       ├── models/          User, Message, Stroke (Mongoose)
│       ├── routes/          /api/buildings, /api/users
│       ├── sockets/         chat, presence, collaborative whiteboard
│       └── lib/presence.ts  who's in which room right now
├── shared/                  types, building list, schedule-overlap logic
├── scripts/                 fetch-campus-buildings.mjs (OpenStreetMap → GeoJSON)
└── docs/                    architecture notes + project pitch
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model, API, and socket events.

## Privacy

BroncoConnect is not meant to identify anyone. Every profile field is optional. Users get a private random id, kept in their browser, and a separate public id that others see. The private id is never sent to other users, so no one can edit someone else's profile. Personal whiteboards never leave the browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the server (port 4000) and client (port 5173) with reload |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the server, which also serves `client/dist` |
| `npm run typecheck` | Type-checks the server and client |
| `npm run fetch:buildings` | Downloads campus building outlines from OpenStreetMap |

Map data © OpenStreetMap contributors.
