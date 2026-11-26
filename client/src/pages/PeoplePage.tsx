import { findRoom } from '@shared/buildings';
import { DAY_LABELS } from '@shared/schedule';
import type { FriendsList, Match, PublicUser } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserName } from '../components/UserCard';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

type Found = PublicUser & { online: boolean };

export default function PeoplePage() {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [friends, setFriends] = useState<FriendsList | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [hasSchedule, setHasSchedule] = useState(true);

  const loadFriends = useCallback(() => {
    api.friends().then(setFriends).catch(() => {});
  }, []);

  useEffect(() => {
    loadFriends();
    api.matches().then(setMatches).catch(() => setMatches([]));
    api
      .myProfile()
      .then((p) => setHasSchedule(p.schedule.length > 0))
      .catch(() => {});
    socket.on('friend:update', loadFriends);
    return () => {
      socket.off('friend:update', loadFriends);
    };
  }, [loadFriends]);

  // Search as you type (debounced).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      return;
    }
    const t = setTimeout(() => {
      api.searchPeople(q).then(setFound).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const respond = async (publicId: string, accept: boolean) => {
    await (accept ? api.addFriend(publicId) : api.removeFriend(publicId));
    loadFriends();
  };

  return (
    <div className="page people">
      <h1>People</h1>

      <section>
        <input
          type="search"
          className="big-search"
          placeholder="Search by username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people by username"
        />
        {found && (
          <ul className="people-list">
            {found.length === 0 && <li className="hint">No one by that name.</li>}
            {found.map((u) => (
              <li key={u.publicId}>
                {u.online && <span className="online-dot" title="Online" />}
                <UserName publicId={u.publicId} name={u.displayName} />
                <span className="meta">{[u.major, u.status].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {friends && friends.incoming.length > 0 && (
        <section>
          <h2>Friend requests</h2>
          <ul className="people-list">
            {friends.incoming.map((u) => (
              <li key={u.publicId}>
                <UserName publicId={u.publicId} name={u.displayName} />
                <button className="primary" onClick={() => respond(u.publicId, true)}>
                  Accept
                </button>
                <button onClick={() => respond(u.publicId, false)}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Friends</h2>
        {friends?.friends.length === 0 && <p className="hint">No friends yet. Click anyone's name to add them.</p>}
        <ul className="people-list">
          {friends?.friends.map((u) => (
            <li key={u.publicId}>
              {u.online && <span className="online-dot" title="Online" />}
              <UserName publicId={u.publicId} name={u.displayName} />
              <Link to={`/messages/${u.publicId}`}>Message</Link>
            </li>
          ))}
        </ul>
        {friends && friends.outgoing.length > 0 && (
          <p className="hint">
            Waiting on: {friends.outgoing.map((u) => u.displayName).join(', ')}
          </p>
        )}
      </section>

      <section>
        <h2>On campus when you are</h2>
        <p className="hint">Same building, same day, same time of day, based on your schedule.</p>
        {!hasSchedule && (
          <p>
            <Link to="/profile">Add your weekly schedule</Link> to see who overlaps with you.
          </p>
        )}
        {hasSchedule && matches?.length === 0 && <p>No overlaps yet. As more people add their schedules, they'll show up here.</p>}
        <ul className="matches">
          {matches?.map((m) => (
            <li key={m.publicId}>
              <h3>
                <UserName publicId={m.publicId} name={m.displayName} />
              </h3>
              <p className="meta">
                {[m.major, m.status].filter(Boolean).join(' · ')}
                {m.lookingFor.length > 0 && ` · looking for ${m.lookingFor.join(', ')}`}
              </p>
              <ul className="overlaps">
                {m.overlaps.map((o, i) => (
                  <li key={i}>
                    {DAY_LABELS[o.day]} {o.start}–{o.end} ·{' '}
                    <Link to={`/room/${o.buildingId}`}>{findRoom(o.buildingId)?.name ?? o.buildingId}</Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
