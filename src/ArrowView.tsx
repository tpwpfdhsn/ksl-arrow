import type { Arrow } from "./model";
import { renderGeometry, repeatOffsets } from "./geometry";
export function ArrowView({
  arrow,
  onPointerDown,
}: {
  arrow: Arrow;
  onPointerDown?: React.PointerEventHandler<SVGGElement>;
}) {
  const g = renderGeometry(arrow),
    s = arrow.style;
  return (
    <g onPointerDown={onPointerDown} data-arrow-id={arrow.id}>
      {repeatOffsets(arrow).map((o, i) => (
        <g key={i} transform={`translate(${o.x} ${o.y})`}>
          {onPointerDown && (
            <path
              d={g.shaft}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(28, g.width + 18)}
              style={{ cursor: "pointer" }}
            />
          )}
          {s.outline && (
            <g
              fill={g.ribbon ? "white" : "none"}
              stroke="white"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path
                d={g.ribbon || g.shaft}
                strokeWidth={g.ribbon ? 7 : g.width + 8}
              />
              {g.heads.map((h) => (
                <path key={h.id} d={h.d} fill="white" strokeWidth={7} />
              ))}
            </g>
          )}
          {g.ribbon ? (
            <path d={g.ribbon} fill={s.color} />
          ) : (
            <path
              d={g.shaft}
              fill="none"
              stroke={s.color}
              strokeWidth={g.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={
                s.dashed ? `${g.width * 2.2} ${g.width * 1.8}` : undefined
              }
            />
          )}
          {g.heads.map((h) => (
            <path key={h.id} d={h.d} fill={s.color} stroke="none" />
          ))}
          {arrow.laps > 1 && (
            <text
              x={g.points[0].x + 16}
              y={g.points[0].y - 18}
              fill={s.color}
              stroke={s.outline ? "white" : "none"}
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={25}
              fontFamily="sans-serif"
              fontWeight={600}
            >
              ×{arrow.laps}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
