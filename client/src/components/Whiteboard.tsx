import { rectFrom, rectsIntersect, strokeBounds, strokeHit, translateTo, unionBounds, type Rect } from '@shared/geometry';
import { BOARD_HEIGHT, BOARD_WIDTH, type Point, type Stroke, type Tool } from '@shared/types';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useBoardClipboard } from './BoardClipboard';

type Mode = 'select' | Tool | 'eraser';

interface Props {
  title: string;
  strokes: Stroke[];
  myId: string;
  /** Collaborative board: enables unerasable ink, permission checks, and the contributors list. */
  collaborative?: boolean;
  isAdmin?: boolean;
  onAdd: (strokes: Stroke[]) => void;
  onErase: (strokeIds: string[]) => void;
  onUndo: () => void;
  onClearMine: () => void;
  /** Muted strokes are hidden and can't be selected or erased. */
  isHidden?: (s: Stroke) => boolean;
  onToggleHideAuthor?: (authorId: string, authorName: string) => void;
  onAuthorClick?: (authorId: string) => void;
}

const MODES: { mode: Mode; label: string; title: string }[] = [
  { mode: 'select', label: '⬚ Select', title: 'Click or drag a box to select. Ctrl+C / Ctrl+V to copy and paste, Delete to erase.' },
  { mode: 'pen', label: '✏️ Pen', title: 'Pen' },
  { mode: 'line', label: '／ Line', title: 'Line' },
  { mode: 'rect', label: '▭ Rect', title: 'Rectangle' },
  { mode: 'ellipse', label: '◯ Ellipse', title: 'Ellipse' },
  { mode: 'eraser', label: '🧽 Eraser', title: 'Erase whole strokes you drag over' },
];

const newId = () => crypto.randomUUID();

