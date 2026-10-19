import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CornerUpRight,
  Download,
  FileJson,
  FolderOpen,
  Hand,
  ImagePlus,
  Layers2,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Plus,
  Redo2,
  Save,
  ScanLine,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { KIND_LABELS, emptyProject, uid } from "./model";
import type { Arrow, ArrowStyle, Kind, Project, Stroke } from "./model";
import { arrowPoints, moveArrow, reverseArrow } from "./geometry";
import { analyze, normalize, pathToArrow, recognize } from "./recognition";
import {
  clearDraft,
  loadDraft,
  loadImage,
  parseProject,
  readDefaultStyle,
  readFileDataURL,
  saveDraft,
} from "./storage";
import { download, pngBlob, safeName, svgString } from "./export";
import { useHistory } from "./useHistory";
import { Stage } from "./Stage";
import type { Tool } from "./Stage";
import { Inspector } from "./Inspector";
import { Gallery } from "./Gallery";
import { demoProject } from "./samples";
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const useful = (p: Project) =>
  !!p.photo || p.arrows.length > 0 || p.strokes.length > 0;
export default function App() {
  const { project, commit, undo, redo, canUndo, canRedo } =
    useHistory(emptyProject());
  const [page, setPage] = useState<"editor" | "samples">("editor"),
    [tool, setTool] = useState<Tool>("path"),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaultStyle, setDefaultStyle] = useState(readDefaultStyle),
    [penOnly, setPenOnly] = useState(true),
    [compare, setCompare] = useState<"off" | "overlay" | "raw">("off"),
    [controls, setControls] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(true);
  const [forcedKind, setForcedKind] = useState<"auto" | Kind>("auto"),
    [notice, setNotice] = useState(""),
    [analysisNote, setAnalysisNote] = useState(""),
    [candidates, setCandidates] = useState<Kind[]>([]);
  const [dialog, setDialog] = useState<"export" | "help" | null>(null),
    [format, setFormat] = useState<
      "combined" | "transparent" | "svg" | "project"
    >("combined"),
    [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false),
    [recovery, setRecovery] = useState<Project | null>(null),
    [saveStatus, setSaveStatus] = useState("임시 저장 준비 중");
  const photoInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const selected = project.arrows.find((a) => a.id === selectedId),
    style = selected?.style || defaultStyle;
  function tell(message: string) {
    setNotice(message);
  }
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    let cancelled = false;
    loadDraft()
      .then((p) => {
        if (cancelled) return;
        if (p && useful(p)) setRecovery(p);
        else setDraftReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setDraftReady(true);
          setSaveStatus("임시 저장을 사용할 수 없음");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    let active = true;
    setSaveStatus("저장 중…");
    const timer = setTimeout(
      () =>
        saveDraft(project)
          .then(() => {
            if (active) setSaveStatus("이 기기에 임시 저장됨");
          })
          .catch(() => {
            if (active) setSaveStatus("임시 저장 실패 · 프로젝트로 저장하세요");
          }),
      700,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project, draftReady]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (useful(project)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [project]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea,dialog"))
        return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        if (e.key === "y") {
          e.preventDefault();
          redo();
        }
        if (e.key === "s") {
          e.preventDefault();
          saveProject();
        }
        if (e.key === "d" && selected) {
          e.preventDefault();
          duplicate();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === "v") setTool("select");
      else if (e.key === "h") setTool("pan");
      else if (e.key === "p") setTool("path");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function setArrow(a: Arrow) {
    commit((p) => ({
      ...p,
      arrows: p.arrows.map((x) => (x.id === a.id ? a : x)),
    }));
  }
  function onStyle(patch: Partial<ArrowStyle>) {
    if (selected)
      setArrow({ ...selected, style: { ...selected.style, ...patch } });
    else setDefaultStyle((s) => ({ ...s, ...patch }));
  }
  function saveProject() {
    download(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      safeName(project.name) + ".gyeol.json",
    );
    tell("사진·원본 획·편집 데이터가 포함된 프로젝트를 저장했습니다.");
  }
  function deleteSelected() {
    if (!selected) return;
    commit((p) => ({
      ...p,
      arrows: p.arrows.filter((a) => a.id !== selected.id),
    }));
    setSelectedId(null);
  }
  function duplicate() {
    if (!selected) return;
    const a = {
      ...moveArrow(selected, 35, 35),
      id: uid(),
      name: selected.name + " 복사",
      heads: selected.heads.map((h) => ({ ...h, id: uid() })),
    };
    commit((p) => ({ ...p, arrows: [...p.arrows, a] }));
    setSelectedId(a.id);
  }
  function resetTo(next: Project) {
    if (
      useful(project) &&
      !window.confirm(
        "현재 작업을 바꾸시겠어요? 저장하지 않았다면 먼저 프로젝트로 저장해 주세요. 변경 후에도 실행 취소로 돌아갈 수 있습니다.",
      )
    )
      return false;
    commit(next);
    setSelectedId(null);
    setCompare("off");
    setAnalysisNote("");
    setCandidates([]);
    setPage("editor");
    return true;
  }
  function demo() {
    if (resetTo(demoProject())) {
      setTool("select");
      tell("8가지 샘플을 자유롭게 편집해 보세요.");
    }
  }
  async function openPhoto(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      tell("PNG 또는 JPEG 사진을 선택해 주세요.");
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      tell("80 MB 이하의 사진을 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readFileDataURL(file),
        image = await loadImage(dataUrl);
      if (image.naturalWidth > 32000 || image.naturalHeight > 32000)
        throw Error("한 변이 32,000 px 이하인 사진을 선택해 주세요.");
      const next = {
        ...emptyProject(),
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 180) + "의 움직임",
        width: image.naturalWidth,
        height: image.naturalHeight,
        photo: { dataUrl, name: file.name.slice(0, 200) },
      };
      if (resetTo(next)) {
        setTool("path");
        tell(
          `원본 ${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px 사진을 불러왔습니다.`,
        );
      }
    } catch (e) {
      tell(e instanceof Error ? e.message : "사진을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function openProject(file?: File) {
    if (!file) return;
    if (file.size > 120 * 1024 * 1024) {
      tell("프로젝트 파일이 너무 큽니다. 120 MB 이하 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const p = parseProject(await file.text());
      if (p.photo) {
        const image = await loadImage(p.photo.dataUrl);
        if (image.naturalWidth !== p.width || image.naturalHeight !== p.height)
          throw Error(
            "사진의 원본 크기와 프로젝트 캔버스 크기가 일치하지 않습니다.",
          );
      }
      if (resetTo(p)) {
        setTool("select");
        tell("편집 가능한 프로젝트를 열었습니다.");
      }
    } catch (e) {
      tell(e instanceof Error ? e.message : "프로젝트를 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  function receiveStroke(s: Stroke) {
    if (project.strokes.length >= 3000) {
      tell(
        "이 프로젝트의 최대 원본 획 수(3,000)에 도달했습니다. 새 프로젝트에서 이어 주세요.",
      );
      return;
    }
    if (tool === "recognize") {
      commit((p) => ({
        ...p,
        strokes: [...p.strokes, s],
        pendingIds: [...p.pendingIds, s.id],
      }));
      return;
    }
    if (project.arrows.length >= 300) {
      tell("한 프로젝트에 화살표를 최대 300개까지 넣을 수 있습니다.");
      return;
    }
    const r = pathToArrow(
      s,
      defaultStyle,
      forcedKind === "auto" ? undefined : forcedKind,
    );
    commit((p) => ({
      ...p,
      strokes: [...p.strokes, s],
      arrows: [...p.arrows, r.arrow],
    }));
    setSelectedId(r.arrow.id);
    setAnalysisNote(r.analysis.note);
    setCandidates(r.analysis.candidates);
  }
  function convert() {
    const input = project.strokes.filter((s) =>
      project.pendingIds.includes(s.id),
    );
    if (!input.length) return;
    const result = recognize(
      input,
      defaultStyle,
      forcedKind === "auto" ? undefined : forcedKind,
    );
    if (!result.arrows.length) {
      tell("너무 짧은 획입니다. 경로를 조금 더 길게 그려 주세요.");
      return;
    }
    if (project.arrows.length + result.arrows.length > 300) {
      tell("화살표 수가 300개를 넘습니다. 입력을 나누어 작업해 주세요.");
      return;
    }
    commit((p) => ({
      ...p,
      arrows: [...p.arrows, ...result.arrows],
      pendingIds: [],
    }));
    setSelectedId(result.arrows[0].id);
    setTool("select");
    setAnalysisNote(
      `${result.arrows.length}개 경로 · ${result.arrows.reduce((n, a) => n + a.heads.length, 0)}개 화살촉. ${result.warnings.join(" ")}`,
    );
    setCandidates(result.analyses[0]?.candidates || []);
    tell("변환했습니다. 원본 비교로 방향과 개수를 확인해 주세요.");
  }
  function applyCandidate(kind: Kind) {
    if (!selected) return;
    const ps = arrowPoints(selected),
      analysis = analyze(ps, selected.style.width);
    setArrow({
      ...selected,
      kind,
      points: normalize(ps, kind, selected.smoothing),
      waveCount: analysis.waveCount,
      waveAmplitude: analysis.amplitude,
      waveSign: analysis.sign,
    });
  }
  async function exportFile() {
    setBusy(true);
    try {
      const name = safeName(project.name);
      if (format === "project") saveProject();
      else if (format === "svg") {
        download(
          new Blob([svgString(project)], {
            type: "image/svg+xml;charset=utf-8",
          }),
          name + "-화살표.svg",
        );
      } else {
        const blob = await pngBlob(project, format === "combined");
        download(
          blob,
          name + (format === "combined" ? "-합성" : "-투명") + ".png",
        );
      }
      setDialog(null);
      if (format !== "project")
        tell(
          `${project.width.toLocaleString()} × ${project.height.toLocaleString()} px 원본 좌표로 내보냈습니다.`,
        );
    } catch (e) {
      tell(
        e instanceof Error
          ? e.message
          : "내보내지 못했습니다. SVG 또는 프로젝트 형식을 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recover(restore: boolean) {
    if (restore && recovery) {
      commit(recovery);
      setTool("select");
      tell("이 기기에 저장된 작업을 복구했습니다.");
    } else {
      try {
        await clearDraft();
      } catch {
        /* Next autosave reports storage failures. */
      }
    }
    setRecovery(null);
    setDraftReady(true);
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          aria-label="결 작업실"
          onClick={() => setPage("editor")}
        >
          <span className="brand-icon">
            <CornerUpRight size={24} strokeWidth={2.5} />
          </span>
          <span className="brand-word">
            결<small>움직임을 다듬다</small>
          </span>
        </button>
        <div className="header-divider" />
        <nav aria-label="주 메뉴">
          <button
            className={page === "editor" ? "active" : ""}
            onClick={() => setPage("editor")}
          >
            작업실
          </button>
          <button
            className={page === "samples" ? "active" : ""}
            onClick={() => setPage("samples")}
          >
            화살표 샘플
            <span className="nav-dot" />
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button help-button"
            aria-label="사용 안내"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="프로젝트 열기"
            onClick={() => projectInput.current?.click()}
          >
            <FolderOpen size={19} />
          </button>
          <button className="save-project" onClick={saveProject}>
            <Save size={16} />
            <span>프로젝트 저장</span>
          </button>
          <button className="primary" onClick={() => setDialog("export")}>
            <ArrowDownToLine size={16} />
            <span>내보내기</span>
          </button>
        </div>
      </header>
      <input
        ref={photoInput}
        data-testid="photo-input"
        className="hidden-input"
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => {
          openPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        data-testid="project-input"
        className="hidden-input"
        type="file"
        accept=".json,.gyeol.json,application/json"
        onChange={(e) => {
          openProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {page === "samples" ? (
        <main className="gallery-page">
          <Gallery onUse={demo} onBack={() => setPage("editor")} />
        </main>
      ) : (
        <main className="editor-page">
          <div className="project-heading">
            <div>
              <span className="eyebrow">SIGN LANGUAGE · MOTION STUDIO</span>
              <div className="project-title">
                <input
                  aria-label="프로젝트 이름"
                  value={project.name}
                  maxLength={200}
                  onChange={(e) =>
                    commit((p) => ({ ...p, name: e.target.value }))
                  }
                />
                <span className="draft-badge">작업 중</span>
              </div>
            </div>
            <div className="project-meta">
              <span
                className={saveStatus.includes("실패") ? "save-warning" : ""}
              >
                <CheckCircle2 size={13} />
                {saveStatus}
              </span>
              <button onClick={() => photoInput.current?.click()}>
                <ImagePlus size={16} />
                {project.photo ? "사진 교체" : "사진 불러오기"}
              </button>
            </div>
          </div>
          <div className="workflow">
            <span className={project.photo ? "done" : "current"}>
              <b>{project.photo ? <Check size={11} /> : "01"}</b>사진 불러오기
            </span>
            <ChevronRight size={13} />
            <span className={project.arrows.length ? "done" : "current"}>
              <b>02</b>움직임 그리기
            </span>
            <ChevronRight size={13} />
            <span>
              <b>03</b>모양 다듬기
            </span>
            <ChevronRight size={13} />
            <span>
              <b>04</b>원본 크기로 저장
            </span>
            <span className="private-note">
              <LockIcon />
              사진은 서버로 전송되지 않아요
            </span>
          </div>
          <div className="workbench">
            <div className="canvas-column">
              <div className="editor-toolbar">
                <div className="input-tabs" role="group" aria-label="입력 방식">
                  <button
                    className={tool === "path" ? "active" : ""}
                    onClick={() => setTool("path")}
                  >
                    <PenTool size={15} />
                    경로 그리기
                  </button>
                  <button
                    className={tool === "recognize" ? "active" : ""}
                    onClick={() => setTool("recognize")}
                  >
                    <ScanLine size={15} />
                    화살표 인식
                  </button>
                </div>
                <select
                  aria-label="입력 유형 지정"
                  className="kind-select"
                  value={forcedKind}
                  onChange={(e) =>
                    setForcedKind(e.target.value as Kind | "auto")
                  }
                >
                  <option value="auto">유형 자동 감지</option>
                  {Object.entries(KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}로 정리
                    </option>
                  ))}
                </select>
                <div className="toolbar-spacer" />
                {project.pendingIds.length > 0 && (
                  <button className="primary convert-button" onClick={convert}>
                    <Sparkles size={14} />
                    변환 <b>{project.pendingIds.length}</b>
                  </button>
                )}
                <button
                  className={`compare-button ${compare !== "off" ? "toggled" : ""}`}
                  onClick={() =>
                    setCompare((c) =>
                      c === "off" ? "overlay" : c === "overlay" ? "raw" : "off",
                    )
                  }
                >
                  <Layers2 size={15} />
                  {compare === "off"
                    ? "원본 비교"
                    : compare === "overlay"
                      ? "원본 겹쳐 보기"
                      : "손그림만 보기"}
                </button>
                <button
                  className="icon-button sidebar-toggle"
                  aria-label="속성 패널 표시"
                  onClick={() => setInspectorOpen((v) => !v)}
                >
                  {inspectorOpen ? (
                    <PanelRightClose size={16} />
                  ) : (
                    <PanelRightOpen size={16} />
                  )}
                </button>
              </div>
              {project.pendingIds.length > 0 && (
                <div className="pending-bar">
                  <span>
                    인식 대기 중 <strong>{project.pendingIds.length}획</strong>{" "}
                    · 화살촉까지 충분히 그린 후 변환하세요. 시간 제한이
                    없습니다.
                  </span>
                  <button
                    className="text-button"
                    onClick={() => commit((p) => ({ ...p, pendingIds: [] }))}
                  >
                    입력 취소
                  </button>
                </div>
              )}
              <div className="stage-row">
                <div className="tools-rail">
                  <button
                    aria-label="선택·이동"
                    title="선택·이동 (V)"
                    className={tool === "select" ? "active" : ""}
                    onClick={() => setTool("select")}
                  >
                    <MousePointer2 size={19} />
                  </button>
                  <button
                    aria-label="경로 그리기 도구"
                    title="경로 그리기 (P)"
                    className={tool === "path" ? "active" : ""}
                    onClick={() => setTool("path")}
                  >
                    <PenTool size={19} />
                  </button>
                  <button
                    aria-label="화살표 인식 도구"
                    title="화살표 인식"
                    className={tool === "recognize" ? "active" : ""}
                    onClick={() => setTool("recognize")}
                  >
                    <ScanLine size={19} />
                  </button>
                  <button
                    aria-label="화면 이동"
                    title="화면 이동 (H)"
                    className={tool === "pan" ? "active" : ""}
                    onClick={() => setTool("pan")}
                  >
                    <Hand size={19} />
                  </button>
                  <div className="rail-divider" />
                  <button
                    aria-label="실행 취소"
                    title="실행 취소 (⌘/Ctrl+Z)"
                    disabled={!canUndo}
                    onClick={undo}
                  >
                    <Undo2 size={18} />
                  </button>
                  <button
                    aria-label="다시 실행"
                    title="다시 실행 (⌘/Ctrl+Shift+Z)"
                    disabled={!canRedo}
                    onClick={redo}
                  >
                    <Redo2 size={18} />
                  </button>
                  <div className="rail-spacer" />
                  <button
                    aria-label="새 작업"
                    title="새 작업"
                    onClick={() => resetTo(emptyProject())}
                  >
                    <Plus size={19} />
                  </button>
                </div>
                <Stage
                  project={project}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  tool={tool}
                  penOnly={penOnly}
                  compare={compare}
                  editPoints={controls}
                  onStroke={receiveStroke}
                  onArrow={setArrow}
                  onPhoto={() => photoInput.current?.click()}
                  onDemo={demo}
                />
              </div>
              <div className="under-canvas">
                <label>
                  <input
                    type="checkbox"
                    checked={penOnly}
                    onChange={(e) => setPenOnly(e.target.checked)}
                  />
                  펜 전용 그리기 <span>마우스도 사용 가능</span>
                </label>
                <span>
                  <b>{project.arrows.reduce((n, a) => n + a.repeatCount, 0)}</b>{" "}
                  화살표 <i>·</i>{" "}
                  <b>
                    {project.arrows.reduce(
                      (n, a) => n + a.heads.length * a.repeatCount,
                      0,
                    )}
                  </b>{" "}
                  화살촉
                </span>
              </div>
              {analysisNote ? (
                <div className="analysis-note">
                  <Sparkles size={16} />
                  <div>
                    <strong>정리 결과를 확인해 주세요</strong>
                    <p>{analysisNote}</p>
                    {selected && candidates.length > 0 && (
                      <div className="candidate-list">
                        <span>다른 후보</span>
                        {candidates.map((k) => (
                          <button
                            className={selected.kind === k ? "active" : ""}
                            key={k}
                            onClick={() => applyCandidate(k)}
                          >
                            {KIND_LABELS[k]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="결과 안내 닫기"
                    onClick={() => {
                      setAnalysisNote("");
                      setCandidates([]);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="editor-tip">
                  <span className="tip-icon">✦</span>
                  <p>
                    <strong>움직임의 의미는 그대로.</strong> 물결과 회전은
                    형태별로 정리하고, 반복 횟수는 직접 지정해요.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setPage("samples")}
                  >
                    샘플 살펴보기 <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            {inspectorOpen && (
              <Inspector
                arrow={selected}
                style={style}
                onStyle={onStyle}
                onArrow={setArrow}
                onReverse={() => selected && setArrow(reverseArrow(selected))}
                onDuplicate={duplicate}
                onDelete={deleteSelected}
                onLayer={(direction) => {
                  if (!selected) return;
                  commit((p) => {
                    const arrows = [...p.arrows],
                      i = arrows.findIndex((a) => a.id === selected.id),
                      j = Math.max(
                        0,
                        Math.min(arrows.length - 1, i + direction),
                      );
                    [arrows[i], arrows[j]] = [arrows[j], arrows[i]];
                    return { ...p, arrows };
                  });
                }}
                onApplyStyle={() => {
                  if (selected) {
                    commit((p) => ({
                      ...p,
                      arrows: p.arrows.map((a) => ({
                        ...a,
                        style: { ...selected.style },
                      })),
                    }));
                    tell("선택한 스타일을 모든 화살표에 적용했습니다.");
                  }
                }}
                onSaveDefault={() => {
                  try {
                    localStorage.setItem("gyeol-style", JSON.stringify(style));
                    setDefaultStyle({ ...style });
                    tell(
                      "다음 화살표와 다음 방문에 사용할 기본 스타일을 저장했습니다.",
                    );
                  } catch {
                    tell("이 브라우저에서 기본 스타일을 저장할 수 없습니다.");
                  }
                }}
                controls={controls}
                onControls={() => {
                  setControls((v) => !v);
                  setTool("select");
                }}
              />
            )}
          </div>
        </main>
      )}
      <footer className="app-footer">
        <span>
          결 <i>—</i> 손의 언어를 위한 작은 도구
        </span>
        <span>외부 AI 없이 · 기기 안에서 처리 · SVG 벡터</span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button
            aria-label="알림 닫기"
            className="icon-button"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {busy && dialog !== "export" && (
        <div className="busy-indicator" role="status">
          <LoaderCircle className="spin" size={20} />
          파일 처리 중…
        </div>
      )}
      {dialog === "export" && (
        <Modal
          title="움직임을 파일로 저장"
          onClose={() => !busy && setDialog(null)}
        >
          <div className="export-resolution">
            <Maximize2 size={20} />
            <div>
              <strong>
                {project.width.toLocaleString()} ×{" "}
                {project.height.toLocaleString()} px
              </strong>
              <span>원본 캔버스 크기 · 확대 배율과 무관</span>
            </div>
            <span className="small-badge">1:1 출력</span>
          </div>
          <div className="export-options">
            {(
              [
                [
                  "combined",
                  "사진 + 화살표",
                  "PNG",
                  project.photo
                    ? "원본 사진에 화살표를 합쳐 저장"
                    : "사진 없음 · 화살표만 투명 배경에 저장",
                ],
                [
                  "transparent",
                  "화살표만 · 투명 배경",
                  "PNG",
                  "원본과 같은 캔버스 크기와 좌표 유지",
                ],
                [
                  "svg",
                  "편집 가능한 벡터",
                  "SVG",
                  "사진 없이 화살표만 · 원본 좌표 유지",
                ],
                [
                  "project",
                  "이어서 편집할 프로젝트",
                  "JSON",
                  "사진·원본 획·화살표·스타일 모두 포함",
                ],
              ] as const
            ).map(([key, title, ext, desc]) => (
              <label
                className={`export-option ${format === key ? "chosen" : ""}`}
                key={key}
              >
                <input
                  type="radio"
                  name="format"
                  value={key}
                  checked={format === key}
                  onChange={() => setFormat(key)}
                />
                <div>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </div>
                <span>{ext}</span>
              </label>
            ))}
          </div>
          {project.pendingIds.length > 0 && (
            <p className="export-warning">
              변환하지 않은 {project.pendingIds.length}획은 PNG·SVG에 포함되지
              않습니다. 프로젝트 파일에는 보존됩니다.
            </p>
          )}
          <p className="modal-note">
            해상도를 인위적으로 늘리지 않습니다. 캔버스 바깥의 부분은 PNG·SVG
            출력에서 잘립니다. 편집을 이어가려면 프로젝트도 저장해 두세요.
          </p>
          <button
            className="primary full export-submit"
            disabled={busy}
            onClick={exportFile}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Download size={17} />
            )}{" "}
            {busy ? "내보내는 중…" : "파일 내보내기"}
          </button>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="결, 이렇게 사용하세요" onClose={() => setDialog(null)}>
          <div className="help-content">
            <ol>
              <li>
                <strong>사진을 불러오세요.</strong>
                <p>
                  PNG·JPEG 원본 비율과 해상도를 유지합니다. 사진은 잠긴
                  배경으로만 사용해요.
                </p>
              </li>
              <li>
                <strong>움직임을 그리세요.</strong>
                <p>
                  ‘경로 그리기’는 획 끝에 화살촉을 붙입니다. ‘화살표 인식’은
                  경로와 V형 화살촉을 여러 획으로 그린 후 ‘변환’을 누르세요.
                  시간이 지나도 자동으로 입력을 끝내지 않습니다.
                </p>
              </li>
              <li>
                <strong>원본과 비교하며 다듬으세요.</strong>
                <p>
                  선택 도구로 이동·크기·회전을 조절하고, 제어점 편집으로 끝점과
                  화살촉 위치를 바꾸세요. 애매한 유형은 후보나 유형 선택으로
                  지정하세요. 원본 획은 변환 후에도 보존됩니다.
                </p>
              </li>
              <li>
                <strong>원본 크기로 저장하세요.</strong>
                <p>
                  합성 PNG, 투명 PNG, SVG를 제공합니다. 투명 파일도 사진과 같은
                  크기·좌표를 유지합니다. 프로젝트는 사진과 편집 데이터를 함께
                  담습니다.
                </p>
              </li>
            </ol>
            <h3>지원 범위와 주의점</h3>
            <p>
              기하학적 규칙으로 직선·곡선·꺾임·반원·회전·물결과 분리된 V형
              화살촉을 분석합니다. 복잡하게 겹친 획, 채워진 손그림 화살촉, 여러
              경로가 같은 끝점에 모이는 입력은 잘못 연결될 수 있습니다. 완벽한
              인식은 제공하지 않으며, 원본 비교·실행 취소·수동 유형 및 화살촉
              편집으로 보완하세요.
            </p>
            <p>
              반복 화살표, 한 선의 여러 촉, 같은 경로의 회전 반복은 별도
              데이터입니다. 겹친 획은 임의 삭제하지 않으며 회전 반복 횟수는 직접
              지정해 ×N으로 표시합니다. 두 개의 왕복 경로는 각각 그리세요.
              사진에서 몸 안팎의 의미나 깊이를 추정하지 않습니다.
            </p>
            <p>
              아이패드는 Pointer Events 기반 펜 입력을 지원하도록 구현했습니다.
              손바닥 차단은 기기·Safari 동작에 따라 달라집니다. ‘펜 전용 그리기’
              또는 ‘화면 이동’을 사용하세요. 실제 아이패드 실기기 검증은 아직
              하지 않았습니다.
            </p>
            <p>
              자동 임시 저장은 이 브라우저의 IndexedDB에만 저장하며, 시크릿
              모드·저장 공간 부족·브라우저 데이터 삭제로 사라질 수 있습니다.
              중요한 작업은 프로젝트 파일로도 저장하세요.
            </p>
            <div className="shortcut-row">
              <kbd>P</kbd>그리기<kbd>V</kbd>선택<kbd>H</kbd>화면 이동
              <kbd>⌘ / Ctrl Z</kbd>실행 취소
            </div>
          </div>
        </Modal>
      )}
      {recovery && (
        <Modal
          title="이전 작업이 남아 있어요"
          onClose={() => {
            recover(true);
          }}
        >
          <div className="recovery-content">
            <div className="recovery-icon">
              <FileJson size={32} />
            </div>
            <h3>{recovery.name}</h3>
            <p>
              {recovery.width.toLocaleString()} ×{" "}
              {recovery.height.toLocaleString()} px · 화살표{" "}
              {recovery.arrows.length}개<br />이 기기에 임시 저장된 편집을
              이어갈 수 있어요.
            </p>
            <button className="primary full" onClick={() => recover(true)}>
              이전 작업 복구
            </button>
            <button className="text-button full" onClick={() => recover(false)}>
              임시 저장을 지우고 새로 시작
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" />
    </svg>
  );
}
