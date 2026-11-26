import type { PublicUser, ReportReason } from '@shared/types';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../lib/api';

const PERSON_REASONS: Record<Exclude<ReportReason, 'bug'>, string> = {
  harassment: 'Harassment or bullying',
  spam: 'Spam',
  'inappropriate-drawing': 'Inappropriate drawing',
  'inappropriate-message': 'Inappropriate message',
  other: 'Something else',
};

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function SuggestionDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api.suggest(text);
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  };

  return (
    <Dialog title="💡 Suggest something" onClose={onClose}>
      {state === 'sent' ? (
        <>
          <p>Thanks! Your suggestion was sent to the BroncoConnect team.</p>
          <button onClick={onClose}>Close</button>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <p className="hint">A feature idea, a building we're missing, something confusing, anything.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} autoFocus placeholder="I wish BroncoConnect…" />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="primary" type="submit" disabled={!text.trim() || state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send suggestion'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ReportDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'person' | 'problem'>('person');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PublicUser[]>([]);
  const [target, setTarget] = useState<PublicUser | null>(null);
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (kind !== 'person' || !q || target) return setFound([]);
    const t = setTimeout(() => api.searchPeople(q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [query, kind, target]);

  const canSend = kind === 'person' ? !!target : !!details.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await api.report(
        kind === 'person'
          ? { targetId: target!.publicId, reason, details: details.trim() || undefined }
          : { reason: 'bug', details: details.trim() },
      );
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  };

  return (
    <Dialog title="⚑ Report" onClose={onClose}>
      {state === 'sent' ? (
        <>
          <p>Thanks for reporting. An admin will review it.</p>
          <button onClick={onClose}>Close</button>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          <div className="segmented">
            <button type="button" className={kind === 'person' ? 'active' : ''} onClick={() => setKind('person')}>
              A person
            </button>
            <button type="button" className={kind === 'problem' ? 'active' : ''} onClick={() => setKind('problem')}>
              A bug or problem
            </button>
          </div>

          {kind === 'person' && (
            <>
              {target ? (
                <p>
                  Reporting <strong>{target.displayName}</strong>{' '}
                  <button type="button" className="link" onClick={() => setTarget(null)}>
                    change
                  </button>
                </p>
              ) : (
                <>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search their username…" autoFocus aria-label="Username" />
                  {found.length > 0 && (
                    <ul className="people-list pick">
                      {found.map((u) => (
                        <li key={u.publicId}>
                          <button type="button" className="link" onClick={() => setTarget(u)}>
                            {u.displayName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="hint">Tip: you can also click someone's name anywhere and choose Report.</p>
                </>
              )}
              {(Object.keys(PERSON_REASONS) as (keyof typeof PERSON_REASONS)[]).map((r) => (
                <label key={r} className="mute-option">
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {PERSON_REASONS[r]}
                </label>
              ))}
            </>
          )}

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder={kind === 'person' ? 'What happened? (optional)' : 'What went wrong? Where? What did you expect?'}
          />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="danger" type="submit" disabled={!canSend || state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Top-right buttons: Suggestions and Report. */
export default function HeaderActions() {
  const [open, setOpen] = useState<'suggest' | 'report' | null>(null);
  return (
    <div className="header-actions">
      <button onClick={() => setOpen('suggest')} title="Suggest a feature or improvement">
        💡 Suggestions
      </button>
      <button onClick={() => setOpen('report')} title="Report a person or a problem">
        ⚑ Report
      </button>
      {open === 'suggest' && <SuggestionDialog onClose={() => setOpen(null)} />}
      {open === 'report' && <ReportDialog onClose={() => setOpen(null)} />}
    </div>
  );
}
