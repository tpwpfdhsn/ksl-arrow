export type Point = { x: number; y: number; t?: number; pressure?: number };
export type Stroke = {
  id: string;
  points: Point[];
  startedAt: number;
  endedAt: number;
  pointerType: string;
};
export type Kind =
  "straight" | "curve" | "corner" | "semicircle" | "loop" | "wave" | "free";
export type ArrowStyle = {
  width: number;
  color: string;
  headScale: number;
  headAngle: number;
  outline: boolean;
  dashed: boolean;
};
export type Head = { id: string; at: number; direction: 1 | -1 };
export type Arrow = {
  id: string;
  name: string;
  kind: Kind;
  points: Point[];
  heads: Head[];
  style: ArrowStyle;
  rawStrokeIds: string[];
  smoothing: number;
  waveCount: number;
  waveAmplitude: number;
  waveSign: number;
  repeatCount: number;
  repeatGap: number;
  laps: number;
  perspective: "none" | "toward" | "away";
};
export type Photo = { dataUrl: string; name: string };
export type Project = {
  version: 1;
  name: string;
  width: number;
  height: number;
  photo: Photo | null;
  arrows: Arrow[];
  strokes: Stroke[];
  pendingIds: string[];
};
export const KIND_LABELS: Record<Kind, string> = {
  straight: "직선",
  curve: "곡선",
  corner: "꺾임",
  semicircle: "반원",
  loop: "회전·타원",
  wave: "물결",
  free: "원본 형태",
};
export const DEFAULT_STYLE: ArrowStyle = {
  width: 9,
  color: "#202a28",
  headScale: 3.4,
  headAngle: 27,
  outline: false,
  dashed: false,
};
export const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also works on local-network HTTP development origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const emptyProject = (): Project => ({
  version: 1,
  name: "나의 수어 화살표",
  width: 1600,
  height: 1200,
  photo: null,
  arrows: [],
  strokes: [],
  pendingIds: [],
});
export function makeArrow(
  points: Point[],
  kind: Kind,
  style: ArrowStyle = DEFAULT_STYLE,
): Arrow {
  return {
    id: uid(),
    name: KIND_LABELS[kind] + " 화살표",
    kind,
    points,
    heads: [{ id: uid(), at: 1, direction: 1 }],
    style: { ...style },
    rawStrokeIds: [],
    smoothing: 0.45,
    waveCount: 2,
    waveAmplitude: 40,
    waveSign: 1,
    repeatCount: 1,
    repeatGap: 50,
    laps: 1,
    perspective: "none",
  };
}
