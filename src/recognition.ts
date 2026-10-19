import { DEFAULT_STYLE, makeArrow, uid } from "./model";
import type { Arrow, ArrowStyle, Kind, Point, Stroke } from "./model";
import {
  at,
  bounds,
  clamp,
  dist,
  length,
  resample,
  simplify,
} from "./geometry";
export type Analysis = {
  kind: Kind;
  candidates: Kind[];
  note: string;
  waveCount: number;
  amplitude: number;
  sign: number;
};
function angle(a: Point, b: Point, c: Point) {
  const u = { x: a.x - b.x, y: a.y - b.y },
    v = { x: c.x - b.x, y: c.y - b.y };
  return Math.acos(
    clamp((u.x * v.x + u.y * v.y) / (dist(a, b) * dist(b, c) || 1), -1, 1),
  );
}
export function analyze(points: Point[], width = 9): Analysis {
  const ps = resample(points, 80),
    a = ps[0],
    b = ps[ps.length - 1],
    total = length(ps),
    chord = dist(a, b);
  const dx = (b.x - a.x) / (chord || 1),
    dy = (b.y - a.y) / (chord || 1);
  const ys = ps.map((p) => (p.y - a.y) * dx - (p.x - a.x) * dy);
  const smooth = ys.map(
    (v, i) =>
      (v + ys[Math.max(0, i - 1)] + ys[Math.min(ys.length - 1, i + 1)]) / 3,
  );
  const range = Math.max(...smooth) - Math.min(...smooth),
    threshold = Math.max(2, width * 0.5, range * 0.15);
  const extrema: { value: number; index: number }[] = [];
  for (let i = 2; i < smooth.length - 2; i++) {
    const v = smooth[i];
    if (
      (v > smooth[i - 1] && v >= smooth[i + 1]) ||
      (v < smooth[i - 1] && v <= smooth[i + 1])
    ) {
      const last = extrema[extrema.length - 1];
      if (!last || Math.abs(v - last.value) > threshold)
        extrema.push({ value: v, index: i });
      else if (Math.abs(v) > Math.abs(last.value))
        extrema[extrema.length - 1] = { value: v, index: i };
    }
  }
  const significant = extrema.filter((e) => Math.abs(e.value) > threshold);
  const alternating =
    significant.length >= 2 &&
    significant
      .slice(1)
      .every((e, i) => Math.sign(e.value) !== Math.sign(significant[i].value));
  const reduced = simplify(ps, Math.max(2, total * 0.012));
  let turn = 0;
  for (let i = 1; i < reduced.length - 1; i++) {
    const u = {
        x: reduced[i].x - reduced[i - 1].x,
        y: reduced[i].y - reduced[i - 1].y,
      },
      v = {
        x: reduced[i + 1].x - reduced[i].x,
        y: reduced[i + 1].y - reduced[i].y,
      };
    turn += Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
  }
  // Winding is more reliable than endpoint tangent turns for a narrow ellipse.
  const box = bounds(ps),
    center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const angles = ps.map((p) => Math.atan2(p.y - center.y, p.x - center.x));
  let winding = 0;
  for (let i = 1; i < angles.length; i++) {
    let delta = angles[i] - angles[i - 1];
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    winding += delta;
  }
  const common = {
    waveCount: Math.max(0.5, significant.length / 2),
    amplitude: Math.max(
      1,
      ...points.map((p) => Math.abs((p.y - a.y) * dx - (p.x - a.x) * dy)),
    ),
    sign: Math.sign(significant[0]?.value || smooth[4]) || 1,
  };
  if (
    (Math.abs(turn) > Math.PI * 1.55 || Math.abs(winding) > Math.PI * 1.6) &&
    chord < total * 0.32
  )
    return {
      kind: "loop",
      candidates: ["loop", "free"],
      note: "회전 경로를 감지했습니다. 겹친 획과 진행 순서는 보존되며, 반복 횟수는 추측하지 않습니다.",
      ...common,
    };
  if (alternating && range > width * 1.4)
    return {
      kind: "wave",
      candidates: ["wave", "curve", "free"],
      note: "물결 후보입니다. 물결 횟수·진폭을 확인하고 필요하면 원본 형태로 바꾸세요.",
      ...common,
    };
  const deviation = Math.max(...ys.map(Math.abs));
  if (chord > total * 0.97 && deviation < Math.max(2, total * 0.012))
    return {
      kind: "straight",
      candidates: ["straight", "curve"],
      note: "시작점과 끝점을 유지한 직선입니다.",
      ...common,
    };
  const corners = reduced
    .slice(1, -1)
    .filter((p, i) => angle(reduced[i], p, reduced[i + 2]) < 2.25);
  if (corners.length > 0 && reduced.length <= 7)
    return {
      kind: "corner",
      candidates: ["corner", "curve", "free"],
      note: "꺾임 후보입니다. 중요한 모서리를 유지합니다.",
      ...common,
    };
  if (Math.abs(turn) > 2.35 && Math.abs(turn) < 3.8 && chord > total * 0.35)
    return {
      kind: "semicircle",
      candidates: ["semicircle", "curve", "free"],
      note: "반원 후보입니다. 끝점과 회전 방향을 확인하세요.",
      ...common,
    };
  return {
    kind: "curve",
    candidates: ["curve", "wave", "free"],
    note: "곡선 후보입니다. 물결이나 꺾임이라면 유형을 직접 지정할 수 있습니다.",
    ...common,
  };
}
export function fitLoop(points: Point[]): Point[] {
  // Principal axes preserve a tilted ellipse rather than forcing it upright.
  const center = points.reduce(
    (c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length }),
    { x: 0, y: 0 },
  );
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of points) {
    const x = p.x - center.x,
      y = p.y - center.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const local = points.map((p) => ({
    x: (p.x - center.x) * cos + (p.y - center.y) * sin,
    y: -(p.x - center.x) * sin + (p.y - center.y) * cos,
  }));
  const b = bounds(local),
    rx = Math.max(b.width / 2, 8),
    ry = Math.max(b.height / 2, 8),
    cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;
  const angles = local.map((p) => Math.atan2((p.y - cy) / ry, (p.x - cx) / rx));
  let sweep = 0;
  for (let i = 1; i < angles.length; i++) {
    let d = angles[i] - angles[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
  }
  if (Math.abs(sweep) < Math.PI) sweep = Math.sign(sweep || 1) * Math.PI * 1.85;
  const count = Math.max(48, Math.ceil(Math.abs(sweep) * 14));
  const result = Array.from({ length: count + 1 }, (_, i) => {
    const t = angles[0] + (sweep * i) / count,
      x = cx + rx * Math.cos(t),
      y = cy + ry * Math.sin(t);
    return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
  });
  result[0] = { ...points[0] };
  result[result.length - 1] = { ...points[points.length - 1] };
  return result;
}
function fitSemicircle(points: Point[]) {
  const start = points[0],
    end = points[points.length - 1],
    mid = at(points, 0.5).point;
  const cross =
    (end.x - start.x) * (mid.y - start.y) -
    (end.y - start.y) * (mid.x - start.x);
  const cx = (start.x + end.x) / 2,
    cy = (start.y + end.y) / 2,
    r = dist(start, end) / 2,
    base = Math.atan2(start.y - cy, start.x - cx),
    sign = cross > 0 ? -1 : 1;
  return Array.from({ length: 49 }, (_, i) => {
    if (i === 0) return { ...start };
    if (i === 48) return { ...end };
    return {
      x: cx + r * Math.cos(base + (sign * Math.PI * i) / 48),
      y: cy + r * Math.sin(base + (sign * Math.PI * i) / 48),
    };
  });
}
export function normalize(
  points: Point[],
  kind: Kind,
  smoothing = 0.45,
): Point[] {
  if (kind === "straight" || kind === "wave")
    return [{ ...points[0] }, { ...points[points.length - 1] }];
  if (kind === "free") return points.map((p) => ({ ...p }));
  if (kind === "loop") return fitLoop(points);
  if (kind === "semicircle") return fitSemicircle(points);
  return simplify(
    points,
    Math.max(
      0.8,
      length(points) * (kind === "corner" ? 0.023 : 0.003 + smoothing * 0.007),
    ),
  );
}
export function pathToArrow(
  stroke: Stroke,
  style: ArrowStyle = DEFAULT_STYLE,
  forced?: Kind,
): { arrow: Arrow; analysis: Analysis } {
  const analysis = analyze(stroke.points, style.width),
    kind = forced || analysis.kind;
  const arrow = makeArrow(normalize(stroke.points, kind), kind, style);
  arrow.rawStrokeIds = [stroke.id];
  arrow.waveCount = analysis.waveCount;
  arrow.waveAmplitude = analysis.amplitude;
  arrow.waveSign = analysis.sign;
  return { arrow, analysis };
}
type VHead = { tip: Point; wings: Point[]; ids: string[] };
function vFrom(points: Point[], ids: string[]): VHead | null {
  const ps = simplify(points, Math.max(2, length(points) * 0.055));
  if (ps.length !== 3) return null;
  const [a, tip, b] = ps,
    aa = angle(a, tip, b),
    l1 = dist(a, tip),
    l2 = dist(b, tip);
  if (aa > 0.28 && aa < 2.15 && Math.min(l1, l2) / Math.max(l1, l2) > 0.25)
    return { tip, wings: [a, b], ids };
  return null;
}
function projection(points: Point[], p: Point) {
  const total = length(points);
  let best = { distance: Infinity, at: 0, tangent: { x: 1, y: 0 } },
    elapsed = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      size = dist(a, b),
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t = clamp(
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (size * size || 1),
        0,
        1,
      ),
      d = dist(p, { x: a.x + dx * t, y: a.y + dy * t });
    if (d < best.distance)
      best = {
        distance: d,
        at: (elapsed + size * t) / (total || 1),
        tangent: { x: dx / (size || 1), y: dy / (size || 1) },
      };
    elapsed += size;
  }
  return best;
}
export type RecognitionResult = {
  arrows: Arrow[];
  analyses: Analysis[];
  warnings: string[];
};
export function recognize(
  strokes: Stroke[],
  style: ArrowStyle = DEFAULT_STYLE,
  forced?: Kind,
): RecognitionResult {
  const usable = strokes.filter(
      (s) => s.points.length > 1 && length(s.points) > 4,
    ),
    heads: VHead[] = [],
    used = new Set<string>();
  const tolerance = Math.max(18, style.width * 3);
  // A head is removed from shaft candidates only after a geometric match succeeds.
  const candidates = usable
    .map((s) => vFrom(s.points, [s.id]))
    .filter((v): v is VHead => !!v);
  for (let i = 0; i < usable.length; i++)
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i],
        b = usable[j];
      if (simplify(a.points, 3).length > 2 || simplify(b.points, 3).length > 2)
        continue;
      for (const ai of [0, a.points.length - 1])
        for (const bi of [0, b.points.length - 1]) {
          if (dist(a.points[ai], b.points[bi]) > Math.min(tolerance, 10))
            continue;
          const tip = {
            x: (a.points[ai].x + b.points[bi].x) / 2,
            y: (a.points[ai].y + b.points[bi].y) / 2,
          };
          const wingA = a.points[ai === 0 ? a.points.length - 1 : 0],
            wingB = b.points[bi === 0 ? b.points.length - 1 : 0];
          const v = vFrom([wingA, tip, wingB], [a.id, b.id]);
          if (v) candidates.push(v);
        }
    }
  const assignments = new Map<
    string,
    { head: VHead; at: number; direction: 1 | -1 }[]
  >();
  let ambiguousAttachment = false;
  for (const h of candidates) {
    if (h.ids.some((id) => used.has(id))) continue;
    let best: {
      stroke: Stroke;
      at: number;
      direction: 1 | -1;
      score: number;
    } | null = null;
    const matchingScores: number[] = [];
    const wingCenter = {
      x: (h.wings[0].x + h.wings[1].x) / 2,
      y: (h.wings[0].y + h.wings[1].y) / 2,
    };
    const facing = { x: h.tip.x - wingCenter.x, y: h.tip.y - wingCenter.y };
    for (const shaft of usable) {
      if (h.ids.includes(shaft.id) || used.has(shaft.id)) continue;
      if (
        length(shaft.points) <
        Math.max(...h.wings.map((p) => dist(p, h.tip))) * 1.15
      )
        continue;
      const p = projection(shaft.points, h.tip),
        dot =
          (facing.x * p.tangent.x + facing.y * p.tangent.y) /
          (Math.hypot(facing.x, facing.y) || 1);
      const score = p.distance + (1 - Math.abs(dot)) * tolerance;
      if (p.distance <= tolerance && Math.abs(dot) > 0.45)
        matchingScores.push(score);
      if (
        p.distance <= tolerance &&
        Math.abs(dot) > 0.45 &&
        (!best || score < best.score)
      )
        best = {
          stroke: shaft,
          at: p.at < 0.035 ? 0 : p.at > 0.965 ? 1 : p.at,
          direction: dot >= 0 ? 1 : -1,
          score,
        };
    }
    matchingScores.sort((a, b) => a - b);
    if (
      matchingScores.length > 1 &&
      matchingScores[1] - matchingScores[0] < tolerance * 0.2
    ) {
      ambiguousAttachment = true;
      continue;
    }
    if (best) {
      h.ids.forEach((id) => used.add(id));
      heads.push(h);
      const list = assignments.get(best.stroke.id) || [];
      list.push({ head: h, at: best.at, direction: best.direction });
      assignments.set(best.stroke.id, list);
    }
  }
  const arrows: Arrow[] = [],
    analyses: Analysis[] = [],
    warnings: string[] = [];
  if (ambiguousAttachment)
    warnings.push(
      "여러 경로가 같은 화살촉에 가까워 연결을 보류했습니다. 원본을 유지하며 화살촉을 직접 추가할 수 있습니다.",
    );
  for (const stroke of usable.filter((s) => !used.has(s.id))) {
    let shaft = stroke,
      integratedHead: VHead | null = null;
    // A continuous shaft followed by two wings, returning to its tip, is also supported.
    const reduced = simplify(
      stroke.points,
      Math.max(2, length(stroke.points) * 0.012),
    );
    for (let i = 1; i < reduced.length - 3; i++) {
      const tip = reduced[i],
        end = reduced.slice(i),
        candidate = vFrom([end[1], end[2], end[3]], [stroke.id]);
      if (
        candidate &&
        dist(tip, candidate.tip) < tolerance &&
        length(reduced.slice(0, i + 1)) > length(end) * 1.1
      ) {
        shaft = { ...stroke, points: reduced.slice(0, i + 1) };
        integratedHead = candidate;
        break;
      }
    }
    const result = pathToArrow(shaft, style, forced),
      attached = assignments.get(stroke.id) || [];
    result.arrow.heads = attached.map((h) => ({
      id: uid(),
      at: h.at,
      direction: h.direction,
    }));
    result.arrow.rawStrokeIds = [
      stroke.id,
      ...attached.flatMap((h) => h.head.ids),
    ];
    if (integratedHead)
      result.arrow.heads.push({ id: uid(), at: 1, direction: 1 });
    if (!result.arrow.heads.length)
      warnings.push(
        "화살촉을 확실히 연결하지 못한 획은 경로로 남겼습니다. 선택 후 화살촉을 추가하거나 실행 취소해 다시 그리세요.",
      );
    arrows.push(result.arrow);
    analyses.push(result.analysis);
  }
  if (
    analyses.some(
      (a) => a.kind === "wave" || a.kind === "loop" || a.kind === "curve",
    )
  )
    warnings.push(
      "유형은 기하학적 후보입니다. 원본 비교와 유형 선택으로 결과를 확인하세요.",
    );
  return { arrows, analyses, warnings: [...new Set(warnings)] };
}
