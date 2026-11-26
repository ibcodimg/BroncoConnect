import { findRoom, roomKicker } from '@shared/buildings';
import type { ChatMessage, RoomPresence, Stroke } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Chat from '../components/Chat';
import Desk, { type DeskWindow, type WinRect } from '../components/Desk';
import PresenceBar from '../components/PresenceBar';
import { useOpenUser } from '../components/UserCard';
import Whiteboard from '../components/Whiteboard';
import { FEATURE_COMPONENTS, FEATURE_LABELS } from '../features';
import { useMutes } from '../lib/mutes';
import { recordVisit } from '../lib/recentRooms';
import { useSession } from '../lib/session';
import { socket } from '../lib/socket';

/**
 * Default window arrangement, sized to fit the screen: chat on the left, the two boards side by side
 * on the right (or stacked on narrower screens), building tools just below.
 */
function defaultLayout(width: number, height: number): Record<string, WinRect> {
  const gap = 12;
  const chatW = Math.max(280, Math.min(360, Math.round(width * 0.26)));
  const rest = Math.max(360, width - chatW - gap);
  const sideBySide = rest >= 900;
  const boardW = sideBySide ? Math.floor((rest - gap) / 2) : rest;
  const boardH = sideBySide ? height : Math.floor((height - gap) / 2);
  return {
    chat: { x: 0, y: 0, w: chatW, h: height, z: 1 },
    personal: { x: chatW + gap, y: 0, w: boardW, h: boardH, z: 2 },
    shared: sideBySide
      ? { x: chatW + gap + boardW + gap, y: 0, w: boardW, h: boardH, z: 3 }
      : { x: chatW + gap, y: boardH + gap, w: boardW, h: boardH, z: 3 },
    'feature-graphing-calculator': { x: chatW + gap, y: height + gap, w: Math.min(660, rest), h: 600, z: 4 },
  };
}

/** Personal boards never leave the browser. */
function usePersonalBoard(roomId: string) {
  const key = `broncoconnect:board:${roomId}`;
  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(strokes));
    } catch {
      /* storage full or blocked — board still works for this visit */
    }
  }, [key, strokes]);
  return [strokes, setStrokes] as const;
}

export default function RoomPage() {
  const { roomId = 'campus' } = useParams();
  // key: give each room its own fresh state (chat, boards) when navigating between rooms.
  return <Room key={roomId} roomId={roomId} />;
}

