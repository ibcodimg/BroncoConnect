import type { ChatMessage } from '@shared/types';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutes } from '../lib/mutes';
import ReportMessageDialog, { type ReportableMessage } from './ReportMessageDialog';
import { UserName } from './UserCard';

interface Props {
  roomId: string;
  messages: ChatMessage[];
  myId: string;
  onSend: (text: string) => void;
  /** Admins get a 🗑 button on each message. */
  onDelete?: (messageId: string) => void;
}

export default function Chat({ roomId, messages, myId, onSend, onDelete }: Props) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <section className="chat">
      <ol ref={list} className="messages" aria-live="polite">
        {shown.length === 0 && <li className="empty">No messages yet. Say hi 👋</li>}
        {shown.map((m) => (
          <li
            key={m.id}
            className={`${m.author.publicId === myId ? 'mine' : ''} ${selected === m.id ? 'selected' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return; // name / action buttons handle themselves
              setSelected((s) => (s === m.id ? null : m.id));
            }}
            title="Click for options"
          >
            <UserName className="author" publicId={m.author.publicId} name={m.author.displayName} roomId={roomId} />
            <time dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </time>
            <p>{m.text}</p>
            {selected === m.id && (
              <div className="msg-actions">
                {m.author.publicId !== myId && (
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
                {onDelete && (
                  <button className="link danger-link" onClick={() => onDelete(m.id)}>
                    🗑 Delete (admin)
                  </button>
                )}
                {m.author.publicId === myId && !onDelete && <span className="hint">Your message</span>}
              </div>
            )}
          </li>
        ))}
      </ol>
      {reporting && <ReportMessageDialog message={reporting} onClose={() => setReporting(null)} />}
      {hiddenCount > 0 && <p className="hidden-note">{hiddenCount} message{hiddenCount === 1 ? '' : 's'} from muted people hidden</p>}
      <form onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Message this building…"
          aria-label="Message"
        />
        <button className="primary" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
