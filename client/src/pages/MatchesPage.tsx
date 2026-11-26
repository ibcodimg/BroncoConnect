import { findRoom } from '@shared/buildings';
import { DAY_LABELS } from '@shared/schedule';
import type { Match } from '@shared/types';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .matches()
      .then(setMatches)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="page">
      <h1>People on campus when you are</h1>
      <p className="hint">Same building, same day, same time of day — based on the schedule in your profile.</p>
      {error && <p className="error">Couldn’t load matches.</p>}
      {matches?.length === 0 && (
        <p>
          No overlaps yet. <Link to="/profile">Add your schedule</Link> so others can find you too.
        </p>
      )}
      <ul className="matches">
        {matches?.map((m) => (
          <li key={m.publicId}>
            <h3>{m.displayName}</h3>
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
    </div>
  );
}
