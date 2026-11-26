import type { ChatMessage } from '@shared/types';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutes } from '../lib/mutes';
import ReportMessageDialog, { type ReportableMessage } from './ReportMessageDialog';
import { UserName } from './UserCard';

interface Props {
  roomId: string;
  messages: ChatMessage[];
  myId: string;
  isAdmin?: boolean;
  onSend: (text: string) => void;
  /** Delete a message (your own, or any if admin). */
  onDelete: (messageId: string) => void;
  /** Edit your own message. */
  onEdit: (messageId: string, text: string) => void;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateTime = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Chat({ roomId, messages, myId, isAdmin, onSend, onDelete, onEdit }: Props) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [history, setHistory] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<ReportableMessage | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const { isMuted } = useMutes();

  const shown = messages.filter((m) => !isMuted(m.author.publicId, 'text', roomId));
  const hiddenCount = messages.length - shown.length;

  // Keep the newest message in view. (Block body on purpose: an effect must not return a value —
  // newer browsers make scroll methods return a Promise, which React would treat as a cleanup and crash.)
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  // If the message being edited disappears (deleted elsewhere), stop editing.
  useEffect(() => {
    if (editing && !messages.some((m) => m.id === editing.id)) setEditing(null);
  }, [messages, editing]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  const saveEdit = () => {
    if (!editing) return;
    const t = editing.text.trim();
    const original = messages.find((m) => m.id === editing.id)?.text;
    if (t && t !== original) onEdit(editing.id, t);
    setEditing(null);
  };

  const onEditKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  };

  const toggleHistory = (id: string) =>
    setHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="chat">
      <ol ref={list} className="messages" aria-live="polite">
        {shown.length === 0 && <li className="empty">No messages yet. Say hi 👋</li>}
        {shown.map((m) => {
          const mine = m.author.publicId === myId;
          const isEditing = editing?.id === m.id;
          return (
            <li
              key={m.id}
              className={`${mine ? 'mine' : ''} ${selected === m.id ? 'selected' : ''}`}
              onClick={(e) => {
                const t = e.target as HTMLElement;
                if (isEditing || t.closest('button, textarea, .versions')) return; // controls handle themselves
                setSelected((s) => (s === m.id ? null : m.id));
              }}
              title={isEditing ? undefined : 'Click for options'}
            >
              <UserName className="author" publicId={m.author.publicId} name={m.author.displayName} roomId={roomId} />
              <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
              {m.editedAt && (
                <span className="edited" title={`Edited ${dateTime(m.editedAt)}`}>
                  (edited)
                </span>
              )}

              {isEditing ? (
                <div className="edit-box">
                  <textarea
                    value={editing.text}
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                    onKeyDown={onEditKey}
                    maxLength={1000}
                    rows={2}
                    autoFocus
                    aria-label="Edit message"
                  />
                  <div className="row">
                    <button className="primary" onClick={saveEdit} disabled={!editing.text.trim()}>
                      Save
                    </button>
                    <button onClick={() => setEditing(null)}>Cancel</button>
                    <small className="hint">Enter to save · Esc to cancel</small>
                  </div>
                </div>
              ) : (
                <p>{m.text}</p>
              )}

              {history.has(m.id) && m.edits && m.edits.length > 0 && (
                <ol className="versions" aria-label="Earlier versions">
                  {m.edits.map((v, i) => (
                    <li key={i}>
                      <small>
                        {i === 0 ? 'Original' : `Version ${i + 1}`} · {dateTime(v.editedAt)}
                      </small>
                      <p>{v.text}</p>
                    </li>
                  ))}
                </ol>
              )}

              {selected === m.id && !isEditing && (
                <div className="msg-actions">
                  {mine && (
                    <button
                      className="link"
                      onClick={() => {
                        setEditing({ id: m.id, text: m.text });
                        setSelected(null);
                      }}
                    >
                      ✏️ Edit
                    </button>
                  )}
                  {(mine || isAdmin) && (
                    <button
                      className="link danger-link"
                      onClick={() => {
                        if (window.confirm(mine ? 'Delete your message?' : `Delete ${m.author.displayName}'s message? (admin)`)) onDelete(m.id);
                        setSelected(null);
                      }}
                    >
                      🗑 Delete{!mine ? ' (admin)' : ''}
                    </button>
                  )}
                  {m.edits && m.edits.length > 0 && (
                    <button className="link" onClick={() => toggleHistory(m.id)}>
                      🕘 {history.has(m.id) ? 'Hide' : 'View'} unedited version{m.edits.length > 1 ? 's' : ''}
                    </button>
                  )}
                  {!mine && (
                    <button
                      className="link"
                      onClick={() => {
                        setReporting({ kind: 'chat', id: m.id, authorName: m.author.displayName, text: m.text, roomId });
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
      {reporting && <ReportMessageDialog message={reporting} onClose={() => setReporting(null)} />}
      {hiddenCount > 0 && <p className="hidden-note">{hiddenCount} message{hiddenCount === 1 ? '' : 's'} from muted people hidden</p>}
      <form onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Message this building…" aria-label="Message" />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
