# Architecture

```
Browser (React)  ──HTTP /api──►  Express  ──►  MongoDB Atlas (db: broncoconnect)
      ▲  │                          │
      │  └──── Socket.IO ──────────►│  chat, presence, collaborative whiteboard
      └──────── events ◄────────────┘
```

## Identity

- **anonId**: a random UUID made by the browser and stored in `localStorage`. It works like a password for the profile. It goes only to our own server, in REST paths and in the socket `session:hello` event.
- **publicId**: a random hex id made by the server. It's the only id other users ever see: chat authors, stroke authors, matches, and mute lists.
- The server sets `authorId` on every message and stroke itself, so a client can't post as someone else.

## Collections

| Collection | Key fields | Notes |
| --- | --- | --- |
| `users` | `anonId` (unique), `publicId` (unique), `displayName?`, `major?`, `status?`, `schedule[]`, `lookingFor[]`, `strongSubjects[]`, `needHelpSubjects[]` | `schedule[]` = `{ day, start, end, buildingId, label? }` |
| `messages` | `roomId`, `authorId`, `authorName`, `text`, `createdAt` | The last 50 are sent when you join a room |
| `strokes` | `roomId`, `strokeId`, `authorId`, `tool`, `color`, `width`, `points[]` | Collaborative board only; the last 2,000 are sent when you join |

Room ids are `campus` or `building-<number>`, for example `building-8`. The building list is in `shared/buildings.ts`.

## REST API

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, db }` |
| GET | `/api/buildings` | Every room with `onlineCount` (in the chatroom) and `onCampusNow` (in that building right now according to schedules) |
| GET | `/api/buildings/:id` | One room |
| GET | `/api/users/:anonId` | Your profile; creates an empty one if none exists |
| PUT | `/api/users/:anonId` | Saves your profile (the server cleans and limits every field) |
| GET | `/api/users/:anonId/matches` | People who share a building, day, and time block with you |

## Socket.IO events

Typed in `shared/types.ts` (`ClientToServerEvents` / `ServerToClientEvents`).

| Direction | Event | Payload |
| --- | --- | --- |
| C→S | `session:hello` | `{ anonId }`; the ack returns your `PublicUser` |
| C→S | `room:join` / `room:leave` | `{ roomId }` |
| C→S | `chat:send` | `{ roomId, text }` (≤ 1000 chars, rate-limited) |
| C→S | `board:stroke` | `{ roomId, stroke }` (rate-limited to 30 per 5 s) |
| C→S | `board:undo` / `board:clear-mine` | `{ roomId }` |
| S→C | `room:presence` | `{ roomId, count, users[] }` |
| S→C | `chat:history` / `chat:message` | last 50 messages / one new message |
| S→C | `board:history` / `board:stroke` / `board:removed` | strokes, one new stroke, or removed stroke ids |
| S→C | `error:message` | a short string shown to the user |

## Matching

`shared/schedule.ts` treats two schedule blocks as overlapping when they have the same `day` and the same `buildingId`, and `max(start) < min(end)`. "Right now" uses campus time (America/Los_Angeles) no matter where the server runs. Planned improvements:

- **Tutor4Tutor**: add `coursesTaken[]` (course + professor) and match the courses you're taking against what others have taken.
- **Proficiency matching**: score pairs by how well `strongSubjects` and `needHelpSubjects` complement each other, weight that by schedule overlap, and group people.

## Whiteboards

- Board coordinates are logical (`BOARD_WIDTH × BOARD_HEIGHT` = 1600 × 1000), so a drawing lines up on any screen size.
- A pen or eraser stroke stores every point; a line, rectangle, or ellipse stores `[start, end]`.
- The personal board lives in `localStorage` (`broncoconnect:board:<roomId>`).
- Copy and paste uses a clipboard shared by both boards (`BoardClipboard.tsx`). Pasted strokes get new ids, belong to you, and are offset by 24 px.
- Muting only hides strokes on your own screen; nothing is deleted.

## Adding a building-specific tool

1. Add an id to `BuildingFeature` in `shared/types.ts`.
2. Attach it to a building in `FEATURES` in `shared/buildings.ts`.
3. Register the component in `client/src/features/index.tsx`.
