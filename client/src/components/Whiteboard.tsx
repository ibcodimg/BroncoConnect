import { BOARD_HEIGHT, BOARD_WIDTH, type Point, type Stroke, type Tool } from '@shared/types';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useBoardClipboard } from './BoardClipboard';

interface Props {
  title: string;
  strokes: Stroke[];
  myId: string;
  onAdd: (strokes: Stroke[]) => void;
  onUndo: () => void;
  onClearMine: () => void;
  /** Collaborative boards let you hide other people's drawings. */
  allowMute?: boolean;
}

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: 'pen', label: '✏️ Pen' },
  { tool: 'line', label: '／ Line' },
  { tool: 'rect', label: '▭ Rect' },
  { tool: 'ellipse', label: '◯ Ellipse' },
  { tool: 'eraser', label: '🧽 Eraser' },
];

const newId = () => crypto.randomUUID();

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.width;
  ctx.strokeStyle = s.color;
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.beginPath();
  const a = pts[0];
  const b = pts[pts.length - 1];
  switch (s.tool) {
    case 'pen':
    case 'eraser':
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
  }
  ctx.stroke();
  ctx.restore();
}

export default function Whiteboard({ title, strokes, myId, onAdd, onUndo, onClearMine, allowMute }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#1E4D2B');
  const [width, setWidth] = useState(4);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const clipboard = useBoardClipboard();

  const visible = useMemo(() => strokes.filter((s) => !muted.has(s.authorId)), [strokes, muted]);

  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strokes) if (s.authorId !== myId) m.set(s.authorId, s.authorName ?? 'Someone');
    return [...m.entries()];
  }, [strokes, myId]);

  const redraw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    for (const s of visible) drawStroke(ctx, s);
    if (draft.current) drawStroke(ctx, draft.current);
  };

  useEffect(() => {
    redraw();
  }, [visible]);

  const toBoard = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) * BOARD_WIDTH) / rect.width),
      y: Math.round(((e.clientY - rect.top) * BOARD_HEIGHT) / rect.height),
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toBoard(e);
    draft.current = {
      id: newId(),
      authorId: myId,
      tool,
      color,
      width: tool === 'eraser' ? width * 4 : width,
      points: tool === 'pen' || tool === 'eraser' ? [p] : [p, p],
    };
    redraw();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = draft.current;
    if (!d) return;
    const p = toBoard(e);
    if (d.tool === 'pen' || d.tool === 'eraser') {
      const last = d.points[d.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      d.points.push(p);
    } else {
      d.points[1] = p;
    }
    redraw();
  };

  const onPointerUp = () => {
    const d = draft.current;
    draft.current = null;
    if (d) onAdd([d]);
  };

  const paste = () => {
    if (clipboard.strokes.length === 0) return;
    onAdd(
      clipboard.strokes.map((s) => ({
        ...s,
        id: newId(),
        authorId: myId,
        authorName: undefined,
        points: s.points.map((p) => ({ x: p.x + 24, y: p.y + 24 })),
      })),
    );
  };

  const toggleMute = (id: string) =>
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="whiteboard">
      <header>
        <h3>{title}</h3>
        <div className="toolbar" role="toolbar" aria-label={`${title} tools`}>
          {TOOLS.map((t) => (
            <button key={t.tool} className={tool === t.tool ? 'active' : ''} onClick={() => setTool(t.tool)}>
              {t.label}
            </button>
          ))}
          <label title="Color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label title="Thickness">
            <input type="range" min={1} max={20} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
          <span className="divider" />
          <button onClick={() => clipboard.copy(visible)} title="Copy everything visible on this board">
            Copy all
          </button>
          <button onClick={() => clipboard.copy(strokes.filter((s) => s.authorId === myId))}>Copy mine</button>
          <button onClick={paste} disabled={clipboard.strokes.length === 0}>
            Paste{clipboard.strokes.length ? ` (${clipboard.strokes.length})` : ''}
          </button>
          <button onClick={onUndo}>Undo</button>
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
      {allowMute && authors.length > 0 && (
        <details className="mute-list">
          <summary>Mute people's drawings ({muted.size} muted)</summary>
          {authors.map(([id, name]) => (
            <label key={id}>
              <input type="checkbox" checked={muted.has(id)} onChange={() => toggleMute(id)} /> Hide {name}
            </label>
          ))}
        </details>
      )}
    </section>
  );
}
