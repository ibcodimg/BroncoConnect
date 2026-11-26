import type { BuildingSummary } from '@shared/types';
import { Link } from 'react-router-dom';

const FEATURE_LABELS: Record<string, string> = {
  'graphing-calculator': '📈 Graphing calculator',
};

/** Building info shown in the map popup (or floating panel): number, name, who's here, Join button. */
export default function BuildingCard({ building }: { building: BuildingSummary }) {
  return (
    <div className="building-card">
      <p className="building-number">{building.id === 'campus' ? 'Campus-wide' : `Building ${building.number}`}</p>
      <h2>{building.name}</h2>
      <ul className="stats">
        <li>
          <strong>{building.onlineCount}</strong> in the chatroom now
        </li>
        <li>
          <strong>{building.onCampusNow}</strong> here right now (by schedule)
        </li>
      </ul>
      {building.features?.length ? (
        <p className="features">{building.features.map((f) => FEATURE_LABELS[f] ?? f).join(' · ')}</p>
      ) : null}
      <Link className="button primary" to={`/room/${building.id}`}>
        Join chatroom
      </Link>
    </div>
  );
}
