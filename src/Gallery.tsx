import { ArrowUpRight, Check, MoveRight, RotateCcw } from "lucide-react";
import { samples } from "./samples";
import { ArrowView } from "./ArrowView";
export function Gallery({
  onUse,
  onBack,
}: {
  onUse: () => void;
  onBack: () => void;
}) {
  return (
    <div className="gallery">
      <div className="gallery-intro">
        <span className="eyebrow">VECTOR STUDY · 01</span>
        <h1>
          움직임은 그대로,
          <br />
          선은 더 단정하게.
        </h1>
        <p>
          같은 굵기와 비율로 만든 여덟 가지 벡터 화살표.
          <br />
          확대해 화살촉 접합과 곡선의 흐름을 살펴보세요.
        </p>
        <button className="primary" onClick={onUse}>
          연습 캔버스에서 편집 <ArrowUpRight size={18} />
        </button>
      </div>
      <div className="sample-grid">
        {samples().map((s, i) => (
          <article className="sample-card" key={s.title}>
            <div className="sample-index">
              {String(i + 1).padStart(2, "0")}
              <span>SVG</span>
            </div>
            <svg viewBox="0 0 285 220" aria-label={`${s.title} 화살표 샘플`}>
              <ArrowView arrow={s.arrow} />
            </svg>
            <h3>{s.title}</h3>
            <p>{s.subtitle}</p>
          </article>
        ))}
      </div>
      <div className="gallery-note">
        <Check size={18} />
        <span>
          모든 샘플은 실제 편집기와 같은 렌더러를 사용합니다. 외부 AI API를
          사용하지 않습니다.
        </span>
        <button className="text-button" onClick={onBack}>
          작업실로 <MoveRight size={16} />
        </button>
      </div>
      <div className="support-note">
        <RotateCcw size={18} />
        <p>
          <strong>인식 범위</strong> 경로별 직선·곡선·꺾임·반원·회전·물결 후보와
          분리해서 그린 V형 화살촉을 기하학적으로 분석합니다. 손글씨 전체의
          의미, 사진 속 몸의 방향과 깊이는 판단하지 않습니다. 겹친 경로의 반복
          횟수는 사용자가 지정합니다. 인식이 불확실하면 원본 비교 후 유형을
          선택하세요.
        </p>
      </div>
    </div>
  );
}
