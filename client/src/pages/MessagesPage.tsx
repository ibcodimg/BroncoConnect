import type { Conversation, DirectMessage, PublicProfile } from '@shared/types';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserName } from '../components/UserCard';
import { api } from '../lib/api';
import { useMutes } from '../lib/mutes';
import { useSession } from '../lib/session';
import { socket } from '../lib/socket';

export default function MessagesPage() {
  const { publicId } = useParams();
  const { setUnreadDms } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const loadConversations = useCallback(() => {
    api
      .conversations()
      .then((c) => {
        setConversations(c);
        setUnreadDms(c.reduce((n, x) => n + (x.other.publicId === publicId ? 0 : x.unread), 0));
      })
      .catch(() => {});
  }, [publicId, setUnreadDms]);

  useEffect(() => {
    loadConversations();
    socket.on('dm:message', loadConversations);
    return () => {
      socket.off('dm:message', loadConversations);
    };
  }, [loadConversations]);

  return (
    <div className="messages-page">
      <aside className="conversations">
        <h2>Messages</h2>
        {conversations.length === 0 && <p className="hint">No conversations yet. Click someone's name and choose Message.</p>}
        <ul>
          {conversations.map((c) => (
            <li key={c.other.publicId} className={c.other.publicId === publicId ? 'active' : ''}>
              <Link to={`/messages/${c.other.publicId}`}>
                <strong>
                  {c.other.online && <span className="online-dot" />} {c.other.displayName}
                </strong>
                {c.unread > 0 && c.other.publicId !== publicId && <span className="badge">{c.unread}</span>}
                <span className="preview">{c.last.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      {publicId ? <Thread key={publicId} otherId={publicId} onSent={loadConversations} /> : <p className="page hint">Pick a conversation.</p>}
    </div>
  );
}

function Thread({ otherId, onSent }: { otherId: string; onSent: () => void }) {
  const { me } = useSession();
  const { isMuted } = useMutes();
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    api.person(otherId).then(setOther).catch(() => setError('User not found.'));
    api.thread(otherId).then(setMessages).catch(() => {});
    const onDm = (dm: DirectMessage) => {
      if (dm.from === otherId || dm.to === otherId) setMessages((prev) => (prev.some((m) => m.id === dm.id) ? prev : [...prev, dm]));
    };
    socket.on('dm:message', onDm);
    return () => {
      socket.off('dm:message', onDm);
    };
  }, [otherId]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setError(null);
    socket.emit('dm:send', { to: otherId, text: t }, (res) => {
      if ('error' in res) return setError(res.error);
      setMessages((prev) => (prev.some((m) => m.id === res.id) ? prev : [...prev, res]));
      setText('');
      onSent();
    });
  };

  const hidden = isMuted(otherId, 'text', 'all');

  return (
    <section className="thread">
      <header>
        {other ? <UserName publicId={other.publicId} name={other.displayName} /> : <span>…</span>}
        {other?.online && <span className="online-dot" title="Online" />}
      </header>
      <ol ref={list} className="messages">
        {hidden && <li className="hint">You've muted this person's messages everywhere. Unmute them from their card to read.</li>}
        {!hidden &&
          messages.map((m) => (
            <li key={m.id} className={m.from === me?.publicId ? 'mine' : ''}>
              <time dateTime={m.createdAt}>
                {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </time>
              <p>{m.text}</p>
            </li>
          ))}
      </ol>
      {error && <p className="error">{error}</p>}
      <form onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Write a message…" aria-label="Message" />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
