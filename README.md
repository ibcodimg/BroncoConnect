# BroncoConnect

**Meet Cal Poly Pomona students who'll be in the same building, on the same day, at the same time as you.**

Meeting people as a commuter is hard: your schedule never lines up with your friends', and nobody wants to cross campus to hang out. BroncoConnect turns the CPP campus map into a set of building chatrooms. It also uses your (optional) weekly schedule to find people who are near you anyway.

CS 4800 project by Bill Ma. The original pitch is in [`docs/CS4800_Project_Idea_Pitch.pdf`](docs/CS4800_Project_Idea_Pitch.pdf).

## Features

| Status | Feature |
| --- | --- |
| ✅ scaffolded | **Campus map**: an interactive CPP map. Click a building to see its number and name, how many people are in its chatroom, and how many are there right now according to their schedules. |
| ✅ scaffolded | **Building chatrooms**: real-time chat for every building, plus one for the whole campus. |
| ✅ | **Whiteboards**: a personal board (stays in your browser) and a collaborative board per room. Pen, line, rectangle, ellipse, color, thickness, and a stroke eraser. The **Select** tool works by click or by dragging a box; **Ctrl+C / Ctrl+V** copy and paste between boards at your cursor; Delete, Ctrl+A, Ctrl+Z, and Esc also work. |
| ✅ | **Unerasable ink** on collaborative boards: only the author (or an admin) can erase it. Everyone else can only hide it by muting the author. |
| ✅ | **People**: click any username for a card with Add friend, Message, Report, and four mute options (drawings or messages, in this building or everywhere). Search people by username. |
| ✅ | **Direct messages** with live delivery and unread counts. |
| ✅ | **Room windows**: drag the chat, boards, and tools by their title bars, resize them from the corner, and stack them like desktop windows. Layout is saved per browser. |
| ✅ | **Live map colors**: buildings get darker green as more people are there (online in the chatroom plus on campus by schedule). |
| ✅ | **Admin**: review reports with the reported person's recent messages, look up users, and ban by user or IP for 1 hour to 30 days or permanently. |
| ✅ scaffolded | **Building-specific tools**: a graphing calculator in Building 8 (College of Science, home of Math & Stats). |
| ✅ scaffolded | **Anonymous, optional profile**: display name, major, commuter or resident, what you're looking for, and your weekly schedule. No account; the site remembers you through a random id in your browser. |
| ✅ scaffolded | **Find people**: matches by same building, same day, and overlapping time. |
| ✅ | **Tutor4Tutor**: trade help with someone who knows what you need (and needs what you know), or tutor one-sided as a volunteer. Courses can include the professor, and same-professor matches and people on campus at the same times rank first. |
| ✅ | **Profile tags**: majors from CPP's official list, plus subject and course tags with suggestions, custom tags, and a count of how many other people use each one. |
| 🔜 planned | **Study groups**: form peer groups from matching subjects. |
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

## Admin

1. Set `ADMIN_TOKEN` to a long random string in `server/.env`, and in Render's environment settings for production.
2. Open `/admin` in your browser and enter the token once. That browser's identity becomes an admin from then on.
3. An **Admin** tab appears. From it you can review reports, ban people (user or IP, timed or permanent), and lift bans. Admins can also erase anyone's ink, including unerasable ink.

**Fixing the map:** buildings are matched to chatrooms automatically, using OpenStreetMap data. As an admin, you can click any gray (unmatched) outline and choose its chatroom. Click a matched building and use "Change which outline this is" if the match is wrong. Links are saved in the database for everyone.

User bans follow the browser identity, so clearing site data gets around them. IP bans are stronger, but they block everyone on that network, and campus Wi-Fi can put many students behind one IP. Admins and IPs that admins use can't be banned, so you can't lock yourself out.

## Privacy

BroncoConnect is not meant to identify anyone. Every profile field is optional. Users get a private random id, kept in their browser, and a separate public id that others see. The private id is never sent to other users, so no one can edit someone else's profile. Personal whiteboards never leave the browser.

## Deployment (Render)

The app runs as **one web service**: Express serves the API, the Socket.IO websockets, and the built React app from one URL. Vercel won't work here because it can't keep the long-lived websocket connections that chat and the shared whiteboard need.

1. On [render.com](https://render.com), sign in with GitHub, then choose **New → Blueprint** and pick this repo. Render reads [`render.yaml`](render.yaml).
2. When it asks, paste your Atlas connection string as `MONGODB_URI`.
3. In MongoDB Atlas, open **Network Access** and add `0.0.0.0/0` (allow from anywhere), because Render's servers don't have a fixed IP.
4. Every push to `main` redeploys automatically.

The free plan sleeps after about 15 minutes with no visitors, so the first visit after that takes about 30 seconds to wake it up.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request. It installs dependencies, runs the unit tests (`shared/*.test.ts`), type-checks the server and client, and builds the client. Results are in the repo's **Actions** tab.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the server (port 4000) and client (port 5173) with reload |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the server, which also serves `client/dist` |
| `npm test` | Runs the unit tests (schedule matching) |
| `npm run typecheck` | Type-checks the server and client |
| `npm run fetch:buildings` | Downloads campus building outlines from OpenStreetMap |

Map data © OpenStreetMap contributors.
