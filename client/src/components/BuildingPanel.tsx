import type { BuildingSummary } from '@shared/types';
import { Link } from 'react-router-dom';

const FEATURE_LABELS: Record<string, string> = {
  'graphing-calculator': '📈 Graphing calculator',
};

export default function BuildingPanel({ building, onClose }: { building: BuildingSummary; onClose: () => void }) {
  return (
    <aside className="building-panel" aria-label={`${building.name} details`}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
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
    </aside>
  );
}
