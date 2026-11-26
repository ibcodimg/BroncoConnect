import type { ChatMessage } from '@shared/types';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutes } from '../lib/mutes';
import { UserName } from './UserCard';

interface Props {
  roomId: string;
  messages: ChatMessage[];
  myId: string;
  onSend: (text: string) => void;
}

export default function Chat({ roomId, messages, myId, onSend }: Props) {
  const [text, setText] = useState('');
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
          <li key={m.id} className={m.author.publicId === myId ? 'mine' : ''}>
            <UserName className="author" publicId={m.author.publicId} name={m.author.displayName} roomId={roomId} />
            <time dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </time>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
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