/** Which board keyboard shortcuts go to: the one you last pointed at. */
let activeBoard: symbol | null = null;

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.width;
  ctx.strokeStyle = s.color;
  ctx.beginPath();
  const a = pts[0];
  const b = pts[pts.length - 1];
  switch (s.tool) {
    case 'pen':
      ctx.moveTo(a.x, a.y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      if (pts.length === 1) ctx.lineTo(a.x + 0.1, a.y);
      break;
    case 'line':
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      break;
    case 'rect':
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      break;
    case 'ellipse':
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      break;
    default:
      // Old pixel-eraser strokes from earlier versions: ignore.
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function dashedRect(ctx: CanvasRenderingContext2D, r: Rect, color: string) {
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  ctx.restore();
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function Whiteboard(props: Props) {
  const { title, strokes, myId, collaborative, isAdmin, onAdd, onErase, onUndo, onClearMine, isHidden } = props;
  const boardKey = useRef(Symbol(title)).current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Stroke | null>(null);
  const marqueeStart = useRef<Point | null>(null);
  const lastPointer = useRef<Point | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('pen');
  const [color, setColor] = useState('#1E4D2B');
  const [width, setWidth] = useState(4);
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const clipboard = useBoardClipboard();

  const visible = useMemo(() => strokes.filter((s) => !isHidden?.(s)), [strokes, isHidden]);
  const canErase = (s: Stroke) => !collaborative || s.authorId === myId || !s.locked || !!isAdmin;

  // Drop selections of strokes that disappeared (erased, muted, undone).
  useEffect(() => {
    const ids = new Set(visible.map((s) => s.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  const selectedStrokes = visible.filter((s) => selected.has(s.id));

  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strokes) if (s.authorId !== myId) m.set(s.authorId, s.authorName ?? 'Someone');
    return [...m.entries()];
  }, [strokes, myId]);

  const redraw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    for (const s of visible) if (!erasing.has(s.id)) drawStroke(ctx, s);
    if (draft.current) drawStroke(ctx, draft.current);
    for (const s of selectedStrokes) dashedRect(ctx, strokeBounds(s), '#2471a3');
    if (marquee) dashedRect(ctx, marquee, '#888');
  };
  useEffect(() => {
    redraw();
  });

  const toBoard = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) * BOARD_WIDTH) / rect.width),
      y: Math.round(((e.clientY - rect.top) * BOARD_HEIGHT) / rect.height),
    };
  };

  // ---- actions (buttons + keyboard) ----
  const copy = () => {
    if (selectedStrokes.length) clipboard.copy(selectedStrokes);
  };
  const paste = () => {
    if (clipboard.strokes.length === 0) return;
    const fresh = clipboard.strokes.map((s) => ({
      ...s,
      id: newId(),
      authorId: myId,
      authorName: undefined,
      locked: collaborative && locked ? true : undefined,
    }));
    const at = lastPointer.current ?? { x: 40, y: 40 };
    const placed = translateTo(fresh, at);
    onAdd(placed);
    setSelected(new Set(placed.map((s) => s.id)));
    setMode('select');
  };
  const deleteSelected = () => {
    const ids = selectedStrokes.filter(canErase).map((s) => s.id);
    if (ids.length) onErase(ids);
    setSelected(new Set());
  };
  const selectAll = () => {
    setSelected(new Set(visible.map((s) => s.id)));
    setMode('select');
  };

  const actions = useRef({ copy, paste, deleteSelected, selectAll, onUndo, clear: () => setSelected(new Set()) });
  actions.current = { copy, paste, deleteSelected, selectAll, onUndo, clear: () => setSelected(new Set()) };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeBoard !== boardKey || isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const a = actions.current;
      if (mod && key === 'c') a.copy();
      else if (mod && key === 'v') a.paste();
      else if (mod && key === 'a') a.selectAll();
      else if (mod && key === 'z') a.onUndo();
      else if (key === 'delete' || key === 'backspace') a.deleteSelected();
      else if (key === 'escape') a.clear();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardKey]);

  // ---- pointer handling ----
  const topmostAt = (p: Point) => [...visible].reverse().find((s) => strokeHit(s, p, 6));

  const collectErase = (p: Point) => {
    const radius = 6 + width * 2;
    const hits = visible.filter((s) => !erasing.has(s.id) && canErase(s) && strokeHit(s, p, radius));
    if (hits.length) setErasing((prev) => new Set([...prev, ...hits.map((s) => s.id)]));
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    activeBoard = boardKey;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toBoard(e);
    lastPointer.current = p;

    if (mode === 'select') {
      const hit = topmostAt(p);
      if (hit) {
        setSelected((prev) => {
          if (e.shiftKey) {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          }
          return prev.has(hit.id) ? prev : new Set([hit.id]);
        });
      } else {
        if (!e.shiftKey) setSelected(new Set());
        marqueeStart.current = p;
        setMarquee(rectFrom(p, p));
      }
      return;
    }
    if (mode === 'eraser') {
      setErasing(new Set());
      collectErase(p);
      return;
    }
    setSelected(new Set());
    draft.current = {
      id: newId(),
      authorId: myId,
      tool: mode,
      color,
      width,
      points: mode === 'pen' ? [p] : [p, p],
      ...(collaborative && locked ? { locked: true } : {}),
    };
    redraw();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = toBoard(e);
    lastPointer.current = p;
    if (e.buttons === 0) return;
    if (mode === 'select' && marqueeStart.current) {
      setMarquee(rectFrom(marqueeStart.current, p));
      return;
    }
    if (mode === 'eraser') {
      collectErase(p);
      return;
    }
    const d = draft.current;
    if (!d) return;
    if (d.tool === 'pen') {
      const last = d.points[d.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      d.points.push(p);
    } else {
      d.points[1] = p;
    }
    redraw();
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'select' && marqueeStart.current && marquee) {
      const box = marquee;
      const hits = visible.filter((s) => rectsIntersect(strokeBounds(s), box)).map((s) => s.id);
      setSelected((prev) => new Set([...(e.shiftKey ? prev : []), ...hits]));
      marqueeStart.current = null;
      setMarquee(null);
      return;
    }
    if (mode === 'eraser') {
      if (erasing.size) onErase([...erasing]);
      setErasing(new Set());
      return;
    }
    const d = draft.current;
    draft.current = null;
    if (d) onAdd([d]);
  };

  const groupBox = unionBounds(selectedStrokes.map(strokeBounds));

  return (
    <section className={`whiteboard mode-${mode}`} onPointerEnter={() => (activeBoard = boardKey)}>
      <header>
        <h3>{title}</h3>
        <div className="toolbar" role="toolbar" aria-label={`${title} tools`}>
          {MODES.map((t) => (
            <button key={t.mode} title={t.title} className={mode === t.mode ? 'active' : ''} onClick={() => setMode(t.mode)}>
              {t.label}
            </button>
          ))}
          <label title="Color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label title="Thickness">
            <input type="range" min={1} max={20} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
          {collaborative && (
            <label className={`lock-toggle ${locked ? 'on' : ''}`} title="Other people can't erase unerasable ink. They can only hide it by muting you.">
              <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> 🔒 Unerasable ink
            </label>
          )}
          <span className="divider" />
          <button onClick={copy} disabled={selectedStrokes.length === 0} title="Ctrl+C">
            Copy{selectedStrokes.length ? ` (${selectedStrokes.length})` : ''}
          </button>
          <button onClick={paste} disabled={clipboard.strokes.length === 0} title="Ctrl+V: pastes where your cursor is">
            Paste
          </button>
          <button onClick={deleteSelected} disabled={!selectedStrokes.some(canErase)} title="Delete">
            Delete
          </button>
          <button onClick={onUndo} title="Ctrl+Z">
            Undo
          </button>
          <button onClick={onClearMine}>Clear mine</button>
        </div>
      </header>
      <canvas
        ref={canvasRef}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <p className="board-hint">
        {mode === 'select'
          ? groupBox
            ? `${selectedStrokes.length} selected · Ctrl+C copy · Ctrl+V paste at cursor · Delete erase · Esc deselect`
            : 'Click a drawing or drag a box to select. Shift adds to the selection. Ctrl+A selects all.'
          : collaborative && locked
            ? '🔒 New ink is unerasable by others.'
            : ''}
      </p>
      {collaborative && authors.length > 0 && (
        <details className="mute-list">
          <summary>People drawing here ({authors.length})</summary>
          {authors.map(([id, name]) => {
            const hidden = strokes.some((s) => s.authorId === id && isHidden?.(s));
            return (
              <div key={id} className="row">
                <button className="link" onClick={() => props.onAuthorClick?.(id)}>
                  {name}
                </button>
                <label>
                  <input type="checkbox" checked={hidden} onChange={() => props.onToggleHideAuthor?.(id, name)} /> Hide
                  their drawings here
                </label>
              </div>
            );
          })}
        </details>
      )}
    </section>
  );
}
