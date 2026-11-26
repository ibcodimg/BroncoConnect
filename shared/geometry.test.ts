import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rectFrom, rectsIntersect, strokeBounds, strokeHit, translateTo } from './geometry';
import type { Stroke } from './types';

const s = (tool: Stroke['tool'], points: [number, number][], width = 4): Stroke => ({
  id: tool,
  authorId: 'a',
  tool,
  color: '#000',
  width,
  points: points.map(([x, y]) => ({ x, y })),
});

test('pen stroke is hit near its path, not far away', () => {
  const pen = s('pen', [
    [0, 0],
    [100, 0],
  ]);
  assert.equal(strokeHit(pen, { x: 50, y: 5 }, 5), true);
  assert.equal(strokeHit(pen, { x: 50, y: 40 }, 5), false);
});

test('rectangle is hit on its outline, not in its empty middle', () => {
  const rect = s('rect', [
    [0, 0],
    [200, 100],
  ]);
  assert.equal(strokeHit(rect, { x: 200, y: 50 }, 3), true);
  assert.equal(strokeHit(rect, { x: 100, y: 50 }, 3), false);
});

test('ellipse outline hit test', () => {
  const e = s('ellipse', [
    [0, 0],
    [200, 100],
  ]);
  assert.equal(strokeHit(e, { x: 100, y: 0 }, 3), true);
  assert.equal(strokeHit(e, { x: 100, y: 50 }, 3), false);
});

test('marquee selection uses bounds intersection', () => {
  const line = s('line', [
    [10, 10],
    [50, 50],
  ]);
  assert.equal(rectsIntersect(strokeBounds(line), rectFrom({ x: 40, y: 40 }, { x: 0, y: 100 })), true);
  assert.equal(rectsIntersect(strokeBounds(line), rectFrom({ x: 300, y: 300 }, { x: 400, y: 400 })), false);
});

test('translateTo moves the group so its top-left is at the target', () => {
  const [moved] = translateTo(
    [
      s(
        'line',
        [
          [10, 20],
          [30, 40],
        ],
        0,
      ),
    ],
    { x: 100, y: 200 },
  );
  assert.deepEqual(moved.points, [
    { x: 100, y: 200 },
    { x: 120, y: 220 },
  ]);
});

import { moveStrokes, rotateStrokes, scaleStrokes } from './geometry';

test('moveStrokes shifts every point', () => {
  const [m] = moveStrokes([s('line', [[0, 0], [10, 10]])], 5, -5);
  assert.deepEqual(m.points, [{ x: 5, y: -5 }, { x: 15, y: 5 }]);
});

test('scaleStrokes scales away from the anchor', () => {
  const [m] = scaleStrokes([s('rect', [[0, 0], [100, 50]])], { x: 0, y: 0 }, 2, 3);
  assert.deepEqual(m.points, [{ x: 0, y: 0 }, { x: 200, y: 150 }]);
  assert.equal(m.tool, 'rect');
});

test('rotateStrokes rotates around the center and turns rects into paths', () => {
  const [line] = rotateStrokes([s('line', [[0, 0], [10, 0]])], { x: 0, y: 0 }, Math.PI / 2);
  assert.deepEqual(line.points[1], { x: 0, y: 10 });
  const [rect] = rotateStrokes([s('rect', [[0, 0], [10, 10]])], { x: 5, y: 5 }, Math.PI);
  assert.equal(rect.tool, 'pen');
  assert.equal(rect.points.length, 5);
  assert.deepEqual(rect.points[0], { x: 10, y: 10 });
});
