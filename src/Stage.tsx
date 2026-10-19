import { useEffect, useRef, useState } from "react";
import {
  Expand,
  ImagePlus,
  Minus,
  Plus,
  LockKeyhole,
  MousePointer2,
  PenTool,
} from "lucide-react";
import type { Arrow, Point, Project, Stroke } from "./model";
import { uid } from "./model";
import { ArrowView } from "./ArrowView";
import {
  arrowBounds,
  arrowPoints,
  at,
  bounds,
  clamp,
  dist,
  length,
  moveArrow,
  pathD,
  transformArrow,
} from "./geometry";
export type Tool = "path" | "recognize" | "select" | "pan";
type Drag = {
  pointerId: number;
  kind: "move" | "point" | "head" | "scale" | "rotate";
  original: Arrow;
  latest: Arrow;
  start: Point;
  index?: number;
  headId?: string;
};
export function Stage({
  project,
  selectedId,
  onSelect,
  tool,
  penOnly,
  compare,
  editPoints,
  onStroke,
  onArrow,
  onPhoto,
  onDemo,
}: {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  tool: Tool;
  penOnly: boolean;
  compare: "off" | "overlay" | "raw";
  editPoints: boolean;
  onStroke: (s: Stroke) => void;
  onArrow: (a: Arrow) => void;
  onPhoto: () => void;
  onDemo: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    current = useRef<Stroke | null>(null),
    activePointer = useRef<number | null>(null),
    drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<Point[]>([]),
    [preview, setPreview] = useState<Arrow | null>(null),
    [size, setSize] = useState({ w: 900, h: 650 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const nav = useRef<{
      id: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
    } | null>(null),
    touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    zoom: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
  } | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    if (wrap.current) observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0 });
  }, [project.width, project.height]);
  useEffect(() => {
    if (current.current) {
      current.current = null;
      setLive([]);
    }
    drag.current = null;
    setPreview(null);
  }, [tool]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect(),
          cx = e.clientX - rect.left - rect.width / 2,
          cy = e.clientY - rect.top - rect.height / 2;
        setView((v) => {
          const zoom = clamp(v.zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.2, 8),
            ratio = zoom / v.zoom;
          return {
            zoom,
            x: cx - (cx - v.x) * ratio,
            y: cy - (cy - v.y) * ratio,
          };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const fit = Math.max(
      0.01,
      Math.min((size.w - 90) / project.width, (size.h - 90) / project.height),
    ),
    scale = fit * view.zoom;
  function docPoint(e: { clientX: number; clientY: number }): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: p.x, y: p.y };
  }
  const capture = (id: number) => {
    try {
      wrap.current?.setPointerCapture(id);
    } catch {
      /* Pointer was cancelled by the browser. */
    }
  };
  function beginDrag(
    e: React.PointerEvent,
    arrow: Arrow,
    kind: Drag["kind"],
    index?: number,
    headId?: string,
  ) {
    if (tool !== "select" || compare === "raw") return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(arrow.id);
    capture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      kind,
      original: arrow,
      latest: arrow,
      start: docPoint(e),
      index,
      headId,
    };
    setPreview(arrow);
  }
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (current.current && activePointer.current !== e.pointerId) return;
    e.preventDefault();
    capture(e.pointerId);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const rect = wrap.current!.getBoundingClientRect();
        pinch.current = {
          distance: dist(a, b),
          zoom: view.zoom,
          x: view.x,
          y: view.y,
          cx: (a.x + b.x) / 2 - rect.left - size.w / 2,
          cy: (a.y + b.y) / 2 - rect.top - size.h / 2,
        };
        current.current = null;
        setLive([]);
        nav.current = null;
        drag.current = null;
        setPreview(null);
        return;
      }
    }
    if (
      tool === "pan" ||
      (e.pointerType === "touch" && (penOnly || tool === "select"))
    ) {
      nav.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        vx: view.x,
        vy: view.y,
      };
      return;
    }
    if (tool === "select") {
      onSelect(null);
      return;
    }
    const p = docPoint(e);
    if (p.x < 0 || p.x > project.width || p.y < 0 || p.y > project.height)
      return;
    const time = Date.now();
    activePointer.current = e.pointerId;
    current.current = {
      id: uid(),
      points: [{ ...p, t: e.timeStamp, pressure: e.pressure }],
      startedAt: time,
      endedAt: time,
      pointerType: e.pointerType,
    };
    setLive(current.current.points);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId))
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()],
        pin = pinch.current,
        rect = wrap.current!.getBoundingClientRect(),
        cx = (a.x + b.x) / 2 - rect.left - size.w / 2,
        cy = (a.y + b.y) / 2 - rect.top - size.h / 2;
      const zoom = clamp((pin.zoom * dist(a, b)) / (pin.distance || 1), 0.2, 8),
        ratio = zoom / pin.zoom;
      setView({
        zoom,
        x: cx - (pin.cx - pin.x) * ratio,
        y: cy - (pin.cy - pin.y) * ratio,
      });
      return;
    }
    if (nav.current?.id === e.pointerId) {
      const n = nav.current;
      setView((v) => ({
        ...v,
        x: n.vx + e.clientX - n.x,
        y: n.vy + e.clientY - n.y,
      }));
      return;
    }
    if (drag.current && drag.current.pointerId === e.pointerId) {
      const d = drag.current,
        p = docPoint(e),
        original = d.original;
      let next = original;
      if (d.kind === "move")
        next = moveArrow(original, p.x - d.start.x, p.y - d.start.y);
      if (d.kind === "point")
        next = {
          ...original,
          points: original.points.map((q, i) =>
            i === d.index ? { ...q, x: p.x, y: p.y } : q,
          ),
        };
      if (d.kind === "head") {
        const ps = arrowPoints(original),
          total = length(ps);
        let best = Infinity,
          position = 1,
          elapsed = 0;
        for (let i = 1; i < ps.length; i++) {
          const a = ps[i - 1],
            b = ps[i],
            seg = dist(a, b),
            t = clamp(
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
                (seg * seg || 1),
              0,
              1,
            ),
            q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          if (dist(p, q) < best) {
            best = dist(p, q);
            position = (elapsed + seg * t) / (total || 1);
          }
          elapsed += seg;
        }
        next = {
          ...original,
          heads: original.heads.map((h) =>
            h.id === d.headId ? { ...h, at: position } : h,
          ),
        };
      }
      if (d.kind === "scale" || d.kind === "rotate") {
        const b = bounds(original.points),
          c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        next = transformArrow(
          original,
          d.kind === "scale"
            ? clamp(dist(p, c) / (dist(d.start, c) || 1), 0.15, 5)
            : 1,
          d.kind === "rotate"
            ? ((Math.atan2(p.y - c.y, p.x - c.x) -
                Math.atan2(d.start.y - c.y, d.start.x - c.x)) *
                180) /
                Math.PI
            : 0,
        );
      }
      d.latest = next;
      setPreview(next);
      return;
    }
    if (current.current && activePointer.current === e.pointerId) {
      const coalesced = e.nativeEvent.getCoalescedEvents?.();
      const events = coalesced?.length ? coalesced : [e.nativeEvent];
      for (const event of events) {
        const p = docPoint(event),
          last = current.current.points[current.current.points.length - 1];
        if (dist(p, last) > 0.7 / scale)
          current.current.points.push({
            ...p,
            t: event.timeStamp,
            pressure: event.pressure,
          });
      }
      setLive([...current.current.points]);
    }
  }
  function up(e: React.PointerEvent<HTMLDivElement>, cancel = false) {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    if (nav.current?.id === e.pointerId) nav.current = null;
    if (drag.current && drag.current.pointerId === e.pointerId) {
      if (!cancel) onArrow(drag.current.latest);
      drag.current = null;
      setPreview(null);
    }
    const stroke =
      activePointer.current === e.pointerId ? current.current : null;
    if (stroke) {
      current.current = null;
      activePointer.current = null;
      setLive([]);
    }
    if (stroke && !cancel) {
      const p = docPoint(e);
      if (dist(stroke.points[stroke.points.length - 1], p) > 0)
        stroke.points.push({ ...p, t: e.timeStamp, pressure: e.pressure });
      if (length(stroke.points) > 5) {
        stroke.endedAt = Date.now();
        onStroke(stroke);
      }
    }
    try {
      wrap.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* Already released. */
    }
  }
  const selected = preview || project.arrows.find((a) => a.id === selectedId),
    sb = selected ? arrowBounds(selected) : null;
  const markerSize = 6 / scale,
    controlIndexes = selected
      ? selected.points
          .map((_, i) => i)
          .filter(
            (i) =>
              i === 0 ||
              i === selected.points.length - 1 ||
              (editPoints &&
                i % Math.max(1, Math.ceil(selected.points.length / 12)) === 0),
          )
      : [];
  const empty =
    !project.photo && !project.arrows.length && !project.strokes.length;
  return (
    <section
      className={`stage tool-${tool}`}
      aria-label="사진과 화살표 작업 영역"
    >
      <div className="stage-top">
        <span>
          <span className="status-dot" />{" "}
          {project.photo ? "원본 사진" : "작업 캔버스"}{" "}
          <span className="stage-dim">
            {project.width.toLocaleString()} × {project.height.toLocaleString()}{" "}
            px
          </span>
        </span>
        <span className="locked">
          <LockKeyhole size={12} />
          {project.photo ? "사진 레이어 잠금" : "원본 좌표 유지"}
        </span>
      </div>
      <div
        className="viewport"
        ref={wrap}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => up(e)}
        onPointerCancel={(e) => up(e, true)}
      >
        <svg
          ref={svg}
          className="document-canvas"
          data-testid="canvas"
          aria-label="화살표 캔버스"
          viewBox={`0 0 ${project.width} ${project.height}`}
          width={project.width * scale}
          height={project.height * scale}
          style={{
            left: `calc(50% + ${view.x}px)`,
            top: `calc(50% + ${view.y}px)`,
          }}
        >
          <defs>
            <clipPath id="photo-clip">
              <rect width={project.width} height={project.height} />
            </clipPath>
          </defs>
          <g clipPath="url(#photo-clip)">
            <rect width={project.width} height={project.height} fill="white" />
            {project.photo && (
              <image
                href={project.photo.dataUrl}
                width={project.width}
                height={project.height}
                pointerEvents="none"
              />
            )}
            {compare !== "raw" &&
              project.arrows.map((a) => (
                <ArrowView
                  key={a.id}
                  arrow={preview?.id === a.id ? preview : a}
                  onPointerDown={(e) => beginDrag(e, a, "move")}
                />
              ))}
            {project.strokes
              .filter(
                (s) => compare !== "off" || project.pendingIds.includes(s.id),
              )
              .map((s) => (
                <path
                  key={s.id}
                  d={pathD(s.points)}
                  fill="none"
                  stroke={
                    project.pendingIds.includes(s.id) ? "#b57844" : "#c66355"
                  }
                  opacity={compare === "overlay" ? 0.55 : 0.85}
                  strokeWidth={3 / scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ))}
            {live.length > 1 && (
              <path
                d={pathD(live)}
                fill="none"
                stroke="#b57844"
                strokeWidth={3 / scale}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
          </g>
          {selected && sb && tool === "select" && compare !== "raw" && (
            <g className="selection">
              <rect
                x={sb.x - 15 / scale}
                y={sb.y - 15 / scale}
                width={sb.width + 30 / scale}
                height={sb.height + 30 / scale}
                fill="none"
                stroke="#488e79"
                strokeWidth={1 / scale}
                strokeDasharray={`${4 / scale} ${4 / scale}`}
                pointerEvents="none"
              />
              <line
                x1={sb.x + sb.width / 2}
                y1={sb.y - 15 / scale}
                x2={sb.x + sb.width / 2}
                y2={sb.y - 39 / scale}
                stroke="#488e79"
                strokeWidth={1 / scale}
              />
              <circle
                aria-label="회전 손잡이"
                cx={sb.x + sb.width / 2}
                cy={sb.y - 43 / scale}
                r={markerSize}
                fill="#488e79"
                stroke="white"
                strokeWidth={2 / scale}
                onPointerDown={(e) => beginDrag(e, selected, "rotate")}
              />
              <rect
                aria-label="크기 조절 손잡이"
                x={sb.x + sb.width + 11 / scale}
                y={sb.y + sb.height + 11 / scale}
                width={8 / scale}
                height={8 / scale}
                fill="#488e79"
                stroke="white"
                strokeWidth={1 / scale}
                onPointerDown={(e) => beginDrag(e, selected, "scale")}
              />
              {controlIndexes.map((i) => (
                <circle
                  key={i}
                  aria-label={
                    i === 0
                      ? "시작점"
                      : i === selected.points.length - 1
                        ? "끝점"
                        : `제어점 ${i}`
                  }
                  cx={selected.points[i].x}
                  cy={selected.points[i].y}
                  r={markerSize}
                  fill={i === 0 ? "#fff" : "#488e79"}
                  stroke={i === 0 ? "#488e79" : "white"}
                  strokeWidth={2 / scale}
                  onPointerDown={(e) => beginDrag(e, selected, "point", i)}
                />
              ))}
              {editPoints &&
                selected.heads.map((h) => {
                  const p = at(arrowPoints(selected), h.at).point;
                  return (
                    <rect
                      key={h.id}
                      aria-label="화살촉 위치 손잡이"
                      x={p.x - 5 / scale}
                      y={p.y - 5 / scale}
                      width={10 / scale}
                      height={10 / scale}
                      transform={`rotate(45 ${p.x} ${p.y})`}
                      fill="#d59a5d"
                      stroke="white"
                      strokeWidth={1.5 / scale}
                      onPointerDown={(e) =>
                        beginDrag(e, selected, "head", undefined, h.id)
                      }
                    />
                  );
                })}
            </g>
          )}
        </svg>
        {empty && (
          <div
            className="empty-canvas"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="empty-mark">
              <PenTool size={30} />
              <span>↗</span>
            </div>
            <span className="eyebrow">YOUR MOVEMENT, REFINED</span>
            <h2>사진 위에 움직임을 담아보세요</h2>
            <p>
              손으로 그린 선을 단정한 화살표로.
              <br />
              사진은 그대로, 움직임은 더 선명하게.
            </p>
            <button className="primary" onClick={onPhoto}>
              <ImagePlus size={17} />
              사진 불러오기
            </button>
            <button className="text-button" onClick={onDemo}>
              사진 없이 먼저 연습하기 →
            </button>
            <small>PNG, JPEG · 기기 안에서만 처리</small>
          </div>
        )}
        <div className="canvas-mode">
          <span>
            {tool === "select" ? (
              <MousePointer2 size={13} />
            ) : (
              <PenTool size={13} />
            )}
          </span>
          {tool === "path"
            ? "경로를 그리면 자동으로 화살촉이 붙어요"
            : tool === "recognize"
              ? "경로와 화살촉을 그린 뒤 ‘변환’을 눌러 주세요"
              : tool === "select"
                ? "화살표를 선택해 이동하거나 모양을 수정하세요"
                : "드래그로 화면 이동 · 두 손가락으로 확대"}
        </div>
      </div>
      <div className="stage-bottom">
        <span className="gesture-hint">
          {penOnly
            ? "펜·마우스 그리기 / 손가락 화면 이동"
            : "펜·마우스·손가락 그리기"}
          <span className="separator">·</span>사진 원본은 수정되지 않습니다
        </span>
        <div className="zoom-controls">
          <button
            aria-label="축소"
            onClick={() =>
              setView((v) => ({ ...v, zoom: clamp(v.zoom / 1.2, 0.2, 8) }))
            }
          >
            <Minus size={15} />
          </button>
          <span data-testid="zoom">{Math.round(view.zoom * 100)}%</span>
          <button
            aria-label="확대"
            onClick={() =>
              setView((v) => ({ ...v, zoom: clamp(v.zoom * 1.2, 0.2, 8) }))
            }
          >
            <Plus size={15} />
          </button>
          <button
            aria-label="화면에 맞춤"
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >
            <Expand size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
