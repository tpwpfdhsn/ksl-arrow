import { renderToStaticMarkup } from "react-dom/server";
import { ArrowView } from "./ArrowView";
import type { Project } from "./model";
import { loadImage } from "./storage";
export function svgString(p: Project, includePhoto = false): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    renderToStaticMarkup(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width={p.width}
        height={p.height}
        viewBox={`0 0 ${p.width} ${p.height}`}
      >
        <title>{p.name}</title>
        <desc>결 · 원본 사진 좌표계의 편집 가능한 벡터 화살표</desc>
        {includePhoto && p.photo && (
          <image href={p.photo.dataUrl} width={p.width} height={p.height} />
        )}
        <g>
          {p.arrows.map((a) => (
            <ArrowView key={a.id} arrow={a} />
          ))}
        </g>
      </svg>,
    )
  );
}
export async function pngBlob(
  p: Project,
  includePhoto: boolean,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw Error(
      "이 기기에서 출력 캔버스를 만들 수 없습니다. SVG로 저장해 주세요.",
    );
  if (includePhoto && p.photo) {
    const photo = await loadImage(p.photo.dataUrl);
    ctx.drawImage(photo, 0, 0, p.width, p.height);
  }
  const url = URL.createObjectURL(
    new Blob([svgString(p)], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const arrows = await loadImage(url);
    ctx.drawImage(arrows, 0, 0, p.width, p.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch (e) {
      reject(e);
    }
  });
  canvas.width = 1;
  canvas.height = 1;
  if (!blob)
    throw Error(
      "기기 메모리 또는 캔버스 크기 제한으로 PNG를 만들지 못했습니다. 원본 크기를 유지하는 SVG를 이용해 주세요.",
    );
  return blob;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const safeName = (name: string) =>
  name.replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 80) || "수어-화살표";