function Room({ roomId }: { roomId: string }) {
  const room = findRoom(roomId);
  const { me, connected } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [shared, setShared] = useState<Stroke[]>([]);
  const [presence, setPresence] = useState<RoomPresence | null>(null);
  const [personal, setPersonal] = usePersonalBoard(roomId);
  const [notice, setNotice] = useState<string | null>(null);
  const myPublicId = me?.publicId;
  const mutes = useMutes();
  const openUser = useOpenUser();
  const isDrawHidden = useCallback((s: Stroke) => mutes.isMuted(s.authorId, 'draw', roomId), [mutes, roomId]);

  useEffect(() => {
    if (room) recordVisit(room.id);
  }, [room]);

  useEffect(() => {
    if (!room || !myPublicId || !connected) return;
    const mine = (p: { roomId: string }) => p.roomId === roomId;

    const onPresence = (p: RoomPresence) => mine(p) && setPresence(p);
    const onHistory = (p: { roomId: string; messages: ChatMessage[] }) => mine(p) && setMessages(p.messages);
    const onMessage = (m: ChatMessage) => mine(m) && setMessages((prev) => [...prev.slice(-199), m]);
    const onBoardHistory = (p: { roomId: string; strokes: Stroke[] }) => mine(p) && setShared(p.strokes);
    const onStroke = (p: { roomId: string; stroke: Stroke }) => mine(p) && setShared((prev) => [...prev, p.stroke]);
    const onUpdated = (p: { roomId: string; strokes: Stroke[] }) => {
      if (!mine(p)) return;
      const byId = new Map(p.strokes.map((s) => [s.id, s]));
      setShared((prev) => prev.map((s) => byId.get(s.id) ?? s));
    };
    const onRemoved = (p: { roomId: string; strokeIds: string[] }) => {
      if (!mine(p)) return;
      const gone = new Set(p.strokeIds);
      setShared((prev) => prev.filter((s) => !gone.has(s.id)));
    };
    const onError = (msg: string) => setNotice(msg);

    socket.on('room:presence', onPresence);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('board:history', onBoardHistory);
    socket.on('board:stroke', onStroke);
    socket.on('board:removed', onRemoved);
    socket.on('board:updated', onUpdated);
    socket.on('error:message', onError);
    socket.emit('room:join', { roomId });

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('room:presence', onPresence);
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('board:history', onBoardHistory);
      socket.off('board:stroke', onStroke);
      socket.off('board:removed', onRemoved);
      socket.off('board:updated', onUpdated);
      socket.off('error:message', onError);
    };
  }, [room, roomId, myPublicId, connected]);

  if (!room) {
    return (
      <p className="page">
        Unknown room. <Link to="/">Back to campus</Link>
      </p>
    );
  }
  if (!me) return <p className="page">Connecting…</p>;

  const myId = me.publicId;

  const addShared = (strokes: Stroke[]) => {
    const withMe = strokes.map((s) => ({ ...s, authorId: myId, authorName: me.displayName }));
    setShared((prev) => [...prev, ...withMe]);
    for (const stroke of withMe) socket.emit('board:stroke', { roomId, stroke });
  };

  const undoPersonal = () => setPersonal((prev) => prev.slice(0, -1));
  const erasePersonal = (ids: string[]) => setPersonal((prev) => prev.filter((s) => !ids.includes(s.id)));
  const eraseShared = (ids: string[]) => socket.emit('board:erase', { roomId, strokeIds: ids });
  const replaceById = (prev: Stroke[], changed: Stroke[]) => {
    const byId = new Map(changed.map((s) => [s.id, s]));
    return prev.map((s) => byId.get(s.id) ?? s);
  };
  const updatePersonal = (changed: Stroke[]) => setPersonal((prev) => replaceById(prev, changed));
  const updateShared = (changed: Stroke[]) => {
    setShared((prev) => replaceById(prev, changed));
    socket.emit('board:update', { roomId, strokes: changed });
  };

  const windows: DeskWindow[] = [
    {
      id: 'chat',
      label: '💬 Chat',
      title: '💬 Chat',
      minW: 260,
      minH: 240,
      children: <Chat roomId={roomId} messages={messages} myId={myId} onSend={(text) => socket.emit('chat:send', { roomId, text })} />,
    },
    {
      id: 'personal',
      label: '✏️ Personal board',
      title: 'Personal whiteboard (only you)',
      minW: 360,
      minH: 280,
      children: (
        <Whiteboard
          title="Personal whiteboard (only you)"
          strokes={personal}
          myId={myId}
          onAdd={(s) => setPersonal((prev) => [...prev, ...s])}
          onErase={erasePersonal}
          onUpdate={updatePersonal}
          onUndo={undoPersonal}
          onClearMine={() => setPersonal([])}
        />
      ),
    },
    {
      id: 'shared',
      label: '👥 Collaborative board',
      title: 'Collaborative whiteboard',
      minW: 360,
      minH: 280,
      children: (
        <Whiteboard
          title="Collaborative whiteboard"
          strokes={shared}
          myId={myId}
          onAdd={addShared}
          onErase={eraseShared}
          onUpdate={updateShared}
          onUndo={() => socket.emit('board:undo', { roomId })}
          onClearMine={() => socket.emit('board:clear-mine', { roomId })}
          collaborative
          isAdmin={me.isAdmin}
          isHidden={isDrawHidden}
          onAuthorClick={(publicId) => openUser({ publicId, roomId })}
          onToggleHideAuthor={(publicId, displayName) => mutes.toggle({ publicId, displayName, kind: 'draw', scope: roomId })}
        />
      ),
    },
    ...(room.features ?? []).flatMap((f) => {
      const Feature = FEATURE_COMPONENTS[f];
      return Feature
        ? [{ id: `feature-${f}`, label: FEATURE_LABELS[f] ?? f, title: FEATURE_LABELS[f] ?? f, minW: 320, minH: 300, children: <Feature /> }]
        : [];
    }),
  ];

  return (
    <div className="room-page">
      <header className="room-header">
        {roomKicker(room) && <p className="building-number">{roomKicker(room)}</p>}
        <h1>{room.name}</h1>
        <PresenceBar presence={presence} myId={myId} roomId={roomId} />
      </header>
      {notice && (
        <p className="notice" onClick={() => setNotice(null)}>
          {notice} <small>(click to dismiss)</small>
        </p>
      )}
      <Desk windows={windows} storageKey="broncoconnect:layout:v2" defaults={defaultLayout} />
    </div>
  );
}
