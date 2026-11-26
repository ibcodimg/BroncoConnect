import { ALL_ROOMS, findRoom, roomTag } from '@shared/buildings';
import { AUDIT_TYPES, type AdminStats, type AuditType, type AuditView, type BanView, type ReportView, type RoomMessageCount, type SuggestionView } from '@shared/types';
import StrokePreview from '../components/StrokePreview';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserName } from '../components/UserCard';
import { api, type AdminUser } from '../lib/api';
import { useSession } from '../lib/session';

type Tab = 'overview' | 'audit' | 'reports' | 'suggestions' | 'chatrooms' | 'users' | 'bans';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  audit: 'Audit log',
  reports: 'Reports',
  suggestions: 'Suggestions',
  chatrooms: 'Chatrooms',
  users: 'Users',
  bans: 'Active bans',
};

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
  const [tab, setTab] = useState<Tab>(params.get('user') ? 'users' : 'overview');

  if (!me) return <p className="page">Connecting…</p>;
  if (!me.isAdmin) return <ClaimAdmin />;

  return (
    <div className="page admin">
      <h1>🛡 Admin</h1>
      <div className="segmented">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'reports' && <Reports />}
      {tab === 'suggestions' && <Suggestions />}
      {tab === 'chatrooms' && <Chatrooms />}
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
              {r.target ? (
                <>
                  <strong>
                    <UserName publicId={r.target.publicId} name={r.target.displayName} roomId={r.roomId} />
                  </strong>{' '}
                  reported for <strong>{r.reason.replace(/-/g, ' ')}</strong>
                </>
              ) : (
                <strong>🐞 Problem report</strong>
              )}{' '}
              by{' '}
              <UserName publicId={r.reporter.publicId} name={r.reporter.displayName} />
              {r.roomId && <> in {findRoom(r.roomId)?.name ?? r.roomId}</>} · {fmt(r.createdAt)}
              {r.target?.banned && <span className="tag">banned</span>}
            </p>
            {r.details && <blockquote>{r.details}</blockquote>}
            {r.surrounding.length > 0 && (
              <div className="report-context">
                <p className="meta">
                  {r.messageKind === 'dm' ? '🔒 Reported private message (with surrounding messages from that conversation)' : '💬 Reported chat message in context'}
                </p>
                <ol>
                  {r.surrounding.map((l, i) => (
                    <li key={i} className={l.reported ? 'reported' : ''}>
                      <time>{fmt(l.createdAt)}</time> <strong>{l.authorName}:</strong> {l.text}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {r.drawings.length > 0 && (
              <details>
                <summary>Their recent drawings ({r.drawings.reduce((n, d) => n + d.strokes.length, 0)} strokes)</summary>
                <div className="drawing-previews">
                  {r.drawings.map((d) => (
                    <figure key={d.roomId}>
                      <StrokePreview strokes={d.strokes} />
                      <figcaption>{findRoom(d.roomId)?.name ?? d.roomId}</figcaption>
                    </figure>
                  ))}
                </div>
              </details>
            )}
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
              {r.target && !r.target.banned && <button onClick={() => setBanning(banning === r.id ? null : r.id)}>Ban…</button>}
            </div>
            {banning === r.id && r.target && (
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

function Overview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => {
    api.admin.stats().then(setStats).catch(() => {});
  }, []);
  if (!stats) return <p>Loading…</p>;
  const tiles: [string, number, string?][] = [
    ['Users', stats.users, `${stats.usersWithName} picked a username`],
    ['Online now', stats.onlineNow],
    ['Active today', stats.activeToday],
    ['Active this week', stats.activeThisWeek],
    ['Chat messages', stats.chatMessages],
    ['Private messages', stats.directMessages, 'count only — contents are private'],
    ['Friendships', stats.friendships],
    ['Open reports', stats.openReports],
    ['New suggestions', stats.openSuggestions],
    ['Active bans', stats.activeBans],
  ];
  return (
    <section>
      <div className="stat-grid">
        {tiles.map(([label, n, sub]) => (
          <div key={label} className="stat">
            <strong>{n}</strong>
            <span>{label}</span>
            {sub && <small>{sub}</small>}
          </div>
        ))}
      </div>
      {stats.topRooms.length > 0 && (
        <>
          <h3>Busiest chatrooms</h3>
          <ol>
            {stats.topRooms.map((r) => (
              <li key={r.roomId}>
                {findRoom(r.roomId)?.name ?? r.roomId}: {r.count} messages
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

const AUDIT_LABELS: Record<AuditType, string> = {
  'chat-message': '💬 Message sent',
  'chat-deleted': '🗑 Message deleted',
  'chat-purged': '🧹 Chatroom purged',
  report: '⚑ Report sent',
  'report-resolved': '✅ Report resolved',
  suggestion: '💡 Suggestion',
  'friend-request': '➕ Friend request',
  'friend-accept': '🤝 Friend accepted',
  'friend-remove': '➖ Friend removed',
  'name-change': '✏️ Name change',
  ban: '⛔ Ban',
  unban: '♻️ Unban',
};

function AuditLog() {
  const [types, setTypes] = useState<Set<AuditType>>(new Set());
  const [user, setUser] = useState('');
  const [roomId, setRoomId] = useState('');
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<AuditView[] | null>(null);
  const [more, setMore] = useState(false);

  const filters = { types: [...types], user: user.trim(), roomId, q: q.trim() };
  const key = JSON.stringify(filters);

  useEffect(() => {
    const t = setTimeout(() => {
      api.admin
        .audit(filters)
        .then((e) => {
          setEvents(e);
          setMore(e.length === 100);
        })
        .catch(() => setEvents([]));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loadMore = async () => {
    if (!events?.length) return;
    const next = await api.admin.audit({ ...filters, before: events[events.length - 1].createdAt });
    setEvents([...events, ...next]);
    setMore(next.length === 100);
  };

  const toggle = (t: AuditType) =>
    setTypes((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <section>
      <p className="hint">Everything people do in public, newest first, kept for 90 days. Private messages are never logged.</p>
      <div className="audit-filters">
        <div className="chips">
          {AUDIT_TYPES.map((t) => (
            <button key={t} className={types.has(t) ? 'active' : ''} onClick={() => toggle(t)} aria-pressed={types.has(t)}>
              {AUDIT_LABELS[t]}
            </button>
          ))}
          {types.size > 0 && (
            <button className="link" onClick={() => setTypes(new Set())}>
              show all types
            </button>
          )}
        </div>
        <div className="row">
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username" aria-label="Filter by username" />
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Filter by chatroom">
            <option value="">All chatrooms</option>
            {ALL_ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {roomTag(r)} · {r.name}
              </option>
            ))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Text contains…" aria-label="Filter by text" />
        </div>
      </div>
      {events?.length === 0 && <p className="hint">Nothing matches.</p>}
      <table className="users-table audit-table">
        <thead>
          <tr>
            <th>When</th>
            <th>What</th>
            <th>Who</th>
            <th>Where</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {events?.map((e) => (
            <tr key={e.id}>
              <td className="nowrap">{fmt(e.createdAt)}</td>
              <td className="nowrap">{AUDIT_LABELS[e.type]}</td>
              <td>
                {e.actor && <UserName publicId={e.actor.publicId} name={e.actor.displayName || 'someone'} />}
                {e.target && (
                  <>
                    {' → '}
                    <UserName publicId={e.target.publicId} name={e.target.displayName || 'someone'} />
                  </>
                )}
              </td>
              <td>{e.roomId ? (findRoom(e.roomId)?.name ?? e.roomId) : ''}</td>
              <td className="prewrap">{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more && <button onClick={loadMore}>Load older</button>}
    </section>
  );
}

function Suggestions() {
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const [items, setItems] = useState<SuggestionView[] | null>(null);
  const load = useCallback(() => {
    api.admin.suggestions(status).then(setItems).catch(() => setItems([]));
  }, [status]);
  useEffect(load, [load]);

  return (
    <section>
      <div className="row">
        <label>
          <input type="radio" checked={status === 'open'} onChange={() => setStatus('open')} /> New
        </label>
        <label>
          <input type="radio" checked={status === 'done'} onChange={() => setStatus('done')} /> Done
        </label>
      </div>
      {items?.length === 0 && <p className="hint">No {status === 'open' ? 'new' : 'finished'} suggestions.</p>}
      <ul className="report-list">
        {items?.map((s) => (
          <li key={s.id}>
            <p>
              💡 <UserName publicId={s.author.publicId} name={s.author.displayName} /> · {fmt(s.createdAt)}
            </p>
            <blockquote className="prewrap">{s.text}</blockquote>
            <button
              onClick={async () => {
                await api.admin.setSuggestion(s.id, s.status === 'open' ? 'done' : 'reopen');
                load();
              }}
            >
              {s.status === 'open' ? 'Mark done' : 'Reopen'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chatrooms() {
  const [counts, setCounts] = useState<RoomMessageCount[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    api.admin.rooms().then(setCounts).catch(() => setCounts([]));
  }, []);
  useEffect(load, [load]);

  const purge = async (roomId: string, label: string) => {
    if (!window.confirm(`Delete every message in ${label}? This can't be undone.`)) return;
    const { deleted } = await api.admin.purge(roomId);
    setNotice(`Deleted ${deleted} message${deleted === 1 ? '' : 's'} from ${label}.`);
    load();
  };

  const total = counts?.reduce((n, c) => n + c.count, 0) ?? 0;
  const order = new Map(ALL_ROOMS.map((r, i) => [r.id, i]));

  return (
    <section>
      <p className="hint">Purging deletes chat messages for everyone (whiteboards are untouched). You can also delete a single message: click it in a chatroom and choose 🗑 Delete.</p>
      {notice && <p className="ok">{notice}</p>}
      <div className="row">
        <strong>{total} messages in {counts?.length ?? 0} chatrooms</strong>
        <button className="danger" disabled={!total} onClick={() => purge('all', 'ALL chatrooms')}>
          Purge all chatrooms
        </button>
      </div>
      <table className="users-table">
        <thead>
          <tr>
            <th>Chatroom</th>
            <th>Messages</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...(counts ?? [])]
            .sort((a, b) => (order.get(a.roomId) ?? 999) - (order.get(b.roomId) ?? 999))
            .map((c) => {
              const room = findRoom(c.roomId);
              const label = room ? `${roomTag(room)} · ${room.name}` : c.roomId;
              return (
                <tr key={c.roomId}>
                  <td>{label}</td>
                  <td>{c.count}</td>
                  <td>
                    <button onClick={() => purge(c.roomId, room?.name ?? c.roomId)}>Purge</button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
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
