import { describe, it, expect } from "vitest";
import { makeArrow, uid, emptyProject } from "../src/model";
import type { Point, Stroke } from "../src/model";
import { analyze, pathToArrow, recognize } from "../src/recognition";
import {
  arrowPoints,
  at,
  dist,
  length,
  renderGeometry,
  reverseArrow,
  wavePoints,
} from "../src/geometry";
import { parseProject } from "../src/storage";
import { svgString } from "../src/export";
const stroke = (points: Point[], delay = 0): Stroke => ({
  id: uid(),
  points,
  startedAt: 1000 + delay,
  endedAt: 2000 + delay,
  pointerType: "pen",
});
const line = (x = 0, y = 0, end = 200) =>
  stroke([
    { x, y },
    { x: end, y },
  ]);
const head = (x: number, y = 0) =>
  stroke(
    [
      { x: x - 25, y: y - 18 },
      { x, y },
      { x: x - 25, y: y + 18 },
    ],
    60000,
  );
const circle = (direction = 1, laps = 1) =>
  Array.from({ length: 161 }, (_, i) => {
    const t = (i / 160) * (Math.PI * 2 * laps - 0.2) * direction;
    return { x: 200 + 100 * Math.cos(t), y: 200 + 80 * Math.sin(t) };
  });
const turn = (p: Point[]) =>
  p.slice(1, -1).reduce((s, q, i) => {
    const a = p[i],
      b = p[i + 2];
    return s + (q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x);
  }, 0);
