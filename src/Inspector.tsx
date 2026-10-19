import {
  ChevronDown,
  Copy,
  FlipHorizontal2,
  Layers2,
  Plus,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  Bookmark,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { Arrow, ArrowStyle, Kind } from "./model";
import { KIND_LABELS, uid } from "./model";
import { arrowPoints, transformArrow } from "./geometry";
import { normalize } from "./recognition";
export function Range({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>
          {Number(value.toFixed(1))}
          {unit}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function Inspector({
  arrow,
  style,
  onStyle,
  onArrow,
  onReverse,
  onDuplicate,
  onDelete,
  onLayer,
  onApplyStyle,
  onSaveDefault,
  controls,
  onControls,
}: {
  arrow?: Arrow;
  style: ArrowStyle;
  onStyle: (patch: Partial<ArrowStyle>) => void;
  onArrow: (a: Arrow) => void;
  onReverse: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (direction: number) => void;
  onApplyStyle: () => void;
  onSaveDefault: () => void;
  controls: boolean;
  onControls: () => void;
}) {
  return (
    <aside className="inspector" aria-label="화살표 속성">
      <div className="inspector-title">
        <SlidersHorizontal size={16} />
        <h2>{arrow ? "화살표 다듬기" : "나의 화살표 스타일"}</h2>
        <span className="small-badge">{arrow ? "선택됨" : "기본값"}</span>
      </div>
      <div className="inspector-body">
        {arrow ? (
          <>
            <section className="property-section">
              <div className="section-heading">
                <h3>형태와 방향</h3>
                <span>01</span>
              </div>
              <label className="field-label">
                화살표 유형
                <select
                  aria-label="화살표 유형"
                  value={arrow.kind}
                  onChange={(e) => {
                    const kind = e.target.value as Kind;
                    onArrow({
                      ...arrow,
                      kind,
                      points: normalize(
                        arrowPoints(arrow),
                        kind,
                        arrow.smoothing,
                      ),
                    });
                  }}
                >
                  {Object.entries(KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="paired-buttons">
                <button onClick={onReverse}>
                  <FlipHorizontal2 size={14} />
                  방향 반전
                </button>
                <button
                  className={controls ? "toggled" : ""}
                  onClick={onControls}
                >
                  제어점 {controls ? "숨기기" : "편집"}
                </button>
              </div>
              {["curve", "semicircle", "loop"].includes(arrow.kind) && (
                <Range
                  label="보정 강도"
                  value={arrow.smoothing * 100}
                  onChange={(v) => onArrow({ ...arrow, smoothing: v / 100 })}
                  min={0}
                  max={100}
                  unit="%"
                />
              )}
              <p className="property-note">
                끝점은 캔버스의 원으로, 크기와 회전은 사각·상단 손잡이로
                조절하세요.
              </p>
              <div className="transform-buttons">
                <button
                  title="10% 작게"
                  onClick={() => onArrow(transformArrow(arrow, 0.9, 0))}
                >
                  90%
                </button>
                <button
                  title="10% 크게"
                  onClick={() => onArrow(transformArrow(arrow, 1.1, 0))}
                >
                  110%
                </button>
                <button
                  title="왼쪽으로 15도"
                  onClick={() => onArrow(transformArrow(arrow, 1, -15))}
                >
                  <RotateCcw size={14} />
                  15°
                </button>
                <button
                  title="오른쪽으로 15도"
                  onClick={() => onArrow(transformArrow(arrow, 1, 15))}
                >
                  <RotateCw size={14} />
                  15°
                </button>
              </div>
              {arrow.kind === "wave" && (
                <>
                  <Range
                    label="물결 횟수"
                    value={arrow.waveCount}
                    min={0.5}
                    max={12}
                    step={0.5}
                    onChange={(v) => onArrow({ ...arrow, waveCount: v })}
                  />
                  <Range
                    label="물결 진폭"
                    value={arrow.waveAmplitude}
                    min={1}
                    max={Math.max(200, arrow.waveAmplitude)}
                    unit=" px"
                    onChange={(v) => onArrow({ ...arrow, waveAmplitude: v })}
                  />
                </>
              )}
              {arrow.kind === "loop" && (
                <label className="field-label">
                  명시적 회전 반복 횟수
                  <input
                    aria-label="회전 반복 횟수"
                    type="number"
                    min="1"
                    max="20"
                    value={arrow.laps}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isInteger(v) && v >= 1 && v <= 20)
                        onArrow({ ...arrow, laps: v });
                    }}
                  />
                  <small>
                    횟수는 ×N으로 표시합니다. 겹친 획을 자동 삭제하거나 횟수를
                    추측하지 않습니다.
                  </small>
                </label>
              )}
            </section>
          </>
        ) : (
          <div className="no-selection">
            <div className="selection-symbol">↗</div>
            <p>그리기 전에 스타일을 고르세요.</p>
            <small>
              화살표를 선택하면 모양과 방향도
              <br />
              세밀하게 수정할 수 있어요.
            </small>
          </div>
        )}
        <section className="property-section">
          <div className="section-heading">
            <h3>선과 화살촉</h3>
            <span>{arrow ? "02" : "01"}</span>
          </div>
          <div className="color-row">
            <span>선 색상</span>
            <div className="color-swatches">
              {["#202a28", "#ffffff", "#c45d4c", "#315f9d", "#37745f"].map(
                (c) => (
                  <button
                    key={c}
                    aria-label={`색상 ${c}`}
                    className={style.color === c ? "chosen" : ""}
                    style={{ background: c }}
                    onClick={() => onStyle({ color: c })}
                  />
                ),
              )}
              <input
                aria-label="사용자 지정 색상"
                type="color"
                value={style.color}
                onChange={(e) => onStyle({ color: e.target.value })}
              />
            </div>
          </div>
          <Range
            label="선 굵기"
            value={style.width}
            min={2}
            max={36}
            unit=" px"
            onChange={(v) => onStyle({ width: v })}
          />
          <Range
            label="화살촉 크기"
            value={style.headScale}
            min={1.5}
            max={6}
            step={0.1}
            unit="×"
            onChange={(v) => onStyle({ headScale: v })}
          />
          <Range
            label="화살촉 벌어짐"
            value={style.headAngle}
            min={15}
            max={48}
            unit="°"
            onChange={(v) => onStyle({ headAngle: v })}
          />
          <label className="toggle-row">
            <span>
              흰색 외곽선<small>사진 위에서 더 또렷하게</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="흰색 외곽선"
              checked={style.outline}
              onChange={(e) => onStyle({ outline: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>점선</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="점선"
              checked={style.dashed}
              disabled={!!arrow && arrow.perspective !== "none"}
              onChange={(e) => onStyle({ dashed: e.target.checked })}
            />
          </label>
          {arrow?.perspective !== "none" && arrow && (
            <p className="property-note">원근 리본은 실선으로 표시됩니다.</p>
          )}
          <button className="full subtle" onClick={onSaveDefault}>
            <Bookmark size={14} />이 스타일을 기본값으로 저장
          </button>
          {arrow && (
            <button className="full text-button" onClick={onApplyStyle}>
              다른 모든 화살표에 스타일 적용
            </button>
          )}
        </section>
        {arrow && (
          <>
            <details className="property-section" open>
              <summary>
                <span>
                  화살촉 위치 <b>{arrow.heads.length}</b>
                </span>
                <ChevronDown size={14} />
              </summary>
              {arrow.heads.map((h, i) => (
                <div className="head-editor" key={h.id}>
                  <div className="head-title">
                    <span>화살촉 {i + 1}</span>
                    <button
                      aria-label={`화살촉 ${i + 1} 방향 바꾸기`}
                      onClick={() =>
                        onArrow({
                          ...arrow,
                          heads: arrow.heads.map((x) =>
                            x.id === h.id
                              ? { ...x, direction: x.direction === 1 ? -1 : 1 }
                              : x,
                          ),
                        })
                      }
                    >
                      {h.direction === 1 ? "순방향 →" : "← 역방향"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`화살촉 ${i + 1} 삭제`}
                      onClick={() =>
                        onArrow({
                          ...arrow,
                          heads: arrow.heads.filter((x) => x.id !== h.id),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <Range
                    label={`화살촉 ${i + 1} 위치`}
                    value={h.at * 100}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) =>
                      onArrow({
                        ...arrow,
                        heads: arrow.heads.map((x) =>
                          x.id === h.id ? { ...x, at: v / 100 } : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <button
                className="full subtle"
                disabled={arrow.heads.length >= 20}
                onClick={() =>
                  onArrow({
                    ...arrow,
                    heads: [
                      ...arrow.heads,
                      {
                        id: uid(),
                        at: arrow.heads.length ? 0.5 : 1,
                        direction: 1,
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                화살촉 추가
              </button>
              <p className="property-note">
                양방향: 위치 0%에 역방향, 100%에 순방향 화살촉을 놓으세요.
              </p>
            </details>
            <details className="property-section">
              <summary>
                <span>반복과 원근</span>
                <ChevronDown size={14} />
              </summary>
              <Range
                label="분리된 화살표 개수"
                value={arrow.repeatCount}
                min={1}
                max={12}
                onChange={(v) => onArrow({ ...arrow, repeatCount: v })}
              />
              {arrow.repeatCount > 1 && (
                <Range
                  label="반복 간격"
                  value={arrow.repeatGap}
                  min={0}
                  max={400}
                  unit=" px"
                  onChange={(v) => onArrow({ ...arrow, repeatGap: v })}
                />
              )}
              <p className="property-note">
                → →처럼 분리된 화살표를 만듭니다. 하나의 선에 촉을 추가하는
                기능과 구분됩니다.
              </p>
              <label className="field-label">
                원근 표현
                <select
                  aria-label="원근 표현"
                  value={arrow.perspective}
                  onChange={(e) =>
                    onArrow({
                      ...arrow,
                      perspective: e.target.value as Arrow["perspective"],
                    })
                  }
                >
                  <option value="none">일정한 폭 · 원근 없음</option>
                  <option value="toward">화면 앞으로 · 점점 굵게</option>
                  <option value="away">화면 뒤로 · 점점 가늘게</option>
                </select>
              </label>
              <p className="property-note">
                몸 안팎의 의미나 깊이는 판단하지 않습니다. 시작점·끝점·방향을
                직접 지정하세요.
              </p>
            </details>
            <section className="property-section object-actions">
              <div className="section-heading">
                <h3>선택한 화살표</h3>
                <Layers2 size={14} />
              </div>
              <div className="paired-buttons">
                <button onClick={onDuplicate}>
                  <Copy size={14} />
                  복제
                </button>
                <button className="danger" onClick={onDelete}>
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
              <div className="paired-buttons">
                <button onClick={() => onLayer(-1)}>
                  <ArrowDown size={14} />한 단계 뒤로
                </button>
                <button onClick={() => onLayer(1)}>
                  <ArrowUp size={14} />한 단계 앞으로
                </button>
              </div>
            </section>
          </>
        )}
      </div>
      <div className="inspector-footer">
        <span className="status-dot" /> 벡터 방식 · 압력과 무관한 일정한 굵기
      </div>
    </aside>
  );
}
