import {
  handlePositions,
  moveStrokes,
  OPPOSITE,
  rectFrom,
  rectsIntersect,
  rotateStrokes,
  scaleStrokes,
  strokeBounds,
  strokeHit,
  translateTo,
  unionBounds,
  type Handle,
  type Rect,
} from '@shared/geometry';
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
  /** Strokes that were moved / resized / rotated (same ids, new points). */
  onUpdate: (strokes: Stroke[]) => void;
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

/** Selection box with 4 resize corners and a rotate knob. `k` = board units per screen pixel. */
function drawHandles(ctx: CanvasRenderingContext2D, box: Rect, k: number) {
  const hp = handlePositions(box, 26 * k);
  ctx.save();
  ctx.strokeStyle = '#2471a3';
  ctx.lineWidth = 1.5 * k;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.beginPath();
  ctx.moveTo(box.x + box.w / 2, box.y);
  ctx.lineTo(hp.rotate.x, hp.rotate.y);
  ctx.stroke();
  ctx.fillStyle = 'white';
  const size = 9 * k;
  for (const h of ['nw', 'ne', 'sw', 'se'] as const) {
    ctx.fillRect(hp[h].x - size / 2, hp[h].y - size / 2, size, size);
    ctx.strokeRect(hp[h].x - size / 2, hp[h].y - size / 2, size, size);
  }
  ctx.beginPath();
  ctx.arc(hp.rotate.x, hp.rotate.y, 6 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function Whiteboard(props: Props) {
  const { title, strokes, myId, collaborative, isAdmin, onAdd, onErase, onUpdate, onUndo, onClearMine, isHidden } = props;
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
  // Move / resize / rotate in progress: the transformed copies are drawn instead of the originals.
  const transform = useRef<{ kind: 'move' | 'scale' | 'rotate'; handle?: Handle; start: Point; box: Rect; originals: Stroke[] } | null>(null);
  const [preview, setPreview] = useState<Stroke[] | null>(null);
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
  const canTransform = selectedStrokes.length > 0 && selectedStrokes.every(canErase);

  /** Board units per CSS pixel (the canvas is drawn at 1600×1000 but shown smaller). */
  const unitsPerPx = () => {
    const w = canvasRef.current?.getBoundingClientRect().width;
    return w ? BOARD_WIDTH / w : 2;
  };

  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strokes) if (s.authorId !== myId) m.set(s.authorId, s.authorName ?? 'Someone');
    return [...m.entries()];
  }, [strokes, myId]);

  const redraw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    const previewById = new Map((preview ?? []).map((s) => [s.id, s]));
    for (const s of visible) if (!erasing.has(s.id)) drawStroke(ctx, previewById.get(s.id) ?? s);
    if (draft.current) drawStroke(ctx, draft.current);
    const shown = selectedStrokes.map((s) => previewById.get(s.id) ?? s);
    for (const s of shown) dashedRect(ctx, strokeBounds(s), '#2471a388');
    const box = unionBounds(shown.map(strokeBounds));
    if (box && mode === 'select' && canTransform) drawHandles(ctx, box, unitsPerPx());
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

  const nudge = (dx: number, dy: number) => {
    if (canTransform) onUpdate(moveStrokes(selectedStrokes, dx, dy));
  };

  const actions = useRef({ copy, paste, deleteSelected, selectAll, onUndo, nudge, clear: () => setSelected(new Set()) });
  actions.current = { copy, paste, deleteSelected, selectAll, onUndo, nudge, clear: () => setSelected(new Set()) };

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
      else if (key.startsWith('arrow')) {
        const step = e.shiftKey ? 25 : 5;
        a.nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardKey]);

  // ---- move / resize / rotate ----
  const ROTATE_OFFSET_PX = 26;
  const HANDLE_HIT_PX = 12;

  /** What dragging from point p would do to the current selection, if anything. */
  const transformTargetAt = (p: Point): { kind: 'move' | 'scale' | 'rotate'; handle?: Handle; box: Rect } | null => {
    if (!canTransform) return null;
    const box = unionBounds(selectedStrokes.map(strokeBounds));
    if (!box) return null;
    const k = unitsPerPx();
    const hp = handlePositions(box, ROTATE_OFFSET_PX * k);
    const near = (q: Point) => Math.hypot(p.x - q.x, p.y - q.y) <= HANDLE_HIT_PX * k;
    if (near(hp.rotate)) return { kind: 'rotate', handle: 'rotate', box };
    for (const h of ['nw', 'ne', 'sw', 'se'] as const) if (near(hp[h])) return { kind: 'scale', handle: h, box };
    const pad = 6 * k;
    if (p.x >= box.x - pad && p.x <= box.x + box.w + pad && p.y >= box.y - pad && p.y <= box.y + box.h + pad) return { kind: 'move', box };
    return null;
  };

  const applyTransform = (
    tr: { kind: 'move' | 'scale' | 'rotate'; handle?: Handle; start: Point; box: Rect; originals: Stroke[] },
    p: Point,
    shift: boolean,
  ): Stroke[] => {
    const { box, start, originals } = tr;
    if (tr.kind === 'move') return moveStrokes(originals, p.x - start.x, p.y - start.y);
    if (tr.kind === 'rotate') {
      const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      let angle = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x);
      if (shift) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12); // 15° steps
      return rotateStrokes(originals, c, angle);
    }
    const hp = handlePositions(box, 0);
    const handle = tr.handle as keyof typeof OPPOSITE;
    const anchor = hp[OPPOSITE[handle]];
    const corner = hp[handle];
    const safe = (v: number) => (Math.abs(v) < 0.05 ? (v < 0 ? -0.05 : 0.05) : v);
    let sx = box.w < 1 ? 1 : safe((p.x - anchor.x) / (corner.x - anchor.x));
    let sy = box.h < 1 ? 1 : safe((p.y - anchor.y) / (corner.y - anchor.y));
    if (shift) sx = sy = Math.abs(sx) > Math.abs(sy) ? sx : sy; // keep proportions
    return scaleStrokes(originals, anchor, sx, sy);
  };

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
      const t = transformTargetAt(p);
      if (t) {
        transform.current = { ...t, start: p, originals: selectedStrokes };
        return;
      }
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
    if (e.buttons === 0) {
      // Hover feedback for selection handles.
      if (mode === 'select') {
        const t = transformTargetAt(p);
        e.currentTarget.style.cursor = !t
          ? ''
          : t.kind === 'rotate'
            ? 'grab'
            : t.kind === 'move'
              ? 'move'
              : t.handle === 'nw' || t.handle === 'se'
                ? 'nwse-resize'
                : 'nesw-resize';
      }
      return;
    }
    const tr = transform.current;
    if (tr) {
      setPreview(applyTransform(tr, p, e.shiftKey));
      return;
    }
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
    if (transform.current) {
      const changed = preview;
      transform.current = null;
      setPreview(null);
      if (changed) onUpdate(changed);
      return;
    }
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
      <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      </div>
      <p className="board-hint">
        {mode === 'select'
          ? groupBox
            ? canTransform
              ? `${selectedStrokes.length} selected · drag to move · corners resize (Shift keeps shape) · ◯ rotates · Ctrl+C/V · Delete`
              : `${selectedStrokes.length} selected · some is someone's unerasable ink, so it can be copied but not moved`
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
