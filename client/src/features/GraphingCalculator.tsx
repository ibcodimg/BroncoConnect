import { compile } from 'mathjs';
import { useEffect, useMemo, useRef, useState } from 'react';

const W = 600;
const H = 400;
const COLORS = ['#1E4D2B', '#c0392b', '#2471a3', '#b9770e'];

/** Simple y = f(x) grapher for the College of Science (Math & Stats) chatroom. */
export default function GraphingCalculator() {
  const [exprs, setExprs] = useState(['sin(x)', 'x^2 / 10']);
  const [range, setRange] = useState(10);
  const canvas = useRef<HTMLCanvasElement>(null);

  const compiled = useMemo(
    () =>
      exprs.map((e) => {
        try {
          return e.trim() ? { fn: compile(e), error: null } : { fn: null, error: null };
        } catch (err) {
          return { fn: null, error: (err as Error).message };
        }
      }),
    [exprs],
  );

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const toPx = (x: number, y: number) => [((x + range) / (2 * range)) * W, H / 2 - (y / range) * (H / 2) * (W / H)];
    ctx.clearRect(0, 0, W, H);

    // Grid + axes
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    for (let i = -range; i <= range; i++) {
      const [gx] = toPx(i, 0);
      const [, gy] = toPx(0, i);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = '#555';
    const [ox, oy] = toPx(0, 0);
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, H);
    ctx.moveTo(0, oy);
    ctx.lineTo(W, oy);
    ctx.stroke();

    compiled.forEach(({ fn }, i) => {
      if (!fn) return;
      ctx.strokeStyle = COLORS[i % COLORS.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      let drawing = false;
      for (let px = 0; px <= W; px++) {
        const x = (px / W) * 2 * range - range;
        let y: number;
        try {
          y = Number(fn.evaluate({ x }));
        } catch {
          y = NaN;
        }
        if (!Number.isFinite(y)) {
          drawing = false;
          continue;
        }
        const [, py] = toPx(x, y);
        if (drawing) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        drawing = true;
      }
      ctx.stroke();
    });
  }, [compiled, range]);

  return (
    <section className="feature grapher">
      <h3>📈 Graphing calculator</h3>
      {exprs.map((e, i) => (
        <div key={i} className="expr-row">
          <span style={{ color: COLORS[i % COLORS.length] }}>y =</span>
          <input
            value={e}
            onChange={(ev) => setExprs((prev) => prev.map((p, j) => (j === i ? ev.target.value : p)))}
            aria-label={`Function ${i + 1}`}
          />
          {compiled[i]?.error && <small className="error">{compiled[i].error}</small>}
        </div>
      ))}
      <div className="row">
        {exprs.length < COLORS.length && <button onClick={() => setExprs([...exprs, ''])}>+ Add function</button>}
        <label>
          Zoom ±{range}
          <input type="range" min={2} max={50} value={range} onChange={(e) => setRange(Number(e.target.value))} />
        </label>
      </div>
      <canvas ref={canvas} width={W} height={H} />
    </section>
  );
}
