import type { ReportReason } from '@shared/types';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';

export interface ReportableMessage {
  kind: 'chat' | 'dm';
  id: string;
  authorName: string;
  text: string;
  roomId?: string;
}

const REASONS: Record<Exclude<ReportReason, 'bug'>, string> = {
  harassment: 'Harassment or bullying',
  'inappropriate-message': 'Inappropriate message',
  spam: 'Spam',
  'inappropriate-drawing': 'Inappropriate drawing',
  other: 'Something else',
};

/** Report one specific message. Admins see it with the messages around it (and the person's recent drawings). */
export default function ReportMessageDialog({ message, onClose }: { message: ReportableMessage; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('inappropriate-message');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api.report({ reason, details: details.trim() || undefined, roomId: message.roomId, message: { kind: message.kind, id: message.id } });
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Report message">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>⚑ Report message</h2>
        {state === 'sent' ? (
          <>
            <p>Thanks. An admin will review it.</p>
            <button onClick={onClose}>Close</button>
          </>
        ) : (
          <form onSubmit={submit} className="stack">
            <blockquote className="reported-quote">
              <strong>{message.authorName}:</strong> {message.text}
            </blockquote>
            <p className="hint">
              {message.kind === 'dm'
                ? 'Admins will see this message and a few messages around it from this conversation. They can’t see your other private messages.'
                : 'Admins will see this message and the messages around it.'}
            </p>
            {(Object.keys(REASONS) as (keyof typeof REASONS)[]).map((r) => (
              <label key={r} className="mute-option">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {REASONS[r]}
              </label>
            ))}
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} placeholder="Anything else admins should know? (optional)" />
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="danger" type="submit" disabled={state === 'sending'}>
                {state === 'sending' ? 'Sending…' : 'Send report'}
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
