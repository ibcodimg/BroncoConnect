import { findRoom } from '@shared/buildings';
import { REPORT_REASONS, type PublicProfile, type ReportReason } from '@shared/types';
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useMutes } from '../lib/mutes';
import { LOOKING_SHORT } from '../lib/labels';
import { useSession } from '../lib/session';

interface Target {
  publicId: string;
  /** The room you clicked them in, for "in this building" mutes and report context. */
  roomId?: string;
}

const Ctx = createContext<(t: Target) => void>(() => {});

/** Call `openUser({ publicId, roomId })` from anywhere to show someone's card. */
export const useOpenUser = () => useContext(Ctx);

export function UserCardProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t: Target) => setTarget(t), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {target && <UserCardModal key={target.publicId} target={target} onClose={() => setTarget(null)} />}
    </Ctx.Provider>
  );
}

/** A clickable username. Use this everywhere a person's name appears. */
export function UserName({ publicId, name, roomId, className }: { publicId: string; name: string; roomId?: string; className?: string }) {
  const openUser = useOpenUser();
  return (
    <button type="button" className={`username ${className ?? ''}`} onClick={() => openUser({ publicId, roomId })}>
      {name}
    </button>
  );
}

const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  spam: 'Spam',
  'inappropriate-drawing': 'Inappropriate drawing',
  'inappropriate-message': 'Inappropriate message',
  other: 'Something else',
};


function UserCardModal({ target, onClose }: { target: Target; onClose: () => void }) {
  const { me } = useSession();
  const mutes = useMutes();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'card' | 'report' | 'reported'>('card');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .person(target.publicId)
      .then(setPerson)
      .catch(() => setError("Couldn't load this person."));
  }, [target.publicId]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const room = target.roomId && target.roomId !== 'campus' ? findRoom(target.roomId) : undefined;
  const roomLabel = room ? (room.number ? `Building ${room.number}` : room.name) : target.roomId === 'campus' ? 'the campus chat' : '';

  const friendAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      load();
    } finally {
      setBusy(false);
    }
  };

  const muteBox = (kind: 'draw' | 'text', scope: string, label: string) =>
    person && (
      <label className="mute-option">
        <input
          type="checkbox"
          checked={mutes.has(person.publicId, kind, scope)}
          onChange={() => mutes.toggle({ publicId: person.publicId, displayName: person.displayName, kind, scope })}
        />{' '}
        {label}
      </label>
    );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal user-card" role="dialog" aria-modal="true" aria-label="User">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {error && <p className="error">{error}</p>}
        {!person && !error && <p>Loading…</p>}

        {person && view === 'card' && (
          <>
            <h2>
              {person.displayName} {person.online && <span className="online-dot" title="Online now" />}
            </h2>
            <p className="meta">
              {[person.majors.join(', '), person.status].filter(Boolean).join(' · ') || 'No profile details'}
              {person.lookingFor.length > 0 && <> · looking for {person.lookingFor.map((l) => LOOKING_SHORT[l] ?? l).join(', ')}</>}
            </p>
            {(person.strongSubjects.length > 0 || person.coursesTaken.length > 0) && (
              <p className="meta">
                Can help with: {[...person.strongSubjects, ...person.coursesTaken.map((c) => c.course + (c.professor ? ` (${c.professor})` : ''))].join(', ')}
              </p>
            )}
            {(person.needHelpSubjects.length > 0 || person.coursesNeedHelp.length > 0) && (
              <p className="meta">
                Wants help with: {[...person.needHelpSubjects, ...person.coursesNeedHelp.map((c) => c.course + (c.professor ? ` (${c.professor})` : ''))].join(', ')}
              </p>
            )}

            {person.isMe ? (
              <p className="hint">This is you.</p>
            ) : (
              <>
                <div className="row actions">
                  {person.friendStatus === 'none' && (
                    <button className="primary" disabled={busy} onClick={() => friendAction(() => api.addFriend(person.publicId))}>
                      + Add friend
                    </button>
                  )}
                  {person.friendStatus === 'outgoing' && (
                    <button disabled={busy} onClick={() => friendAction(() => api.removeFriend(person.publicId))}>
                      Request sent · Cancel
                    </button>
                  )}
                  {person.friendStatus === 'incoming' && (
                    <>
                      <button className="primary" disabled={busy} onClick={() => friendAction(() => api.addFriend(person.publicId))}>
                        Accept friend request
                      </button>
                      <button disabled={busy} onClick={() => friendAction(() => api.removeFriend(person.publicId))}>
                        Decline
                      </button>
                    </>
                  )}
                  {person.friendStatus === 'friends' && (
                    <button disabled={busy} onClick={() => friendAction(() => api.removeFriend(person.publicId))}>
                      ✓ Friends · Remove
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onClose();
                      navigate(`/messages/${person.publicId}`);
                    }}
                  >
                    💬 Message
                  </button>
                  <button className="danger" onClick={() => setView('report')}>
                    ⚑ Report
                  </button>
                </div>

                <fieldset className="mutes">
                  <legend>Mute (only you see the difference)</legend>
                  {roomLabel && muteBox('draw', target.roomId!, `Hide their drawings in ${roomLabel}`)}
                  {muteBox('draw', 'all', 'Hide all their drawings')}
                  {roomLabel && muteBox('text', target.roomId!, `Hide their messages in ${roomLabel}`)}
                  {muteBox('text', 'all', 'Hide all their messages in every building')}
                </fieldset>

                {me?.isAdmin && (
                  <button
                    className="link"
                    onClick={() => {
                      onClose();
                      navigate(`/admin?user=${person.publicId}`);
                    }}
                  >
                    🛡 Moderate in admin
                  </button>
                )}
              </>
            )}
          </>
        )}

        {person && view === 'report' && (
          <ReportForm person={person} roomId={target.roomId} onDone={() => setView('reported')} onCancel={() => setView('card')} />
        )}
        {person && view === 'reported' && (
          <>
            <h2>Thanks for reporting</h2>
            <p>An admin will review it. You can also mute {person.displayName} so you don't see their messages or drawings.</p>
            <button onClick={() => setView('card')}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}

function ReportForm({
  person,
  roomId,
  onDone,
  onCancel,
}: {
  person: PublicProfile;
  roomId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.report({ targetId: person.publicId, reason, details: details.trim() || undefined, roomId });
      onDone();
    } catch (err) {
      setError((err as Error).message || "Couldn't send the report.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="report-form">
      <h2>Report {person.displayName}</h2>
      <p className="hint">Admins will see this report along with their recent messages{roomId ? ' in this room' : ''}.</p>
      {REPORT_REASONS.map((r) => (
        <label key={r} className="mute-option">
          <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {REASON_LABELS[r]}
        </label>
      ))}
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        placeholder="What happened? (optional)"
        rows={3}
      />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="danger" type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
