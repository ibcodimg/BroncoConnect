import { findRoom } from '@shared/buildings';
import type { BanView, ReportView } from '@shared/types';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserName } from '../components/UserCard';
import { api, type AdminUser } from '../lib/api';
import { useSession } from '../lib/session';

type Tab = 'reports' | 'users' | 'bans';

const DURATIONS: { label: string; hours: number | null }[] = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'Permanent', hours: null },
];

const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function AdminPage() {
  const { me } = useSession();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('user') ? 'users' : 'reports');

  if (!me) return <p className="page">Connecting…</p>;
  if (!me.isAdmin) return <ClaimAdmin />;

  return (
    <div className="page admin">
      <h1>🛡 Admin</h1>
      <div className="segmented">
        {(['reports', 'users', 'bans'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'reports' ? 'Reports' : t === 'users' ? 'Users' : 'Active bans'}
          </button>
        ))}
      </div>
      {tab === 'reports' && <Reports />}
      {tab === 'users' && <Users initialQuery={params.get('user') ?? ''} />}
      {tab === 'bans' && <Bans />}
    </div>
  );
}

function ClaimAdmin() {
  const { refresh } = useSession();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.admin.claim(token);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="page" onSubmit={submit}>
      <h1>Admin sign-in</h1>
      <p className="hint">Enter the ADMIN_TOKEN set on the server. This browser will stay an admin afterwards.</p>
      <div className="row">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin token" aria-label="Admin token" />
        <button className="primary" type="submit" disabled={!token}>
          Become admin
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function BanForm({ publicId, name, lastIp, onDone }: { publicId: string; name: string; lastIp?: string; onDone: () => void }) {
  const [kind, setKind] = useState<'user' | 'ip'>('user');
  const [hours, setHours] = useState<number | null>(24);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.admin.ban({ publicId, kind, hours, reason: reason.trim() || undefined });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="ban-form" onSubmit={submit}>
      <strong>Ban {name}</strong>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value as 'user' | 'ip')} aria-label="Ban type">
          <option value="user">This user</option>
          <option value="ip" disabled={!lastIp}>
            Their IP{lastIp ? ` (${lastIp})` : ' (unknown)'}
          </option>
        </select>
        <select value={String(hours)} onChange={(e) => setHours(e.target.value === 'null' ? null : Number(e.target.value))} aria-label="Duration">
          {DURATIONS.map((d) => (
            <option key={d.label} value={String(d.hours)}>
              {d.label}
            </option>
          ))}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to them)" maxLength={300} />
        <button className="danger" type="submit">
          Ban
        </button>
      </div>
      {kind === 'ip' && (
        <p className="warning">
          ⚠ IP bans block everyone on that network. Campus Wi-Fi can share one IP across many students, so prefer user bans
          unless someone keeps making new identities.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function Reports() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [reports, setReports] = useState<ReportView[] | null>(null);
  const [banning, setBanning] = useState<string | null>(null);

  const load = useCallback(() => {
    api.admin.reports(status).then(setReports).catch(() => setReports([]));
  }, [status]);
  useEffect(load, [load]);

  const act = async (id: string, action: 'resolve' | 'reopen') => {
    await api.admin.setReport(id, action);
    load();
  };

  return (
    <section>
      <div className="row">
        <label>
          <input type="radio" checked={status === 'open'} onChange={() => setStatus('open')} /> Open
        </label>
        <label>
          <input type="radio" checked={status === 'resolved'} onChange={() => setStatus('resolved')} /> Resolved
        </label>
      </div>
      {reports?.length === 0 && <p className="hint">No {status} reports.</p>}
      <ul className="report-list">
        {reports?.map((r) => (
          <li key={r.id}>
            <p>
              <strong>
                <UserName publicId={r.target.publicId} name={r.target.displayName} roomId={r.roomId} />
              </strong>{' '}
              reported for <strong>{r.reason.replace(/-/g, ' ')}</strong> by{' '}
              <UserName publicId={r.reporter.publicId} name={r.reporter.displayName} />
              {r.roomId && <> in {findRoom(r.roomId)?.name ?? r.roomId}</>} · {fmt(r.createdAt)}
              {r.target.banned && <span className="tag">banned</span>}
            </p>
            {r.details && <blockquote>{r.details}</blockquote>}
            {r.context.length > 0 && (
              <details>
                <summary>Their recent messages ({r.context.length})</summary>
                <ul className="context">
                  {r.context.map((c, i) => (
                    <li key={i}>
                      <time>{fmt(c.createdAt)}</time> {c.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="row">
              {r.status === 'open' ? (
                <button onClick={() => act(r.id, 'resolve')}>Mark resolved</button>
              ) : (
                <button onClick={() => act(r.id, 'reopen')}>Reopen</button>
              )}
              {!r.target.banned && <button onClick={() => setBanning(banning === r.id ? null : r.id)}>Ban…</button>}
            </div>
            {banning === r.id && (
              <BanForm
                publicId={r.target.publicId}
                name={r.target.displayName}
                lastIp={r.target.lastIp}
                onDone={() => {
                  setBanning(null);
                  load();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Users({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [banning, setBanning] = useState<string | null>(initialQuery || null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.admin.users(q.trim()).then(setUsers).catch(() => setUsers([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section>
      <input type="search" className="big-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username…" />
      {done && <p className="ok">{done}</p>}
      <table className="users-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Last IP</th>
            <th>Last seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.publicId}>
              <td>
                <UserName publicId={u.publicId} name={u.displayName} /> {u.isAdmin && <span className="tag">admin</span>}
                {banning === u.publicId && (
                  <BanForm
                    publicId={u.publicId}
                    name={u.displayName}
                    lastIp={u.lastIp}
                    onDone={() => {
                      setBanning(null);
                      setDone(`Banned ${u.displayName}.`);
                    }}
                  />
                )}
              </td>
              <td>{u.lastIp ?? '—'}</td>
              <td>{fmt(u.lastSeenAt)}</td>
              <td>{!u.isAdmin && <button onClick={() => setBanning(banning === u.publicId ? null : u.publicId)}>Ban…</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Bans() {
  const [bans, setBans] = useState<BanView[] | null>(null);
  const load = useCallback(() => {
    api.admin.bans().then(setBans).catch(() => setBans([]));
  }, []);
  useEffect(load, [load]);

  return (
    <section>
      {bans?.length === 0 && <p className="hint">No active bans.</p>}
      <ul className="report-list">
        {bans?.map((b) => (
          <li key={b.id}>
            <p>
              {b.kind === 'user' ? (
                <>
                  User <UserName publicId={b.value} name={b.displayName ?? b.value} />
                </>
              ) : (
                <>IP {b.value}</>
              )}{' '}
              · {b.until ? `until ${fmt(b.until)}` : 'permanent'} · banned {fmt(b.createdAt)}
            </p>
            {b.reason && <blockquote>{b.reason}</blockquote>}
            <button
              onClick={async () => {
                await api.admin.unban(b.id);
                load();
              }}
            >
              Lift ban
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
