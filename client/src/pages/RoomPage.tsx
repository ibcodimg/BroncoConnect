import { findRoom } from '@shared/buildings';
import type { ChatMessage, RoomPresence, Stroke } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Chat from '../components/Chat';
import { useOpenUser, UserName } from '../components/UserCard';
import Whiteboard from '../components/Whiteboard';
import { FEATURE_COMPONENTS } from '../features';
import { useMutes } from '../lib/mutes';
import { useSession } from '../lib/session';
import { socket } from '../lib/socket';

type BoardView = 'both' | 'personal' | 'shared';

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
  const [view, setView] = useState<BoardView>('both');
  const [personal, setPersonal] = usePersonalBoard(roomId);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const myPublicId = me?.publicId;
  const mutes = useMutes();
  const openUser = useOpenUser();
  const isDrawHidden = useCallback((s: Stroke) => mutes.isMuted(s.authorId, 'draw', roomId), [mutes, roomId]);

  useEffect(() => {
    if (!room || !myPublicId || !connected) return;
    const mine = (p: { roomId: string }) => p.roomId === roomId;

    const onPresence = (p: RoomPresence) => mine(p) && setPresence(p);
    const onHistory = (p: { roomId: string; messages: ChatMessage[] }) => mine(p) && setMessages(p.messages);
    const onMessage = (m: ChatMessage) => mine(m) && setMessages((prev) => [...prev.slice(-199), m]);
    const onBoardHistory = (p: { roomId: string; strokes: Stroke[] }) => mine(p) && setShared(p.strokes);
    const onStroke = (p: { roomId: string; stroke: Stroke }) => mine(p) && setShared((prev) => [...prev, p.stroke]);
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

  return (
    <div className="room-page">
      <header className="room-header">
        <div>
          <p className="building-number">{room.id === 'campus' ? 'Campus-wide' : `Building ${room.number}`}</p>
          <h1>{room.name}</h1>
        </div>
        <div className="presence">
          <button className="link" onClick={() => setShowPeople((v) => !v)} aria-expanded={showPeople}>
            🟢 {presence?.count ?? 1} here
          </button>
          {showPeople && (
            <ul className="presence-list">
              {(presence?.users ?? []).map((u) => (
                <li key={u.publicId}>
                  <UserName publicId={u.publicId} name={u.publicId === myId ? `${u.displayName} (you)` : u.displayName} roomId={roomId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>
      {notice && (
        <p className="notice" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}

      <div className="room-layout">
        <Chat roomId={roomId} messages={messages} myId={myId} onSend={(text) => socket.emit('chat:send', { roomId, text })} />

        <div className="boards">
          <div className="segmented" role="tablist">
            {(['both', 'personal', 'shared'] as BoardView[]).map((v) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                {v === 'both' ? 'Both boards' : v === 'personal' ? 'Personal' : 'Collaborative'}
              </button>
            ))}
          </div>
          {view !== 'shared' && (
            <Whiteboard
              title="Personal whiteboard (only you)"
              strokes={personal}
              myId={myId}
              onAdd={(s) => setPersonal((prev) => [...prev, ...s])}
              onErase={erasePersonal}
              onUndo={undoPersonal}
              onClearMine={() => setPersonal([])}
            />
          )}
          {view !== 'personal' && (
            <Whiteboard
              title="Collaborative whiteboard"
              strokes={shared}
              myId={myId}
              onAdd={addShared}
              onErase={eraseShared}
              onUndo={() => socket.emit('board:undo', { roomId })}
              onClearMine={() => socket.emit('board:clear-mine', { roomId })}
              collaborative
              isAdmin={me.isAdmin}
              isHidden={isDrawHidden}
              onAuthorClick={(publicId) => openUser({ publicId, roomId })}
              onToggleHideAuthor={(publicId, displayName) => mutes.toggle({ publicId, displayName, kind: 'draw', scope: roomId })}
            />
          )}
          {room.features?.map((f) => {
            const Feature = FEATURE_COMPONENTS[f];
            return Feature ? <Feature key={f} /> : null;
          })}
        </div>
      </div>
    </div>
  );
}
