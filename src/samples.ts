import { makeArrow, uid } from "./model";
import type { Arrow, Project } from "./model";
export function samples(): { title: string; subtitle: string; arrow: Arrow }[] {
  const straight = makeArrow(
    [
      { x: 40, y: 120 },
      { x: 240, y: 120 },
    ],
    "straight",
  );
  const curve = makeArrow(
    [
      { x: 35, y: 155 },
      { x: 70, y: 90 },
      { x: 150, y: 65 },
      { x: 240, y: 100 },
    ],
    "curve",
  );
  const loop = makeArrow(
    Array.from({ length: 65 }, (_, i) => {
      const t = -Math.PI * 0.25 + (i / 64) * Math.PI * 1.83;
      return { x: 143 + 78 * Math.cos(t), y: 116 + 65 * Math.sin(t) };
    }),
    "loop",
  );
  const wave = makeArrow(
    [
      { x: 25, y: 116 },
      { x: 258, y: 116 },
    ],
    "wave",
  );
  wave.waveCount = 2;
  wave.waveAmplitude = 23;
  const repeat = makeArrow(
    [
      { x: 30, y: 120 },
      { x: 117, y: 120 },
    ],
    "straight",
  );
  repeat.repeatCount = 2;
  repeat.repeatGap = 45;
  const perspective = makeArrow(
    [
      { x: 40, y: 157 },
      { x: 100, y: 135 },
      { x: 168, y: 97 },
      { x: 236, y: 65 },
    ],
    "curve",
  );
  perspective.perspective = "toward";
  const multi = makeArrow(
    [
      { x: 30, y: 130 },
      { x: 110, y: 95 },
      { x: 245, y: 110 },
    ],
    "curve",
  );
  multi.heads = [
    { id: uid(), at: 0.52, direction: 1 },
    { id: uid(), at: 1, direction: 1 },
  ];
  const both = makeArrow(
    [
      { x: 40, y: 120 },
      { x: 240, y: 120 },
    ],
    "straight",
  );
  both.heads.push({ id: uid(), at: 0, direction: -1 });
  return [
    {
      title: "직선",
      subtitle: "균일한 선 · 균형 잡힌 화살촉",
      arrow: straight,
    },
    {
      title: "완만한 곡선",
      subtitle: "끝점의 접선에 맞춘 화살촉",
      arrow: curve,
    },
    { title: "회전", subtitle: "진행 방향과 화살촉 여백 유지", arrow: loop },
    { title: "물결", subtitle: "굴곡의 횟수와 진폭 유지", arrow: wave },
    { title: "반복", subtitle: "분리된 두 화살표 → →", arrow: repeat },
    {
      title: "원근",
      subtitle: "사용자가 선택한 폭의 변화",
      arrow: perspective,
    },
    {
      title: "다중 화살촉",
      subtitle: "한 경로 위에 여러 화살촉",
      arrow: multi,
    },
    {
      title: "양방향",
      subtitle: "하나의 경로 · 서로 반대인 끝점",
      arrow: both,
    },
  ];
}
export function demoProject(): Project {
  const list = samples();
  return {
    version: 1,
    name: "화살표 연습 캔버스",
    width: 1600,
    height: 1200,
    photo: null,
    strokes: [],
    pendingIds: [],
    arrows: list.map((s, i) => ({
      ...s.arrow,
      name: s.title,
      points: s.arrow.points.map((p) => ({
        ...p,
        x: p.x * 2 + 100 + (i % 2) * 720,
        y: p.y * 1.4 + 40 + Math.floor(i / 2) * 280,
      })),
      waveAmplitude: s.arrow.waveAmplitude * 1.4,
    })),
  };
}
