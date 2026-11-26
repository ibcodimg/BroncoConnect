import type { Conversation, DirectMessage, PublicProfile } from '@shared/types';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EditBox, EditedTag, Versions, shortDateTime, useOpenHistory } from '../components/MessageEditing';
import ReportMessageDialog, { type ReportableMessage } from '../components/ReportMessageDialog';
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
    // Edits and deletes can change a conversation's preview line.
    socket.on('dm:message', loadConversations);
    socket.on('dm:edited', loadConversations);
    socket.on('dm:removed', loadConversations);
    return () => {
      socket.off('dm:message', loadConversations);
      socket.off('dm:edited', loadConversations);
      socket.off('dm:removed', loadConversations);
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
  const [selected, setSelected] = useState<string | null>(null);
  const [reporting, setReporting] = useState<ReportableMessage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const history = useOpenHistory();
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    api.person(otherId).then(setOther).catch(() => setError('User not found.'));
    api.thread(otherId).then(setMessages).catch(() => {});
    const onDm = (dm: DirectMessage) => {
      if (dm.from === otherId || dm.to === otherId) setMessages((prev) => (prev.some((m) => m.id === dm.id) ? prev : [...prev, dm]));
    };
    const inThread = (p: { from: string; to: string }) => p.from === otherId || p.to === otherId;
    const onEdited = (dm: DirectMessage) => inThread(dm) && setMessages((prev) => prev.map((m) => (m.id === dm.id ? dm : m)));
    const onRemoved = (p: { id: string; from: string; to: string }) => inThread(p) && setMessages((prev) => prev.filter((m) => m.id !== p.id));
    socket.on('dm:message', onDm);
    socket.on('dm:edited', onEdited);
    socket.on('dm:removed', onRemoved);
    return () => {
      socket.off('dm:message', onDm);
      socket.off('dm:edited', onEdited);
      socket.off('dm:removed', onRemoved);
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
          messages.map((m) => {
            const mine = m.from === me?.publicId;
            const isEditing = editing === m.id;
            return (
              <li
                key={m.id}
                className={`${mine ? 'mine' : ''} ${selected === m.id ? 'selected' : ''}`}
                onClick={(e) => {
                  if (isEditing || (e.target as HTMLElement).closest('button, textarea, .versions')) return;
                  setSelected((s) => (s === m.id ? null : m.id));
                }}
                title={isEditing ? undefined : 'Click for options'}
              >
                <time dateTime={m.createdAt}>{shortDateTime(m.createdAt)}</time>
                <EditedTag editedAt={m.editedAt} />
                {isEditing ? (
                  <EditBox
                    initial={m.text}
                    onSave={(t) => {
                      socket.emit('dm:edit', { id: m.id, text: t });
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <p>{m.text}</p>
                )}
                {history.isOpen(m.id) && <Versions edits={m.edits} />}
                {selected === m.id && !isEditing && (
                  <div className="msg-actions">
                    {mine && (
                      <>
                        <button
                          className="link"
                          onClick={() => {
                            setEditing(m.id);
                            setSelected(null);
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="link danger-link"
                          onClick={() => {
                            if (window.confirm('Delete this message for both of you?')) socket.emit('dm:delete', { id: m.id });
                            setSelected(null);
                          }}
                        >
                          🗑 Delete
                        </button>
                      </>
                    )}
                    {m.edits && m.edits.length > 0 && (
                      <button className="link" onClick={() => history.toggle(m.id)}>
                        🕘 {history.isOpen(m.id) ? 'Hide' : 'View'} unedited version{m.edits.length > 1 ? 's' : ''}
                      </button>
                    )}
                    {!mine && (
                      <button
                        className="link"
                        onClick={() => {
                          setReporting({ kind: 'dm', id: m.id, authorName: other?.displayName ?? 'Them', text: m.text });
                          setSelected(null);
                        }}
                      >
                        ⚑ Report message
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
      </ol>
      {error && <p className="error">{error}</p>}
      {reporting && <ReportMessageDialog message={reporting} onClose={() => setReporting(null)} />}
      <form onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Write a message…" aria-label="Message" />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
