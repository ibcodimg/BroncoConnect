import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';

export interface WinRect {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  hidden?: boolean;
}

export interface DeskWindow {
  id: string;
  title: ReactNode;
  /** Short name for the show/hide toggles. */
  label: string;
  children: ReactNode;
  minW?: number;
  minH?: number;
}

type Layout = Record<string, WinRect>;

interface Props {
  windows: DeskWindow[];
  /** Layouts are remembered per key in this browser. */
  storageKey: string;
  /** Default layout for a desk this wide, with this much screen height visible below its top. */
  defaults: (deskWidth: number, viewHeight: number) => Layout;
  /** Extra controls shown next to the window toggles. */
  toolbar?: ReactNode;
}

const NARROW = 800; // below this width windows just stack

function load(key: string): Layout | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * A "desktop" of windows: drag a window by its title bar, resize it from the bottom-right corner,
 * click it to bring it to the front, hide/show it from the toolbar.
 */
export default function Desk({ windows, storageKey, defaults, toolbar }: Props) {
  const deskRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const viewHeight = () => {
    const top = deskRef.current?.getBoundingClientRect().top ?? 150;
    return Math.max(520, window.innerHeight - Math.max(0, top) - 24);
  };
  const [layout, setLayout] = useState<Layout | null>(() => load(storageKey));
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; px: number; py: number; start: WinRect } | null>(null);

  useLayoutEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First visit (or after reset): lay windows out for this screen width. New windows get defaults too.
  useEffect(() => {
    if (!width) return;
    setLayout((prev) => {
      const d = withFallbacks(defaults(width, viewHeight()));
      if (!prev) return d;
      const missing = windows.filter((w) => !prev[w.id]);
      return missing.length ? { ...prev, ...Object.fromEntries(missing.map((w) => [w.id, d[w.id]])) } : prev;
    });
  }, [width, windows, defaults]);

  // Any window the defaults don't mention gets a cascaded spot.
  const withFallbacks = (d: Layout): Layout => {
    const out = { ...d };
    windows.forEach((w, i) => {
      if (!out[w.id]) out[w.id] = { x: 24 * i, y: 24 * i, w: Math.min(520, width), h: 420, z: 20 + i };
    });
    return out;
  };

  const save = useCallback(
    (l: Layout) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(l));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const update = (id: string, patch: Partial<WinRect>, persist = false) =>
    setLayout((prev) => {
      if (!prev?.[id]) return prev;
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      if (persist) save(next);
      return next;
    });

  const bringToFront = (id: string) => {
    if (!layout) return;
    const top = Math.max(...Object.values(layout).map((r) => r.z));
    if (layout[id]?.z !== top) update(id, { z: top + 1 }, true);
  };

  const startDrag = (e: RPointerEvent, id: string, mode: 'move' | 'resize') => {
    if (!layout?.[id] || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id, mode, px: e.clientX, py: e.clientY, start: layout[id] };
    bringToFront(id);
  };

  const onDrag = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    const win = windows.find((w) => w.id === d.id);
    if (d.mode === 'move') {
      update(d.id, {
        x: Math.max(0, Math.min(width - 80, d.start.x + dx)),
        y: Math.max(0, d.start.y + dy),
      });
    } else {
      update(d.id, {
        w: Math.max(win?.minW ?? 260, Math.min(width - d.start.x, d.start.w + dx)),
        h: Math.max(win?.minH ?? 200, d.start.h + dy),
      });
    }
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setLayout((prev) => {
      if (prev) save(prev);
      return prev;
    });
  };

  const narrow = width > 0 && width < NARROW;
  const visible = windows.filter((w) => !layout?.[w.id]?.hidden);
  const height = layout && !narrow ? Math.max(500, ...visible.map((w) => (layout[w.id] ? layout[w.id].y + layout[w.id].h : 0))) + 16 : undefined;

  return (
    <div className="desk-wrap">
      <div className="desk-toolbar">
        <span className="hint">Windows:</span>
        {windows.map((w) => {
          const hidden = !!layout?.[w.id]?.hidden;
          return (
            <button
              key={w.id}
              className={hidden ? '' : 'active'}
              aria-pressed={!hidden}
              onClick={() => {
                update(w.id, { hidden: !hidden }, true);
                if (hidden) bringToFront(w.id);
              }}
            >
              {w.label}
            </button>
          );
        })}
        <button
          className="link"
          onClick={() => {
            const d = withFallbacks(defaults(width, viewHeight()));
            setLayout(d);
            save(d);
          }}
        >
          Reset layout
        </button>
        {toolbar}
      </div>

      <div ref={deskRef} className={`desk ${narrow ? 'narrow' : ''}`} style={{ height }}>
        {layout &&
          visible.map((w) => {
            const r = layout[w.id];
            if (!r) return null;
            const style = narrow ? undefined : { left: r.x, top: r.y, width: r.w, height: r.h, zIndex: r.z };
            return (
              <section key={w.id} className="win" style={style} onPointerDownCapture={() => bringToFront(w.id)}>
                <header
                  className="win-title"
                  onPointerDown={(e) => !narrow && startDrag(e, w.id, 'move')}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <span className="grip" aria-hidden>
                    ⠿
                  </span>
                  <span className="win-name">{w.title}</span>
                  <button
                    className="win-close"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => update(w.id, { hidden: true }, true)}
                    aria-label={`Hide ${w.label}`}
                    title="Hide (bring back from the Windows toolbar)"
                  >
                    –
                  </button>
                </header>
                <div className="win-body">{w.children}</div>
                {!narrow && (
                  <div
                    className="win-resize"
                    title="Drag to resize"
                    onPointerDown={(e) => startDrag(e, w.id, 'resize')}
                    onPointerMove={onDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}
