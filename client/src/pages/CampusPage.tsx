import type { BuildingSummary } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import CampusMap from '../components/CampusMap';
import { api } from '../lib/api';

const REFRESH_MS = 15_000;

export default function CampusPage() {
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .buildings()
        .then((b) => {
          if (!alive) return;
          setBuildings(b);
          setError(null);
        })
        .catch(() => alive && setError("Can't reach the server."));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buildings.filter((b) => !q || b.name.toLowerCase().includes(q) || b.number === q);
  }, [buildings, query]);

  return (
    <div className="campus-page">
      <aside className="building-list">
        <input
          type="search"
          placeholder="Search buildings (e.g. 8 or Library)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <ul>
          {filtered.map((b) => (
            <li key={b.id}>
              <button className={b.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(b.id)}>
                <span className="num">{b.id === 'campus' ? '★' : b.number}</span>
                <span className="name">{b.name}</span>
                {b.onlineCount > 0 && <span className="badge">{b.onlineCount}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="map-area">
        <CampusMap buildings={buildings} selectedId={selectedId} onSelect={setSelectedId} />
      </section>
    </div>
  );
}