describe("움직임을 보존하는 유형별 보정", () => {
  it("직선의 시작점과 끝점을 보존한다", () => {
    const s = line(),
      r = pathToArrow(s);
    expect(r.arrow.kind).toBe("straight");
    expect(r.arrow.points).toEqual(s.points);
    expect(r.arrow.rawStrokeIds).toEqual([s.id]);
  });
  it("물결을 직선으로 펴지 않고 횟수와 진폭을 보존한다", () => {
    const p = wavePoints({ x: 0, y: 100 }, { x: 500, y: 100 }, 3, 32);
    const r = pathToArrow(stroke(p));
    expect(r.arrow.kind).toBe("wave");
    expect(r.arrow.waveCount).toBe(3);
    expect(r.arrow.waveAmplitude).toBeCloseTo(32, 0);
    expect(length(arrowPoints(r.arrow))).toBeGreaterThan(500);
  });
  it.each([1, -1])("회전 방향 %s를 보존하고 반전한다", (direction) => {
    const r = pathToArrow(stroke(circle(direction)));
    expect(r.arrow.kind).toBe("loop");
    expect(Math.sign(turn(arrowPoints(r.arrow)))).toBe(direction);
    expect(Math.sign(turn(arrowPoints(reverseArrow(r.arrow))))).toBe(
      -direction,
    );
  });
  it("겹친 두 회전을 삭제하거나 반복 횟수를 추측하지 않는다", () => {
    const s = stroke(circle(1, 2)),
      r = pathToArrow(s);
    expect(r.arrow.kind).toBe("loop");
    expect(length(arrowPoints(r.arrow))).toBeGreaterThan(1000);
    expect(r.arrow.laps).toBe(1);
    expect(s.points.length).toBe(161);
  });
  it("급한 꺾임을 곡선으로 펴지 않는다", () => {
    expect(
      analyze([
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 140 },
      ]).kind,
    ).toBe("corner");
  });
  it("방향 반전 후 끝점 화살촉은 반대편에 놓인다", () => {
    const a = makeArrow(
        [
          { x: 10, y: 10 },
          { x: 250, y: 100 },
        ],
        "curve",
      ),
      r = reverseArrow(a),
      g = renderGeometry(r);
    expect(g.heads[0].tip).toEqual(a.points[0]);
    expect(g.heads[0].tangent.x).toBeLessThan(0);
  });
  it.each([1, 1.5, 2, 2.5])(
    "물결 %s회는 반전해도 같은 공간의 경로를 따른다",
    (count) => {
      const a = makeArrow(
        [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
        ],
        "wave",
      );
      a.waveCount = count;
      const p = arrowPoints(a),
        q = arrowPoints(reverseArrow(a)).reverse();
      expect(Math.max(...p.map((v, i) => dist(v, q[i])))).toBeLessThan(0.001);
    },
  );
  it.each(["curve", "corner"] as const)(
    "짧고 급한 %s에서도 유효하고 경로 길이에 맞는 화살촉을 만든다",
    (kind) => {
      const a = makeArrow(
          [
            { x: 0, y: 30 },
            { x: 8, y: 0 },
            { x: 13, y: 31 },
          ],
          kind,
        ),
        g = renderGeometry(a);
      expect(g.shaft).not.toMatch(/NaN|Infinity/);
      expect(g.heads[0].d).not.toMatch(/NaN|Infinity/);
      expect(g.heads[0].length).toBeLessThan(g.total * 0.41);
      expect(dist(g.heads[0].tip, at(g.points, 1).point)).toBeLessThan(0.001);
    },
  );
});
describe("획과 화살촉의 연결", () => {
  it("늦게 그린 V형 화살촉을 경로 끝에 연결한다", () => {
    const a = line(),
      h = head(200),
      r = recognize([a, h]);
    expect(r.arrows).toHaveLength(1);
    expect(r.arrows[0].heads).toHaveLength(1);
    expect(r.arrows[0].heads[0].at).toBe(1);
    expect(r.arrows[0].rawStrokeIds).toContain(h.id);
  });
  it("두 개의 독립 화살표와 한 경로의 두 화살촉을 구분한다", () => {
    const separate = recognize([
      line(0, 0, 130),
      head(130),
      line(210, 0, 340),
      head(340),
    ]);
    expect(separate.arrows).toHaveLength(2);
    expect(separate.arrows.every((a) => a.heads.length === 1)).toBe(true);
    const multiple = recognize([line(), head(100), head(200)]);
    expect(multiple.arrows).toHaveLength(1);
    expect(multiple.arrows[0].heads).toHaveLength(2);
    expect(multiple.arrows[0].heads.map((h) => h.at).sort()).toEqual([0.5, 1]);
  });
  it("두 획으로 그린 화살촉도 연결한다", () => {
    const r = recognize([
      line(),
      stroke([
        { x: 175, y: -18 },
        { x: 200, y: 0 },
      ]),
      stroke([
        { x: 200, y: 0 },
        { x: 175, y: 18 },
      ]),
    ]);
    expect(r.arrows).toHaveLength(1);
    expect(r.arrows[0].heads).toHaveLength(1);
    expect(r.arrows[0].rawStrokeIds).toHaveLength(3);
  });
  it("한 획으로 경로와 V형 촉을 이어 그린 입력을 지원한다", () => {
    const r = recognize([
      stroke([
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 175, y: -18 },
        { x: 200, y: 0 },
        { x: 175, y: 18 },
      ]),
    ]);
    expect(r.arrows).toHaveLength(1);
    expect(r.arrows[0].heads).toHaveLength(1);
    expect(r.arrows[0].points.at(-1)).toEqual({ x: 200, y: 0 });
  });
  it("양방향 화살촉을 각각 유지한다", () => {
    const start = stroke([
      { x: 25, y: -18 },
      { x: 0, y: 0 },
      { x: 25, y: 18 },
    ]);
    const r = recognize([line(), start, head(200)]);
    expect(r.arrows).toHaveLength(1);
    expect(r.arrows[0].heads.map((h) => h.direction).sort()).toEqual([-1, 1]);
  });
  it("서로 다른 왕복 경로와 겹친 원본 획을 임의 삭제하지 않는다", () => {
    const r = recognize([
      line(),
      stroke([
        { x: 200, y: 50 },
        { x: 0, y: 50 },
      ]),
      line(),
    ]);
    expect(r.arrows).toHaveLength(3);
    expect(r.arrows.every((a) => a.heads.length === 0)).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
describe("출력과 재편집", () => {
  it("원본 사진과 같은 크기·좌표의 SVG를 출력한다", () => {
    const p = emptyProject();
    p.width = 4032;
    p.height = 3024;
    p.arrows = [
      makeArrow(
        [
          { x: 500, y: 1000 },
          { x: 900, y: 1200 },
        ],
        "straight",
      ),
    ];
    const svg = svgString(p);
    expect(svg).toContain('width="4032"');
    expect(svg).toContain('height="3024"');
    expect(svg).toContain('viewBox="0 0 4032 3024"');
    expect(svg).toContain("M 500 1000");
    expect(svg).not.toContain("<image");
  });
  it("원본 획·편집·반복·스타일을 프로젝트 왕복 저장으로 보존한다", () => {
    const p = emptyProject(),
      s = stroke(wavePoints({ x: 10, y: 100 }, { x: 600, y: 100 }, 2, 24)),
      r = pathToArrow(s);
    r.arrow.repeatCount = 2;
    r.arrow.style.outline = true;
    p.strokes = [s];
    p.arrows = [r.arrow];
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it("손상된 프로젝트와 비정상 좌표를 거부한다", () => {
    const p = emptyProject();
    p.arrows = [
      makeArrow(
        [
          { x: 0, y: 0 },
          { x: Infinity, y: 10 },
        ],
        "straight",
      ),
    ];
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    expect(() => parseProject('{"version":9}')).toThrow();
  });
});

describe("애매한 연결과 타원 형태 보존", () => {
  it("같은 끝점을 가진 두 경로 중 하나에 화살촉을 임의 연결하지 않는다", () => {
    const r = recognize([line(), line(), head(200)]);
    expect(r.arrows).toHaveLength(3);
    expect(r.arrows.every((a) => a.heads.length === 0)).toBe(true);
    expect(r.warnings.join()).toContain("연결을 보류");
  });
  it("기울어진 타원의 장축 방향을 유지한다", () => {
    const raw = Array.from({ length: 151 }, (_, i) => {
      const t = (i / 150) * (Math.PI * 2 - 0.12),
        x = 120 * Math.cos(t),
        y = 40 * Math.sin(t),
        r = Math.PI / 4;
      return {
        x: 200 + x * Math.cos(r) - y * Math.sin(r),
        y: 200 + x * Math.sin(r) + y * Math.cos(r),
      };
    });
    const a = pathToArrow(stroke(raw)).arrow;
    expect(a.kind).toBe("loop");
    const points = arrowPoints(a),
      diagonal = Math.max(
        ...points.map((p) => Math.abs((p.x + p.y - 400) / Math.SQRT2)),
      ),
      normal = Math.max(
        ...points.map((p) => Math.abs((p.y - p.x) / Math.SQRT2)),
      );
    expect(diagonal).toBeGreaterThan(115);
    expect(normal).toBeLessThan(45);
    expect(a.points[0]).toEqual(raw[0]);
    expect(a.points.at(-1)).toEqual(raw.at(-1));
  });
});
