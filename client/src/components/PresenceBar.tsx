import type { RoomPresence } from '@shared/types';
import { useLayoutEffect, useRef, useState } from 'react';
import { UserName } from './UserCard';

const GAP = 6;
const MORE_WIDTH = 90; // room reserved for the "+N more" chip

/** Who's in the room: open by default, as many names as fit on one line, then "+N more". */
export default function PresenceBar({ presence, myId, roomId }: { presence: RoomPresence | null; myId: string; roomId: string }) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [fit, setFit] = useState(Infinity);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // You first, then everyone else.
  const users = [...(presence?.users ?? [])].sort((a, b) => (a.publicId === myId ? -1 : b.publicId === myId ? 1 : 0));
  const count = presence?.count ?? 1;
  const label = (u: { publicId: string; displayName: string }) => (u.publicId === myId ? `${u.displayName} (you)` : u.displayName);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const compute = () => {
      const widths = [...measure.children].map((c) => (c as HTMLElement).offsetWidth);
      const avail = row.clientWidth;
      let used = 0;
      let n = 0;
      for (let i = 0; i < widths.length; i++) {
        const reserve = i < widths.length - 1 ? MORE_WIDTH : 0;
        if (used + widths[i] + reserve > avail) break;
        used += widths[i] + GAP;
        n++;
      }
      setFit(n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(row);
    return () => ro.disconnect();
  }, [users.map((u) => u.publicId + u.displayName).join('|'), open]);

  const hiddenCount = Math.max(0, users.length - fit);

  return (
    <div className="presence-bar">
      <button className="presence-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Show or hide who's here">
        <span className="online-dot" /> {count} {count === 1 ? 'person' : 'people'} here {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="presence-row" ref={rowRef}>
          {users.slice(0, fit).map((u) => (
            <span key={u.publicId} className={`chip ${u.publicId === myId ? 'me' : ''}`}>
              <UserName publicId={u.publicId} name={label(u)} roomId={roomId} />
            </span>
          ))}
          {hiddenCount > 0 && (
            <button className="chip more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              +{hiddenCount} more…
            </button>
          )}
          {showAll && hiddenCount > 0 && (
            <ul className="presence-list">
              {users.slice(fit).map((u) => (
                <li key={u.publicId}>
                  <UserName publicId={u.publicId} name={label(u)} roomId={roomId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* Invisible copy used to measure how many chips fit. */}
      <div className="presence-measure" ref={measureRef} aria-hidden>
        {users.map((u) => (
          <span key={u.publicId} className="chip">
            <span className="username">{label(u)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
