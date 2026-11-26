import type { ChatMessage } from '@shared/types';
import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Props {
  messages: ChatMessage[];
  myId: string;
  onSend: (text: string) => void;
}

export default function Chat({ messages, myId, onSend }: Props) {
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);

  // Keep the newest message in view. (Block body on purpose: an effect must not return a value —
  // newer browsers make scroll methods return a Promise, which React would treat as a cleanup and crash.)
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

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
        {messages.length === 0 && <li className="empty">No messages yet — say hi 👋</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.author.publicId === myId ? 'mine' : ''}>
            <span className="author">{m.author.displayName}</span>
            <time dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </time>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
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
