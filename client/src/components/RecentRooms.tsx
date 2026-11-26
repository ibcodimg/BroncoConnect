import { findRoom, roomTag } from '@shared/buildings';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRecentRooms } from '../lib/recentRooms';

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** "Recent ▾" menu in the top bar: chatrooms you've visited lately. */
export default function RecentRooms() {
  const recent = useRecentRooms();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="recent-rooms" ref={ref}>
      <button className="recent-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        🕘 Recent ▾
      </button>
      {open && (
        <ul className="recent-menu" role="menu">
          {recent.length === 0 && <li className="hint">No chatrooms visited yet.</li>}
          {recent.map((r) => {
            const room = findRoom(r.roomId);
            if (!room) return null;
            return (
              <li key={r.roomId} role="none">
                <Link role="menuitem" to={`/room/${room.id}`} className={pathname === `/room/${room.id}` ? 'current' : ''}>
                  <span className="num">{roomTag(room)}</span>
                  <span className="name">{room.name}</span>
                  <span className="when">{ago(r.visitedAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
