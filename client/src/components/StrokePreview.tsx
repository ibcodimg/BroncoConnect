import { strokeBounds, unionBounds } from '@shared/geometry';
import type { Stroke } from '@shared/types';
import { useEffect, useRef } from 'react';

/** Small read-only rendering of some strokes, zoomed to fit. */
export default function StrokePreview({ strokes, width = 320, height = 200 }: { strokes: Stroke[]; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    const box = unionBounds(strokes.map(strokeBounds));
    if (!ctx || !box) return;
    ctx.clearRect(0, 0, width, height);
    const pad = 10;
    const k = Math.min((width - 2 * pad) / Math.max(box.w, 1), (height - 2 * pad) / Math.max(box.h, 1), 1);
    ctx.save();
    ctx.translate(pad + ((width - 2 * pad) - box.w * k) / 2, pad + ((height - 2 * pad) - box.h * k) / 2);
    ctx.scale(k, k);
    ctx.translate(-box.x, -box.y);
    for (const s of strokes) {
      const [a, b] = [s.points[0], s.points[s.points.length - 1]];
      if (!a) continue;
      ctx.beginPath();
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color;
      if (s.tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else if (s.tool === 'ellipse')
        ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else {
        ctx.moveTo(a.x, a.y);
        for (const p of s.tool === 'line' ? [b] : s.points) ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [strokes, width, height]);
  return <canvas ref={ref} width={width} height={height} className="stroke-preview" />;
}
