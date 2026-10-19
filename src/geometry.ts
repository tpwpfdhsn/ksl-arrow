import type { Arrow, Point } from "./model";
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const clamp = (v: number, a: number, b: number) =>
  Math.min(b, Math.max(a, v));
export function length(points: Point[]) {
  return points.slice(1).reduce((s, p, i) => s + dist(points[i], p), 0);
}
export function bounds(points: Point[]) {
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function atDistance(
  points: Point[],
  d: number,
): { point: Point; tangent: Point } {
  if (points.length < 2)
    return { point: points[0] || { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
  let remaining = clamp(d, 0, length(points));
  for (let i = 1; i < points.length; i++) {
    const size = dist(points[i - 1], points[i]);
    if (remaining <= size || i === points.length - 1) {
      return {
        point: lerp(
          points[i - 1],
          points[i],
          size ? clamp(remaining / size, 0, 1) : 0,
        ),
        tangent: size
          ? {
              x: (points[i].x - points[i - 1].x) / size,
              y: (points[i].y - points[i - 1].y) / size,
            }
          : { x: 1, y: 0 },
      };
    }
    remaining -= size;
  }
  return { point: points[0], tangent: { x: 1, y: 0 } };
}
export const at = (points: Point[], t: number) =>
  atDistance(points, length(points) * clamp(t, 0, 1));
export function resample(points: Point[], count = 120): Point[] {
  const total = length(points);
  return Array.from(
    { length: count },
    (_, i) => atDistance(points, (total * i) / (count - 1)).point,
  );
}
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const a = points[0],
    b = points[points.length - 1];
  let max = 0,
    index = 0;
  points.slice(1, -1).forEach((p, i) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = clamp(
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      0,
      1,
    );
    const d = dist(p, lerp(a, b, t));
    if (d > max) {
      max = d;
      index = i + 1;
    }
  });
  return max > epsilon
    ? [
        ...simplify(points.slice(0, index + 1), epsilon).slice(0, -1),
        ...simplify(points.slice(index), epsilon),
      ]
    : [{ ...a }, { ...b }];
}
export function spline(points: Point[], smoothing = 0.5, steps = 14): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const result: Point[] = [];
  const tension = 0.15 + smoothing * 0.65;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = {
      x: p1.x + ((p2.x - p0.x) * tension) / 3,
      y: p1.y + ((p2.y - p0.y) * tension) / 3,
    };
    const c2 = {
      x: p2.x - ((p3.x - p1.x) * tension) / 3,
      y: p2.y - ((p3.y - p1.y) * tension) / 3,
    };
    for (let j = 0; j < steps; j++) {
      const t = j / steps,
        u = 1 - t;
      result.push({
        x:
          u * u * u * p1.x +
          3 * u * u * t * c1.x +
          3 * u * t * t * c2.x +
          t * t * t * p2.x,
        y:
          u * u * u * p1.y +
          3 * u * u * t * c1.y +
          3 * u * t * t * c2.y +
          t * t * t * p2.y,
      });
    }
  }
  result.push({ ...points[points.length - 1] });
  return result;
}
export function wavePoints(
  start: Point,
  end: Point,
  count: number,
  amplitude: number,
  sign = 1,
): Point[] {
  const d = dist(start, end) || 1,
    nx = -(end.y - start.y) / d,
    ny = (end.x - start.x) / d;
  const steps = Math.max(80, Math.ceil(count * 36));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps,
      p = lerp(start, end, t),
      offset = Math.sin(t * Math.PI * 2 * count) * amplitude * sign;
    return { x: p.x + nx * offset, y: p.y + ny * offset };
  });
}
export function arrowPoints(a: Arrow): Point[] {
  if (a.kind === "wave")
    return wavePoints(
      a.points[0],
      a.points[a.points.length - 1],
      a.waveCount,
      a.waveAmplitude,
      a.waveSign,
    );
  if (a.kind === "corner" || a.kind === "straight" || a.kind === "free")
    return a.points;
  return spline(a.points, a.smoothing, a.points.length > 30 ? 3 : 18);
}
export function slicePath(
  points: Point[],
  start: number,
  end: number,
): Point[] {
  const total = length(points),
    lo = clamp(start, 0, total),
    hi = clamp(end, lo, total);
  const result = [atDistance(points, lo).point];
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += dist(points[i - 1], points[i]);
    if (d > lo && d < hi) result.push(points[i]);
  }
  result.push(atDistance(points, hi).point);
  return result;
}
const n = (v: number) => Number(v.toFixed(3));
export function pathD(points: Point[], close = false) {
  return points.length
    ? `M ${n(points[0].x)} ${n(points[0].y)} ` +
        points
          .slice(1)
          .map((p) => `L ${n(p.x)} ${n(p.y)}`)
          .join(" ") +
        (close ? " Z" : "")
    : "";
}
export function renderGeometry(a: Arrow) {
  const points = arrowPoints(a),
    total = length(points),
    width = Math.min(a.style.width, total * 0.14);
  const headLength = Math.min(width * a.style.headScale, total * 0.34);
  const heads = a.heads.map((head) => {
    const { point: tip, tangent } = at(points, head.at),
      u = { x: tangent.x * head.direction, y: tangent.y * head.direction };
    const factor =
      a.perspective === "toward"
        ? 0.4 + 1.6 * head.at
        : a.perspective === "away"
          ? 2 - 1.6 * head.at
          : 1;
    const hlen = Math.min(headLength * factor, total * 0.4),
      half = Math.max(
        width * factor * 0.75,
        hlen * Math.tan((a.style.headAngle * Math.PI) / 180),
      );
    const base = { x: tip.x - u.x * hlen, y: tip.y - u.y * hlen };
    return {
      ...head,
      tip,
      tangent: u,
      length: hlen,
      d: pathD(
        [
          tip,
          { x: base.x - u.y * half, y: base.y + u.x * half },
          { x: base.x + u.y * half, y: base.y - u.x * half },
        ],
        true,
      ),
    };
  });
  let start = 0,
    end = total;
  for (const h of heads) {
    if (h.at < 0.001 && h.direction === -1)
      start = Math.max(start, h.length * 0.73);
    if (h.at > 0.999 && h.direction === 1)
      end = Math.min(end, total - h.length * 0.73);
  }
  if (
    a.kind === "loop" &&
    dist(points[0], points[points.length - 1]) < headLength * 1.2 &&
    heads.some((h) => h.at > 0.999)
  )
    start = Math.max(start, headLength * 1.5);
  const shaftPoints = slicePath(points, start, end);
  let ribbon = "";
  if (a.perspective !== "none") {
    const samples = resample(shaftPoints, 160),
      left: Point[] = [],
      right: Point[] = [];
    samples.forEach((p, i) => {
      const prev = samples[Math.max(0, i - 1)],
        next = samples[Math.min(samples.length - 1, i + 1)],
        d = dist(prev, next) || 1;
      const t = i / (samples.length - 1),
        factor = a.perspective === "toward" ? 0.4 + 1.6 * t : 2 - 1.6 * t,
        w = (width * factor) / 2;
      left.push({
        x: p.x - ((next.y - prev.y) / d) * w,
        y: p.y + ((next.x - prev.x) / d) * w,
      });
      right.push({
        x: p.x + ((next.y - prev.y) / d) * w,
        y: p.y - ((next.x - prev.x) / d) * w,
      });
    });
    ribbon = pathD([...left, ...right.reverse()], true);
  }
  return { points, total, width, heads, shaft: pathD(shaftPoints), ribbon };
}
export function repeatOffsets(a: Arrow): Point[] {
  const p = arrowPoints(a),
    b = bounds(p),
    start = p[0],
    end = p[p.length - 1];
  const d = dist(start, end),
    u =
      d > Math.max(b.width, b.height) * 0.3
        ? { x: (end.x - start.x) / d, y: (end.y - start.y) / d }
        : { x: 1, y: 0 };
  const extent =
    Math.abs(u.x) * b.width + Math.abs(u.y) * b.height + a.repeatGap;
  return Array.from({ length: a.repeatCount }, (_, i) => ({
    x: u.x * extent * i,
    y: u.y * extent * i,
  }));
}
export function arrowBounds(a: Arrow) {
  return bounds(
    repeatOffsets(a).flatMap((o) =>
      arrowPoints(a).map((p) => ({ x: p.x + o.x, y: p.y + o.y })),
    ),
  );
}
export function moveArrow(a: Arrow, dx: number, dy: number): Arrow {
  return {
    ...a,
    points: a.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  };
}
export function transformArrow(
  a: Arrow,
  scale: number,
  degrees: number,
): Arrow {
  const b = bounds(a.points),
    cx = b.x + b.width / 2,
    cy = b.y + b.height / 2,
    r = (degrees * Math.PI) / 180;
  return {
    ...a,
    waveAmplitude: a.waveAmplitude * scale,
    repeatGap: a.repeatGap * scale,
    points: a.points.map((p) => {
      const x = (p.x - cx) * scale,
        y = (p.y - cy) * scale;
      return {
        ...p,
        x: cx + x * Math.cos(r) - y * Math.sin(r),
        y: cy + x * Math.sin(r) + y * Math.cos(r),
      };
    }),
  };
}
export function reverseArrow(a: Arrow): Arrow {
  return {
    ...a,
    points: [...a.points].reverse(),
    waveSign: a.waveSign * (Math.round(a.waveCount * 2) % 2 === 0 ? 1 : -1),
  };
}
