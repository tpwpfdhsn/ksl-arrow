import type { ArrowStyle, Project } from "./model";
import { DEFAULT_STYLE } from "./model";
export const PROJECT_VERSION = 1;
const num = (v: unknown, min = -1e7, max = 1e7): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;
const list = (v: unknown, max: number) => Array.isArray(v) && v.length <= max;
export function validStyle(v: unknown): v is ArrowStyle {
  return (
    obj(v) &&
    num(v.width, 0.5, 80) &&
    typeof v.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(v.color) &&
    num(v.headScale, 1.2, 8) &&
    num(v.headAngle, 12, 55) &&
    typeof v.outline === "boolean" &&
    typeof v.dashed === "boolean"
  );
}
export function parseProject(input: string): Project {
  const p: unknown = JSON.parse(input);
  if (
    !obj(p) ||
    p.version !== 1 ||
    !str(p.name) ||
    !num(p.width, 1, 32000) ||
    !num(p.height, 1, 32000) ||
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    !list(p.arrows, 300) ||
    !list(p.strokes, 3000) ||
    !list(p.pendingIds, 3000)
  )
    throw Error("지원하는 결 프로젝트(.gyeol.json) 형식이 아닙니다.");
  const points = (v: unknown) =>
    list(v, 50000) &&
    (v as unknown[]).length >= 2 &&
    (v as unknown[]).every(
      (q) =>
        obj(q) &&
        num(q.x) &&
        num(q.y) &&
        (q.t === undefined || num(q.t, 0, 1e16)) &&
        (q.pressure === undefined || num(q.pressure, 0, 1)),
    );
  for (const a of p.arrows as unknown[]) {
    if (
      !obj(a) ||
      !str(a.id) ||
      !str(a.name) ||
      ![
        "straight",
        "curve",
        "corner",
        "semicircle",
        "loop",
        "wave",
        "free",
      ].includes(String(a.kind)) ||
      !points(a.points) ||
      !validStyle(a.style) ||
      !list(a.heads, 20) ||
      !(a.heads as unknown[]).every(
        (h) =>
          obj(h) &&
          str(h.id) &&
          num(h.at, 0, 1) &&
          (h.direction === 1 || h.direction === -1),
      ) ||
      !list(a.rawStrokeIds, 3000) ||
      !(a.rawStrokeIds as unknown[]).every((id) => str(id)) ||
      !num(a.smoothing, 0, 1) ||
      !num(a.waveCount, 0.5, 20) ||
      !num(a.waveAmplitude, 0, 10000) ||
      ![1, -1].includes(Number(a.waveSign)) ||
      !num(a.repeatCount, 1, 12) ||
      !Number.isInteger(a.repeatCount) ||
      !num(a.repeatGap, 0, 2000) ||
      !num(a.laps, 1, 20) ||
      !Number.isInteger(a.laps) ||
      !["none", "toward", "away"].includes(String(a.perspective))
    )
      throw Error("화살표 데이터가 손상되었거나 지원 범위를 벗어났습니다.");
  }
  for (const s of p.strokes as unknown[]) {
    if (
      !obj(s) ||
      !str(s.id) ||
      !points(s.points) ||
      !num(s.startedAt, 0, 1e16) ||
      !num(s.endedAt, 0, 1e16) ||
      !str(s.pointerType)
    )
      throw Error("원본 획 데이터를 읽을 수 없습니다.");
  }
  if (!(p.pendingIds as unknown[]).every((id) => str(id)))
    throw Error("획 목록이 올바르지 않습니다.");
  if (
    p.photo !== null &&
    (!obj(p.photo) ||
      !str(p.photo.name) ||
      typeof p.photo.dataUrl !== "string" ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(p.photo.dataUrl))
  )
    throw Error("프로젝트에 포함된 사진이 올바르지 않습니다.");
  const ids = (p.arrows as { id: string }[]).map((a) => a.id),
    strokeIds = (p.strokes as { id: string }[]).map((s) => s.id);
  if (
    new Set(ids).size !== ids.length ||
    new Set(strokeIds).size !== strokeIds.length ||
    !(p.pendingIds as string[]).every((id) => strokeIds.includes(id)) ||
    !(p.arrows as { rawStrokeIds: string[] }[]).every((a) =>
      a.rawStrokeIds.every((id) => strokeIds.includes(id)),
    )
  )
    throw Error("프로젝트의 객체 연결이 손상되었습니다.");
  return p as Project;
}
export function readDefaultStyle(): ArrowStyle {
  try {
    const s = JSON.parse(localStorage.getItem("gyeol-style") || "null");
    return validStyle(s) ? s : { ...DEFAULT_STYLE };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("gyeol-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("draft");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function draftOp(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("draft", mode);
    const r = action(tx.objectStore("draft"));
    tx.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function saveDraft(p: Project) {
  await draftOp("readwrite", (s) => s.put(JSON.stringify(p), "current"));
}
export async function loadDraft(): Promise<Project | null> {
  const raw = await draftOp("readonly", (s) => s.get("current"));
  return typeof raw === "string" ? parseProject(raw) : null;
}
export async function clearDraft() {
  await draftOp("readwrite", (s) => s.delete("current"));
}
export const readFileDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        Error(
          "사진을 해석하지 못했습니다. PNG 또는 JPEG 파일을 확인해 주세요.",
        ),
      );
    image.src = src;
  });
