import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { cancelJob, fileUrl, getJob, getJobInput } from "../../api/jobs";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { PhylogeneticTreePreview, type PhylogeneticTreePreviewHandle, type TreeAnnotation, type TreeLabelOverride } from "../../shared/components/PhylogeneticTreePreview";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import { ToolRunStatus } from "../../shared/components/ToolRunStatus";
import { useRunTimer } from "../../shared/hooks/useRunTimer";
import type { JobRecord } from "../../shared/types/job";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runGgtree } from "./ggtreeApi";
import { buildGgtreeStyleSpec, GGPLOT_MM_TO_CSS_PX, ggtreeCanvasToPreviewPixels, ggtreeSizeToPreviewPixels, resolveEffectiveGgtreeStyle } from "./ggtreeStyleSpec";
import type { GgtreePayload, GgtreeResult } from "./ggtreeTypes";

const TOOL_NAME = "ggtree_visualization";
const EXAMPLE_NEWICK = "((Human:0.08,Mouse:0.10)95:0.04,Dog:0.15);";
const DEFAULT_STYLE: Omit<GgtreePayload, "newick"> = {
  layout: "rectangular",
  show_tip_labels: true,
  show_support: true,
  show_nodes: true,
  show_branch_length: true,
  align_tip_labels: false,
  tip_font_size: 3.5,
  tip_label_offset: 0.02,
  tip_label_angle: 0,
  branch_width: 0.7,
  branch_color: "#52675b",
  tip_label_color: "#17211c",
  support_mode: "text",
  support_font_size: 2.4,
  support_color: "#9a5a35",
  background_color: "#ffffff",
  support_threshold: 0,
  tree_theme: "publication",
  x_expand: 0.08,
  right_margin: 10,
  open_angle: 10,
  auto_size: true,
  dpi: 300,
  width: 9,
  height: 6,
  label_overrides: {},
  support_overrides: {},
  node_overrides: {}
};

type TreeContextMenu =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "tip"; x: number; y: number; tipName: string }
  | { kind: "support"; x: number; y: number; supportId: string; supportLabel: string }
  | { kind: "node"; x: number; y: number; nodeId: string; nodeLabel: string };

interface GgtreePanelProps {
  initialNewick?: string;
  onRunningChange?: (running: boolean) => void;
}

export function GgtreePanel({ initialNewick = "", onRunningChange }: GgtreePanelProps) {
  const [payload, setPayload] = useState<GgtreePayload>({
    newick: normalizeNewick(initialNewick) || EXAMPLE_NEWICK,
    ...DEFAULT_STYLE
  });
  const [job, setJob] = useState<JobRecord<GgtreeResult> | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const { elapsedSeconds, startTimer } = useRunTimer(isRunning);
  const [isDesignReady, setIsDesignReady] = useState(false);
  const [isInputOpen, setIsInputOpen] = useState(true);
  const [inputFile, setInputFile] = useState<{ name: string; size: number } | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<ToolHistoryItem<GgtreePayload>>>(() =>
    readToolHistory<GgtreePayload>(TOOL_NAME)
  );

  const treeSummary = useMemo(() => summarizeNewick(payload.newick), [payload.newick]);

  useEffect(() => {
    const nextNewick = normalizeNewick(initialNewick);
    if (nextNewick) {
      setPayload((current) => ({ ...current, newick: nextNewick }));
      setJob(null);
      setError("");
      setIsInputOpen(true);
      setIsDesignReady(false);
    }
  }, [initialNewick]);
  useEffect(() => onRunningChange?.(isRunning), [isRunning, onRunningChange]);

  const startDesign = () => {
    if (!treeSummary.isTree) {
      setError("请输入有效的 Newick 树，例如：(A:0.1,B:0.2);");
      setIsInputOpen(true);
      setIsDesignReady(false);
      return;
    }
    setError("");
    setIsDesignReady(true);
    setIsInputOpen(false);
  };

  const submit = async () => {
    if (!treeSummary.isTree) {
      setError("请输入有效的 Newick 树，例如：(A:0.1,B:0.2);");
      setIsInputOpen(true);
      return;
    }

    startTimer();
    setIsRunning(true);
    setJob(null);
    setError("");
    try {
      const nextJob = await runGgtree(payload, { onStarted: setJob, onUpdate: setJob });
      setJob(nextJob);
      setHistoryItems(
        addToolHistory<GgtreePayload>(TOOL_NAME, {
          fileName: inputFile?.name ?? "tree.newick",
          summary: `${treeSummary.tipCount} tips · ${layoutLabel(payload.layout)}`,
          paramsSummary: `${payload.width} × ${payload.height} in · 字号 ${payload.tip_font_size} mm`,
          payload,
          jobId: nextJob.id,
          inputFileSize: inputFile?.size
        })
      );
      setIsInputOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ggtree 绘图失败。");
    } finally {
      setIsRunning(false);
    }
  };

  const stop = async () => { if (job) { setJob(await cancelJob<GgtreeResult>(job.id)); setIsRunning(false); } };

  const restoreHistory = async (item: ToolHistoryItem<GgtreePayload>) => {
    setInputFile(item.inputFileSize === undefined ? null : { name: item.fileName, size: item.inputFileSize });
    setError("");
    if (!item.jobId) { if (item.payload) setPayload(normalizePayload(item.payload)); setJob(null); setIsInputOpen(true); setIsDesignReady(false); return; }
    setIsRunning(true);
    try {
      const [restoredJob, restoredPayload] = await Promise.all([
        getJob<GgtreeResult>(item.jobId),
        item.payload ? Promise.resolve(item.payload) : getJobInput<GgtreePayload>(item.jobId)
      ]);
      setPayload(normalizePayload(restoredPayload));
      setJob(restoredJob);
      setIsInputOpen(false);
      setIsDesignReady(true);
    } catch (caught) {
      setJob(null);
      if (item.payload) {
        setPayload(normalizePayload(item.payload));
        setError("历史结果文件不在当前后端环境中，已恢复输入参数；需要重新导出以生成结果文件。");
        setIsInputOpen(false);
        setIsDesignReady(true);
      } else {
        setError(caught instanceof Error ? caught.message : "无法读取历史结果。");
        setIsInputOpen(true);
      }
    } finally { setIsRunning(false); }
  };

  return (
    <section className={`tool-layout ${isInputOpen ? "" : "input-collapsed"}`}>
      <div className={`tool-editor collapsible-card ${isInputOpen ? "open" : "closed"}`}>
        <div className="collapsible-card-header">
          <button className="input-toggle-button" type="button" onClick={() => setIsInputOpen((value) => !value)} aria-expanded={isInputOpen}>
            <div className="input-card-title">
              <p className="eyebrow">R / ggtree</p>
              <h2>Input</h2>
            </div>
            {!isInputOpen ? (
              <span className="input-parameter-summary">
                {inputFile ? `${inputFile.name} · ` : ""}
                {treeSummary.tipCount} tips · {layoutLabel(payload.layout)}
              </span>
            ) : null}
            <span className="input-toggle-label">{isInputOpen ? "⌃" : "⌄"}</span>
          </button>
          <div className="header-actions">
            <ToolHistoryMenu items={historyItems} onRestore={restoreHistory} />
            <button className="header-run-action" type="button" onClick={startDesign}>
              ▶ RUN
            </button>
          </div>
        </div>

        <div className="collapsible-card-body">
          <div className="input-workspace ggtree-input-only">
            <div className="sequence-input-column">
              <FilePicker
                fileName={inputFile?.name}
                detail={inputFile ? `${treeSummary.tipCount} tips · ${(inputFile.size / 1024).toFixed(1)} KB` : "支持 .treefile / .nwk / .newick"}
                onFile={(file, text) => {
                  setInputFile({ name: file.name, size: file.size });
                  setPayload((current) => ({ ...current, newick: text }));
                  setError("");
                  setIsDesignReady(false);
                }}
              />
              <div className="input-source-summary">
                <strong>{treeSummary.isTree ? "有效 Newick" : "等待有效树文件"}</strong>
                <span>{treeSummary.tipCount} tips · {treeSummary.hasBranchLength ? "含枝长" : "无枝长"}</span>
              </div>
              <label className="field">
                <span>Newick 树 <HelpTip text="可以直接粘贴 IQ-TREE 的 result.treefile 内容，或上传 Newick 树文件。" /></span>
                <textarea
                  value={payload.newick}
                  onChange={(event) => { setPayload({ ...payload, newick: event.target.value }); setIsDesignReady(false); }}
                  spellCheck={false}
                />
              </label>
            </div>

          </div>
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>

      <div className="tool-results">
        {isRunning ? (
          <ToolRunStatus title="正在导出发育树" description="ggtree 正在生成高分辨率图片与 PDF 文件。" elapsedSeconds={elapsedSeconds} stage="渲染并导出文件" onCancel={job ? stop : undefined} metrics={[{ label: "叶节点", value: treeSummary.tipCount }, { label: "布局", value: layoutLabel(payload.layout) }, { label: "分辨率", value: `${payload.dpi} DPI` }]} />
        ) : treeSummary.isTree && isDesignReady ? (
          <GgtreeDesignStudio
            payload={payload}
            setPayload={setPayload}
            onExport={submit}
            isExporting={isRunning}
            result={job?.result ?? null}
            jobId={job?.id}
            jobError={job && !job.result ? formatJobError(job.error) : ""}
          />
        ) : error ? (
          <StatusMessage tone="error">{error}</StatusMessage>
        ) : (
          <StatusMessage>上传或粘贴 Newick 后点击 RUN，进入 ggtree 参数设计界面。</StatusMessage>
        )}
      </div>
    </section>
  );
}

function GgtreeDesignStudio({
  payload,
  setPayload,
  onExport,
  isExporting,
  result,
  jobId,
  jobError
}: {
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
  onExport: () => void;
  isExporting: boolean;
  result: GgtreeResult | null;
  jobId?: string;
  jobError: string;
}) {
  const [zoom, setZoom] = useState(100);
  const [purposeMode, setPurposeMode] = useState<"topology" | "distance" | "large" | "paper">("distance");
  const [labelMode, setLabelMode] = useState<"auto" | "all" | "search" | "hover">("auto");
  const [supportMode, setSupportMode] = useState<GgtreePayload["support_mode"]>(payload.support_mode);
  const [lowSupportThreshold, setLowSupportThreshold] = useState(70);
  const [radialScale, setRadialScale] = useState(1);
  const [fanAngle, setFanAngle] = useState(300);
  const [centerGap, setCenterGap] = useState(0.06);
  const [tipSpacing, setTipSpacing] = useState(1);
  const [alignTips, setAlignTips] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapseMinTips, setCollapseMinTips] = useState(0);
  const [annotationText, setAnnotationText] = useState("");
  const [previewLabelTransforms, setPreviewLabelTransforms] = useState<Record<string, Pick<TreeLabelOverride, "translate_x" | "translate_y" | "angle">>>({});
  const [previewMode, setPreviewMode] = useState<"react" | "ggtree">(result ? "ggtree" : "react");
  const [realPreviewJob, setRealPreviewJob] = useState<JobRecord<GgtreeResult> | null>(null);
  const [isRealPreviewLoading, setIsRealPreviewLoading] = useState(false);
  const [realPreviewError, setRealPreviewError] = useState("");
  const [realSvgMarkup, setRealSvgMarkup] = useState("");
  const previewRequestRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<PhylogeneticTreePreviewHandle | null>(null);
  const treeSummary = useMemo(() => summarizeNewick(payload.newick), [payload.newick]);
  const effectiveStyle = useMemo(
    () => resolveEffectiveGgtreeStyle(payload, treeSummary.tipCount),
    [payload, treeSummary.tipCount]
  );
  const styleFingerprint = useMemo(
    () => JSON.stringify(buildGgtreeStyleSpec(payload, treeSummary.tipCount)),
    [payload, treeSummary.tipCount]
  );
  const [renderedFingerprint, setRenderedFingerprint] = useState(result ? styleFingerprint : "");
  const displayedPreviewResult = realPreviewJob?.result ?? result;
  const displayedPreviewJobId = realPreviewJob?.id ?? jobId;
  const realPreviewFile = displayedPreviewResult?.files.svg ?? displayedPreviewResult?.files.png;
  const realPreviewIsCurrent = Boolean(displayedPreviewResult && renderedFingerprint === styleFingerprint);
  const tipNames = useMemo(() => new Set(extractNewickTipNames(payload.newick)), [payload.newick]);
  const annotations = useMemo(() => parseAnnotationCsv(annotationText), [annotationText]);
  const previewLabelOverrides = useMemo(() => {
    const merged: Record<string, TreeLabelOverride> = { ...payload.label_overrides };
    Object.entries(previewLabelTransforms).forEach(([tipName, transform]) => {
      merged[tipName] = { ...(merged[tipName] ?? {}), ...transform };
    });
    return merged;
  }, [payload.label_overrides, previewLabelTransforms]);
  const [contextMenu, setContextMenu] = useState<TreeContextMenu | null>(null);

  useEffect(() => setPreviewLabelTransforms({}), [payload.layout, payload.newick]);

  useEffect(() => {
    setSupportMode(payload.support_mode);
    setAlignTips(payload.align_tip_labels);
  }, [payload.align_tip_labels, payload.support_mode]);
  useEffect(() => {
    if (!result) return;
    setRenderedFingerprint(styleFingerprint);
    setPreviewMode("ggtree");
  }, [result]);
  useEffect(() => {
    if (previewMode !== "ggtree" || realPreviewIsCurrent) return;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const timer = window.setTimeout(async () => {
      setIsRealPreviewLoading(true);
      setRealPreviewError("");
      try {
        const nextJob = await runGgtree(payload);
        if (previewRequestRef.current !== requestId) return;
        if (!nextJob.result) throw new Error(formatJobError(nextJob.error));
        setRealPreviewJob(nextJob);
        setRenderedFingerprint(styleFingerprint);
      } catch (caught) {
        if (previewRequestRef.current === requestId) {
          setRealPreviewError(caught instanceof Error ? caught.message : "ggtree 真实预览生成失败。");
        }
      } finally {
        if (previewRequestRef.current === requestId) setIsRealPreviewLoading(false);
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      if (!isRealPreviewLoading) previewRequestRef.current += 1;
    };
  }, [payload, previewMode, realPreviewIsCurrent, styleFingerprint]);
  useEffect(() => {
    const svgFile = displayedPreviewResult?.files.svg;
    if (!displayedPreviewJobId || !svgFile) {
      setRealSvgMarkup("");
      return;
    }
    let active = true;
    fetch(fileUrl(displayedPreviewJobId, svgFile))
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load ggtree SVG preview.");
        return response.text();
      })
      .then((markup) => { if (active) setRealSvgMarkup(markup); })
      .catch(() => { if (active) setRealSvgMarkup(""); });
    return () => { active = false; };
  }, [displayedPreviewJobId, displayedPreviewResult?.files.svg]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [contextMenu]);

  const centerCanvas = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2),
      top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
    });
  };

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(centerCanvas);
    return () => window.cancelAnimationFrame(frame);
  }, [centerGap, collapseMinTips, fanAngle, payload.layout, radialScale, tipSpacing]);

  const zoomAtPointer = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const previousScale = zoom / 100;
    const contentX = (viewport.scrollLeft + pointerX) / previousScale;
    const contentY = (viewport.scrollTop + pointerY) / previousScale;
    const nextZoom = Math.max(10, Math.min(200, zoom + (event.deltaY < 0 ? 10 : -10)));
    if (nextZoom === zoom) return;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      const nextScale = nextZoom / 100;
      viewport.scrollTo({
        left: Math.max(0, contentX * nextScale - pointerX),
        top: Math.max(0, contentY * nextScale - pointerY)
      });
    });
  };

  const startCanvasDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, input, select, textarea, .ggtree-context-menu, .tree-tip-group"))) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop
    };
    viewport.setPointerCapture(event.pointerId);
    setIsDraggingCanvas(true);
  };

  const moveCanvasDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    viewport.scrollLeft = drag.left - (event.clientX - drag.x);
    viewport.scrollTop = drag.top - (event.clientY - drag.y);
  };

  const endCanvasDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDraggingCanvas(false);
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };

  const fitCanvas = () => {
    const viewport = viewportRef.current;
    if (viewport && previewMode === "ggtree") {
      const scale = Math.min(
        (viewport.clientWidth - 48) / ggtreeCanvasToPreviewPixels(effectiveStyle.width),
        (viewport.clientHeight - 48) / ggtreeCanvasToPreviewPixels(effectiveStyle.height)
      );
      setZoom(Math.max(10, Math.min(200, Math.round(scale * 100))));
      return;
    }
    const svg = viewport?.querySelector("svg");
    if (!viewport || !svg) return;
    const viewBox = svg.viewBox.baseVal;
    if (!viewBox.width || !viewBox.height) return;
    const scale = Math.min((viewport.clientWidth - 48) / viewBox.width, (viewport.clientHeight - 48) / viewBox.height);
    setZoom(Math.max(10, Math.min(200, Math.round(scale * 100))));
  };
  const openCanvasMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "canvas", x: event.clientX, y: event.clientY });
  };
  const openTipMenu = (event: ReactMouseEvent, tipName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "tip", x: event.clientX, y: event.clientY, tipName });
  };
  const openSupportMenu = (event: ReactMouseEvent, supportId: string, supportLabel: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "support", x: event.clientX, y: event.clientY, supportId, supportLabel });
  };
  const openNodeMenu = (event: ReactMouseEvent, nodeId: string, nodeLabel: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "node", x: event.clientX, y: event.clientY, nodeId, nodeLabel });
  };
  const updateLabelOverride = (tipName: string, patch: Partial<NonNullable<GgtreePayload["label_overrides"][string]>>) => {
    setPayload((current) => ({
      ...current,
      label_overrides: {
        ...(current.label_overrides ?? {}),
        [tipName]: { ...(current.label_overrides?.[tipName] ?? {}), ...patch }
      }
    }));
  };
  const clearLabelOverride = (tipName: string) => {
    setPayload((current) => {
      const next = { ...(current.label_overrides ?? {}) };
      delete next[tipName];
      return { ...current, label_overrides: next };
    });
  };
  const updateSupportOverride = (supportId: string, patch: Partial<NonNullable<GgtreePayload["support_overrides"][string]>>) => {
    setPayload((current) => ({
      ...current,
      support_overrides: {
        ...(current.support_overrides ?? {}),
        [supportId]: { ...(current.support_overrides?.[supportId] ?? {}), ...patch }
      }
    }));
  };
  const clearSupportOverride = (supportId: string) => {
    setPayload((current) => {
      const next = { ...(current.support_overrides ?? {}) };
      delete next[supportId];
      return { ...current, support_overrides: next };
    });
  };
  const updateNodeOverride = (nodeId: string, patch: Partial<NonNullable<GgtreePayload["node_overrides"][string]>>) => {
    setPayload((current) => ({
      ...current,
      node_overrides: {
        ...(current.node_overrides ?? {}),
        [nodeId]: { ...(current.node_overrides?.[nodeId] ?? {}), ...patch }
      }
    }));
  };
  const clearNodeOverride = (nodeId: string) => {
    setPayload((current) => {
      const next = { ...(current.node_overrides ?? {}) };
      delete next[nodeId];
      return { ...current, node_overrides: next };
    });
  };

  return (
    <>
      <section className="report-block ggtree-design-studio">
        <div className="block-title-row">
          <div><h3>ggtree 参数设计</h3><span>前端为近似预览，最终图片由 R / ggtree 生成</span></div>
          <div className="ggtree-preview-actions" aria-label="预览缩放">
            <div className="ggtree-preview-mode" role="group" aria-label="预览来源">
              <button type="button" className={previewMode === "react" ? "active" : ""} onClick={() => setPreviewMode("react")}>React 可编辑预览</button>
              <button
                type="button"
                className={previewMode === "ggtree" ? "active" : ""}
                onClick={() => setPreviewMode("ggtree")}
              >
                ggtree 最终效果
              </button>
            </div>
          </div>
        </div>
        <div className="ggtree-live-layout">
          <div className="ggtree-live-controls">
            <GgtreeStyleControls
              payload={payload}
              setPayload={setPayload}
              purposeMode={purposeMode}
              setPurposeMode={setPurposeMode}
              labelMode={labelMode}
              setLabelMode={setLabelMode}
              supportMode={supportMode}
              setSupportMode={setSupportMode}
              lowSupportThreshold={lowSupportThreshold}
              setLowSupportThreshold={setLowSupportThreshold}
              radialScale={radialScale}
              setRadialScale={setRadialScale}
              fanAngle={fanAngle}
              setFanAngle={setFanAngle}
              centerGap={centerGap}
              setCenterGap={setCenterGap}
              tipSpacing={tipSpacing}
              setTipSpacing={setTipSpacing}
              alignTips={alignTips}
              setAlignTips={setAlignTips}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              collapseMinTips={collapseMinTips}
              setCollapseMinTips={setCollapseMinTips}
              annotationText={annotationText}
              setAnnotationText={setAnnotationText}
              annotationCount={annotations.length}
            />
            <button className="header-run-action ggtree-export-action" type="button" disabled={isExporting} onClick={onExport}>
              {isExporting ? "◌ 正在生成 ggtree 图" : result ? "↻ 重新生成 ggtree PNG/PDF" : "生成 ggtree PNG/PDF"}
            </button>
            <button className="ggtree-r-export-action" type="button" onClick={() => previewRef.current?.downloadSvg()}>
              ⤓ 下载 React 编辑版 SVG
            </button>
            <details className="ggtree-export-more">
              <summary>更多导出选项</summary>
              <button
                className="ggtree-json-export-action"
                type="button"
                onClick={() => downloadStyleJson(buildGgtreeStyleSpec(payload, treeSummary.tipCount))}
              >
                ⤓ 导出 Style JSON
              </button>
            </details>
            <small>React SVG 保留本地标签排版；PNG/PDF 使用 ggtree 的自动定位。</small>
          </div>
          <div className="ggtree-preview-column">
            <div className="ggtree-viewport-toolbar" aria-label="画布视图控制">
              <button type="button" onClick={() => setZoom((value) => Math.max(10, value - 10))} aria-label="缩小">−</button>
              <span>{zoom}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} aria-label="放大">＋</button>
              <button type="button" onClick={fitCanvas}>适应</button>
              <button type="button" onClick={centerCanvas}>居中</button>
              {previewMode === "react" ? (
                <button type="button" disabled={Object.keys(previewLabelTransforms).length === 0} onClick={() => setPreviewLabelTransforms({})}>重置标签</button>
              ) : null}
            </div>
            <div
              className={`ggtree-preview-viewport ${isDraggingCanvas ? "is-dragging" : ""}`}
              ref={viewportRef}
              onWheel={zoomAtPointer}
              onPointerDown={startCanvasDrag}
              onPointerMove={moveCanvasDrag}
              onPointerUp={endCanvasDrag}
              onPointerCancel={endCanvasDrag}
            >
            {previewMode === "react" ? (
              <div className="ggtree-local-edit-note">拖动和旋转仅影响 React SVG；按住 Shift 可吸附到 10px / 15°</div>
            ) : null}
            <div className={`ggtree-canvas-stage ${previewMode === "ggtree" ? "real-preview" : ""}`} onContextMenu={previewMode === "react" ? openCanvasMenu : undefined}>
              {previewMode === "ggtree" && realPreviewFile && displayedPreviewJobId ? (
                <div className="ggtree-real-preview-frame">
                  {isRealPreviewLoading ? <div className="ggtree-preview-stale">正在刷新 ggtree 真实预览…</div> : null}
                  {realPreviewError ? <div className="ggtree-preview-stale error">{realPreviewError}</div> : null}
                  {realSvgMarkup ? (
                    <div
                      className="ggtree-real-svg"
                      style={{ width: ggtreeCanvasToPreviewPixels(effectiveStyle.width) * zoom / 100 }}
                      onContextMenu={(event) => {
                        const target = event.target instanceof Element ? event.target.closest("text") : null;
                        const tipName = target?.textContent?.trim() ?? "";
                        if (!tipNames.has(tipName)) return;
                        openTipMenu(event, tipName);
                      }}
                      dangerouslySetInnerHTML={{ __html: realSvgMarkup }}
                    />
                  ) : (
                    <img
                      src={fileUrl(displayedPreviewJobId, realPreviewFile)}
                      alt="R ggtree 真实预览"
                      style={{ width: ggtreeCanvasToPreviewPixels(effectiveStyle.width) * zoom / 100 }}
                    />
                  )}
                </div>
              ) : previewMode === "ggtree" ? (
                <div className="ggtree-real-preview-empty">
                  <strong>{realPreviewError ? "ggtree 真实预览生成失败" : "正在准备 ggtree 真实预览"}</strong>
                  <span>{realPreviewError || "R 完成绘图后会在这里显示 SVG。"}</span>
                </div>
              ) : (
              <PhylogeneticTreePreview
                ref={previewRef}
                newick={payload.newick}
                branchColor={payload.branch_color}
                branchWidth={ggtreeSizeToPreviewPixels(payload.branch_width)}
                tipColor={payload.tip_label_color}
                tipFontSize={ggtreeSizeToPreviewPixels(effectiveStyle.tipFontSize)}
                supportColor={payload.support_color}
                supportThreshold={payload.support_threshold}
                supportFontSize={ggtreeSizeToPreviewPixels(payload.support_font_size)}
                lowSupportThreshold={payload.support_threshold}
                backgroundColor={payload.background_color}
                showTipLabels={payload.show_tip_labels}
                showSupport={payload.show_support}
                showNodes={payload.show_nodes}
                showBranchLength={payload.show_branch_length}
                layoutMode={payload.layout}
                labelMode={labelMode}
                supportMode={previewSupportMode(effectiveStyle.supportMode)}
                radialScale={radialScale}
                fanAngle={payload.layout === "fan" ? 360 - payload.open_angle : fanAngle}
                centerGap={centerGap}
                tipSpacing={tipSpacing}
                tipLabelOffset={payload.tip_label_offset}
                tipLabelAngle={payload.layout === "rectangular" ? 0 : payload.tip_label_angle}
                xExpand={payload.x_expand}
                rightMargin={payload.right_margin}
                alignTips={payload.align_tip_labels}
                searchQuery={searchQuery}
                collapseMinTips={collapseMinTips}
                annotations={annotations}
                labelOverrides={previewLabelOverrides}
                supportOverrides={payload.support_overrides}
                nodeOverrides={payload.node_overrides}
                textSizeScale={GGPLOT_MM_TO_CSS_PX}
                lineWidthScale={GGPLOT_MM_TO_CSS_PX}
                onCanvasContextMenu={openCanvasMenu}
                onTipContextMenu={openTipMenu}
                onTipTransform={(tipName, transform) => setPreviewLabelTransforms((current) => ({
                  ...current,
                  [tipName]: { ...(current[tipName] ?? {}), ...transform }
                }))}
                onSupportContextMenu={openSupportMenu}
                onNodeContextMenu={openNodeMenu}
                allowDownload
                downloadFileName="ggtree-current-preview.svg"
                showMeta={false}
                displayScale={zoom / 100}
                canvasWidth={ggtreeCanvasToPreviewPixels(effectiveStyle.width)}
                canvasHeight={ggtreeCanvasToPreviewPixels(effectiveStyle.height)}
              />
              )}
              {contextMenu ? (
                <GgtreeContextMenu
                  menu={contextMenu}
                  payload={payload}
                  setPayload={setPayload}
                  updateLabelOverride={updateLabelOverride}
                  clearLabelOverride={clearLabelOverride}
                  updateSupportOverride={updateSupportOverride}
                  clearSupportOverride={clearSupportOverride}
                  updateNodeOverride={updateNodeOverride}
                  clearNodeOverride={clearNodeOverride}
                  labelMode={labelMode}
                  setLabelMode={setLabelMode}
                  setSupportMode={setSupportMode}
                  tipSpacing={tipSpacing}
                  setTipSpacing={setTipSpacing}
                  onClose={() => setContextMenu(null)}
                />
              ) : null}
            </div>
            </div>
            <FloatingTreeControls payload={payload} setPayload={setPayload} />
          </div>
        </div>
      </section>
      {jobError ? <StatusMessage tone="error">{jobError}</StatusMessage> : null}
      {result && jobId ? (
        <section className="report-block ggtree-export-result">
          <div className="block-title-row"><h3>高质量导出已生成</h3><span>{result.dpi} DPI · {layoutLabel(result.layout)}</span></div>
          <ResultFiles jobId={jobId} files={result.files} />
        </section>
      ) : null}
    </>
  );
}

function GgtreeStyleControls({
  payload,
  setPayload,
  purposeMode,
  setPurposeMode,
  labelMode,
  setLabelMode,
  supportMode,
  setSupportMode,
  lowSupportThreshold,
  setLowSupportThreshold,
  radialScale,
  setRadialScale,
  fanAngle,
  setFanAngle,
  centerGap,
  setCenterGap,
  tipSpacing,
  setTipSpacing,
  alignTips,
  setAlignTips,
  searchQuery,
  setSearchQuery,
  collapseMinTips,
  setCollapseMinTips,
  annotationText,
  setAnnotationText,
  annotationCount
}: {
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
  purposeMode: "topology" | "distance" | "large" | "paper";
  setPurposeMode: React.Dispatch<React.SetStateAction<"topology" | "distance" | "large" | "paper">>;
  labelMode: "auto" | "all" | "search" | "hover";
  setLabelMode: React.Dispatch<React.SetStateAction<"auto" | "all" | "search" | "hover">>;
  supportMode: GgtreePayload["support_mode"];
  setSupportMode: React.Dispatch<React.SetStateAction<GgtreePayload["support_mode"]>>;
  lowSupportThreshold: number;
  setLowSupportThreshold: React.Dispatch<React.SetStateAction<number>>;
  radialScale: number;
  setRadialScale: React.Dispatch<React.SetStateAction<number>>;
  fanAngle: number;
  setFanAngle: React.Dispatch<React.SetStateAction<number>>;
  centerGap: number;
  setCenterGap: React.Dispatch<React.SetStateAction<number>>;
  tipSpacing: number;
  setTipSpacing: React.Dispatch<React.SetStateAction<number>>;
  alignTips: boolean;
  setAlignTips: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  collapseMinTips: number;
  setCollapseMinTips: React.Dispatch<React.SetStateAction<number>>;
  annotationText: string;
  setAnnotationText: React.Dispatch<React.SetStateAction<string>>;
  annotationCount: number;
}) {
  const update = <K extends keyof GgtreePayload>(key: K, value: GgtreePayload[K]) => setPayload((current) => ({ ...current, [key]: value }));
  const applyPurpose = (purpose: "topology" | "distance" | "large" | "paper") => {
    setPurposeMode(purpose);
    if (purpose === "topology") {
      setPayload((current) => ({
        ...current,
        layout: "rectangular",
        show_tip_labels: true,
        show_support: true,
        show_branch_length: false,
        align_tip_labels: false,
        support_threshold: 50,
        tip_font_size: 3.5,
        tip_label_offset: 0.02,
        branch_width: 0.7,
        support_mode: "low",
        tree_theme: "clean"
      }));
      setLabelMode("auto");
      setSupportMode("low");
      setAlignTips(false);
      setCollapseMinTips(0);
      return;
    }
    if (purpose === "large") {
      setPayload((current) => ({
        ...current,
        show_tip_labels: true,
        show_support: true,
        align_tip_labels: false,
        support_threshold: 70,
        tip_font_size: 2.5,
        tip_label_offset: 0.03,
        branch_width: 0.6,
        support_mode: "low",
        tree_theme: "publication",
        auto_size: true
      }));
      setLabelMode("search");
      setSupportMode("low");
      setLowSupportThreshold(70);
      setTipSpacing(1.25);
      return;
    }
    if (purpose === "paper") {
      setPayload((current) => ({
        ...current,
        show_tip_labels: true,
        show_support: true,
        align_tip_labels: false,
        support_threshold: 80,
        tip_font_size: 3.5,
        tip_label_offset: 0.02,
        branch_width: 0.8,
        background_color: "#ffffff",
        support_mode: "text",
        tree_theme: "publication",
        dpi: 300
      }));
      setLabelMode("auto");
      setSupportMode("low");
      setLowSupportThreshold(70);
      setAlignTips(false);
      return;
    }
    setPayload((current) => ({
      ...current,
      show_tip_labels: true,
      show_support: true,
      show_branch_length: true,
      align_tip_labels: false,
      support_threshold: 50,
      tip_font_size: 3.5,
      tip_label_offset: 0.02,
      branch_width: 0.7,
      support_mode: "text",
      tree_theme: "axis"
    }));
    setLabelMode("auto");
    setSupportMode("text");
    setCollapseMinTips(0);
  };

  return (
    <div className="ggtree-control-sections">
      <section className="ggtree-compact-card">
        <CompactSegmentedRow
          label="目的"
          value={purposeMode}
          options={[["topology", "看拓扑"], ["distance", "看距离"], ["large", "看大树"], ["paper", "论文图"]]}
          onChange={applyPurpose}
        />
        <label className="ggtree-search-row">
          <span>搜索</span>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="tip / clade name" />
        </label>
        {payload.layout !== "rectangular" ? (
          <>
            <CompactRangeRow label="半径" value={radialScale} min={0.5} max={1.4} step={0.05} display={`${Math.round(radialScale * 100)}%`} onChange={setRadialScale} />
            <CompactRangeRow label="留白" value={centerGap} min={0} max={0.3} step={0.01} display={`${Math.round(centerGap * 100)}%`} onChange={setCenterGap} />
            {payload.layout === "fan" ? <CompactRangeRow label="开口角" value={payload.open_angle} min={0} max={330} step={5} display={`${payload.open_angle}°`} onChange={(value) => update("open_angle", value)} /> : null}
          </>
        ) : null}
        <CompactRangeRow label="折叠" value={collapseMinTips} min={0} max={300} step={10} display={collapseMinTips ? `≥${collapseMinTips}` : "关"} onChange={setCollapseMinTips} />
        <div className="ggtree-compact-row">
          <span className="ggtree-compact-label">颜色</span>
          <div className="ggtree-color-chip-row">
            <ColorChip label="分支" value={payload.branch_color} onChange={(value) => update("branch_color", value)} />
            <ColorChip label="背景" value={payload.background_color} onChange={(value) => update("background_color", value)} />
          </div>
        </div>
      </section>
      <details className="ggtree-compact-details">
        <summary>高级外观</summary>
        <div className="ggtree-details-body">
          <CompactRangeRow label="分支粗细" value={payload.branch_width} min={0.1} max={4} step={0.1} display={`${payload.branch_width}`} onChange={(value) => update("branch_width", value)} />
          <CompactRangeRow label="Tip距" value={tipSpacing} min={0.7} max={2.4} step={0.05} display={`${Math.round(tipSpacing * 100)}%`} onChange={setTipSpacing} />
          <CompactRangeRow label="X扩展" value={payload.x_expand} min={0} max={1} step={0.01} display={`${payload.x_expand}`} onChange={(value) => update("x_expand", value)} />
          <CompactRangeRow label="右边距" value={payload.right_margin} min={0} max={80} step={1} display={`${payload.right_margin}`} onChange={(value) => update("right_margin", value)} />
          <label className="toggle-field"><input type="checkbox" checked={payload.align_tip_labels} onChange={(event) => { setAlignTips(event.target.checked); update("align_tip_labels", event.target.checked); }} />Rectangular 标签右对齐（关闭则接枝末端）</label>
          <label className="toggle-field"><input type="checkbox" checked={payload.auto_size} onChange={(event) => update("auto_size", event.target.checked)} />按 tip 数自动调整导出尺寸</label>
        </div>
      </details>
      <details className="ggtree-compact-details">
        <summary>Annotation CSV {annotationCount ? `· ${annotationCount} rows` : ""}</summary>
        <div className="ggtree-details-body">
          <label className="field">
            <span>name,group,protein_length,gc,temperature,metal,activity</span>
            <textarea
              className="ggtree-annotation-input"
              value={annotationText}
              onChange={(event) => setAnnotationText(event.target.value)}
              placeholder={"E. coli MG1655,Proteobacteria,230,51,37,Mg2+,Endo\nThermus thermophilus,Thermus,245,68,70,Mg2+,Endo"}
            />
          </label>
        </div>
      </details>
      <details className="ggtree-compact-details">
        <summary>导出设置</summary>
        <div className="ggtree-export-grid">
          <label className="field"><span>宽度（in）</span><input type="number" min={4} max={30} value={payload.width} onChange={(event) => update("width", Number(event.target.value))} /></label>
          <label className="field"><span>高度（in）</span><input type="number" min={4} max={40} value={payload.height} onChange={(event) => update("height", Number(event.target.value))} /></label>
          <label className="field"><span>DPI</span><select value={payload.dpi} onChange={(event) => update("dpi", Number(event.target.value))}><option value={150}>150</option><option value={300}>300</option><option value={600}>600</option></select></label>
        </div>
      </details>
    </div>
  );
}

function GgtreeContextMenu({
  menu,
  payload,
  setPayload,
  updateLabelOverride,
  clearLabelOverride,
  updateSupportOverride,
  clearSupportOverride,
  updateNodeOverride,
  clearNodeOverride,
  labelMode,
  setLabelMode,
  setSupportMode,
  tipSpacing,
  setTipSpacing,
  onClose
}: {
  menu: TreeContextMenu;
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
  updateLabelOverride: (tipName: string, patch: Partial<NonNullable<GgtreePayload["label_overrides"][string]>>) => void;
  clearLabelOverride: (tipName: string) => void;
  updateSupportOverride: (supportId: string, patch: Partial<NonNullable<GgtreePayload["support_overrides"][string]>>) => void;
  clearSupportOverride: (supportId: string) => void;
  updateNodeOverride: (nodeId: string, patch: Partial<NonNullable<GgtreePayload["node_overrides"][string]>>) => void;
  clearNodeOverride: (nodeId: string) => void;
  labelMode: "auto" | "all" | "search" | "hover";
  setLabelMode: React.Dispatch<React.SetStateAction<"auto" | "all" | "search" | "hover">>;
  setSupportMode: React.Dispatch<React.SetStateAction<GgtreePayload["support_mode"]>>;
  tipSpacing: number;
  setTipSpacing: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
}) {
  const update = <K extends keyof GgtreePayload>(key: K, value: GgtreePayload[K]) => setPayload((current) => ({ ...current, [key]: value }));
  const style = {
    left: Math.max(12, Math.min(menu.x, window.innerWidth - 292)),
    top: Math.max(12, Math.min(menu.y, window.innerHeight - 420))
  };

  return (
    <div className="ggtree-context-menu" style={style} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      {menu.kind === "canvas" ? (
        <>
          <strong>图层显示</strong>
          <label><input type="checkbox" checked={payload.show_tip_labels} onChange={(event) => update("show_tip_labels", event.target.checked)} />显示 tip 标签</label>
          <label><input type="checkbox" checked={payload.show_support} onChange={(event) => update("show_support", event.target.checked)} />显示支持度</label>
          <label><input type="checkbox" checked={payload.show_nodes} onChange={(event) => update("show_nodes", event.target.checked)} />显示节点点位</label>
          <div className="ggtree-context-grid">
            <span>标签</span>
            <select value={labelMode} onChange={(event) => setLabelMode(event.target.value as "auto" | "all" | "search" | "hover")}>
              <option value="auto">自动</option>
              <option value="all">全部</option>
              <option value="search">搜索</option>
              <option value="hover">悬停</option>
            </select>
            <span>标签距</span>
            <input type="number" min={0} max={1} step={0.01} value={payload.tip_label_offset} onChange={(event) => update("tip_label_offset", Number(event.target.value))} />
            <span>标签角</span>
            <input type="number" min={-180} max={180} step={5} value={payload.tip_label_angle} onChange={(event) => update("tip_label_angle", Number(event.target.value))} />
            <span>Tip 间距</span>
            <input type="number" min={0.7} max={2.4} step={0.05} value={tipSpacing} onChange={(event) => setTipSpacing(Number(event.target.value))} />
            <span>支持度</span>
            <select
              value={payload.support_mode}
              onChange={(event) => {
                const value = event.target.value as GgtreePayload["support_mode"];
                setSupportMode(value);
                update("support_mode", value);
                update("show_support", value !== "none");
              }}
            >
              <option value="text">数字</option>
              <option value="dots">圆点</option>
              <option value="low">低值</option>
              <option value="none">隐藏</option>
            </select>
            <span>阈值</span>
            <input type="number" min={0} max={100} value={payload.support_threshold} onChange={(event) => update("support_threshold", Number(event.target.value))} />
            <span>标签字号</span>
            <input type="number" min={1} max={12} step={0.5} value={payload.tip_font_size} onChange={(event) => update("tip_font_size", Number(event.target.value))} />
            <span>支持字号</span>
            <input type="number" min={1} max={8} step={0.2} value={payload.support_font_size} onChange={(event) => update("support_font_size", Number(event.target.value))} />
          </div>
        </>
      ) : null}

      {menu.kind === "tip" ? (
        <>
          <strong>{menu.tipName}</strong>
          <button type="button" onClick={() => { updateLabelOverride(menu.tipName, { visible: true }); onClose(); }}>固定显示</button>
          <button type="button" onClick={() => { updateLabelOverride(menu.tipName, { visible: false }); onClose(); }}>隐藏此标签</button>
          <button type="button" onClick={() => { clearLabelOverride(menu.tipName); onClose(); }}>恢复默认</button>
          <div className="ggtree-context-grid">
            <span>颜色</span>
            <input type="color" value={payload.label_overrides?.[menu.tipName]?.color ?? payload.tip_label_color} onChange={(event) => updateLabelOverride(menu.tipName, { color: event.target.value })} />
            <span>字号</span>
            <input type="number" min={1} max={12} step={0.5} value={payload.label_overrides?.[menu.tipName]?.font_size ?? payload.tip_font_size} onChange={(event) => updateLabelOverride(menu.tipName, { font_size: Number(event.target.value) })} />
            <span>角度</span>
            <input type="number" min={-180} max={180} step={5} value={payload.label_overrides?.[menu.tipName]?.angle ?? payload.tip_label_angle} onChange={(event) => updateLabelOverride(menu.tipName, { angle: Number(event.target.value) })} />
          </div>
        </>
      ) : null}

      {menu.kind === "support" ? (
        <>
          <strong>支持度 {menu.supportLabel}</strong>
          <button type="button" onClick={() => { updateSupportOverride(menu.supportId, { visible: true }); onClose(); }}>固定显示</button>
          <button type="button" onClick={() => { updateSupportOverride(menu.supportId, { visible: false }); onClose(); }}>隐藏此支持度</button>
          <button type="button" onClick={() => { clearSupportOverride(menu.supportId); onClose(); }}>恢复默认</button>
          <div className="ggtree-context-grid">
            <span>显示</span>
            <select value={payload.support_overrides?.[menu.supportId]?.mode ?? "text"} onChange={(event) => updateSupportOverride(menu.supportId, { mode: event.target.value as "text" | "dots" })}>
              <option value="text">数字</option>
              <option value="dots">圆点</option>
            </select>
            <span>颜色</span>
            <input type="color" value={payload.support_overrides?.[menu.supportId]?.color ?? payload.support_color} onChange={(event) => updateSupportOverride(menu.supportId, { color: event.target.value })} />
            <span>字号</span>
            <input type="number" min={1} max={8} step={0.2} value={payload.support_overrides?.[menu.supportId]?.font_size ?? payload.support_font_size} onChange={(event) => updateSupportOverride(menu.supportId, { font_size: Number(event.target.value) })} />
          </div>
        </>
      ) : null}

      {menu.kind === "node" ? (
        <>
          <strong>{menu.nodeLabel}</strong>
          <button type="button" onClick={() => updateNodeOverride(menu.nodeId, { branch_highlight: true })}>高亮这支 clade</button>
          <button type="button" onClick={() => updateNodeOverride(menu.nodeId, { branch_highlight: false })}>取消高亮</button>
          <button type="button" onClick={() => updateNodeOverride(menu.nodeId, { collapsed: true })}>折叠 clade</button>
          <button type="button" onClick={() => updateNodeOverride(menu.nodeId, { collapsed: false })}>展开 clade</button>
          <button type="button" onClick={() => { clearNodeOverride(menu.nodeId); onClose(); }}>恢复默认</button>
          <div className="ggtree-context-grid">
            <span>分支色</span>
            <input type="color" value={payload.node_overrides?.[menu.nodeId]?.branch_color ?? "#d87a33"} onChange={(event) => updateNodeOverride(menu.nodeId, { branch_color: event.target.value, branch_highlight: true })} />
            <span>分支粗细</span>
            <input type="number" min={0.5} max={8} step={0.2} value={payload.node_overrides?.[menu.nodeId]?.branch_width ?? Math.max(payload.branch_width + 1.5, 3)} onChange={(event) => updateNodeOverride(menu.nodeId, { branch_width: Number(event.target.value), branch_highlight: true })} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function FloatingTreeControls({
  payload,
  setPayload
}: {
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
}) {
  const update = <K extends keyof GgtreePayload>(key: K, value: GgtreePayload[K]) => setPayload((current) => ({ ...current, [key]: value }));

  return (
    <div className="ggtree-floating-controls" aria-label="树图快捷控制" onContextMenu={(event) => event.stopPropagation()}>
      <div className="ggtree-floating-group" role="group" aria-label="布局">
        <span className="ggtree-floating-label">布局</span>
        {([[
          "rectangular", "矩形"
        ], [
          "circular", "圆形"
        ], [
          "fan", "扇形"
        ]] as Array<[GgtreePayload["layout"], string]>).map(([value, label]) => (
          <button key={value} type="button" className={payload.layout === value ? "active" : ""} onClick={() => update("layout", value)}>{label}</button>
        ))}
      </div>
      <div className="ggtree-floating-group" role="group" aria-label="枝长">
        <span className="ggtree-floating-label">枝长</span>
        <button type="button" className={payload.show_branch_length ? "active" : ""} onClick={() => update("show_branch_length", true)}>真实枝长</button>
        <button type="button" className={!payload.show_branch_length ? "active" : ""} onClick={() => update("show_branch_length", false)}>统一枝长</button>
      </div>
    </div>
  );
}

function CompactSegmentedRow<T extends string>({
  label,
  value,
  options,
  onChange,
  after
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
  after?: React.ReactNode;
}) {
  return (
    <div className="ggtree-compact-row">
      <span className="ggtree-compact-label">{label}</span>
      <div className="ggtree-segmented" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([optionValue, text]) => (
          <button key={optionValue} type="button" className={value === optionValue ? "active" : ""} onClick={() => onChange(optionValue)}>
            {text}
          </button>
        ))}
      </div>
      {after}
    </div>
  );
}

function CompactRangeRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="ggtree-compact-row ggtree-range-row">
      <span className="ggtree-compact-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="ggtree-compact-value">{display}</span>
    </label>
  );
}

function CompactToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="ggtree-mini-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ColorChip({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="ggtree-color-chip" title={label}>
      <span style={{ backgroundColor: value }} />
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
      {label}
    </label>
  );
}

function summarizeNewick(value: string): { isTree: boolean; tipCount: number; hasBranchLength: boolean } {
  const text = value.trim();
  const isTree = text.includes("(") && text.includes(")");
  return {
    isTree,
    tipCount: isTree ? text.replace(/;$/, "").split(",").length : 0,
    hasBranchLength: /:\s*\d/.test(text)
  };
}

function normalizeNewick(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractNewickTipNames(value: string): string[] {
  const names: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "(" && value[index] !== ",") continue;
    let cursor = index + 1;
    while (/\s/.test(value[cursor] ?? "")) cursor += 1;
    if (value[cursor] === "(") continue;
    let label = "";
    const quote = value[cursor] === "'" || value[cursor] === "\"" ? value[cursor] : "";
    if (quote) {
      cursor += 1;
      while (cursor < value.length && value[cursor] !== quote) label += value[cursor++];
    } else {
      while (cursor < value.length && ![":", ",", ")", ";"].includes(value[cursor])) label += value[cursor++];
    }
    const normalized = label.trim();
    if (normalized) names.push(normalized);
  }
  return names;
}

function normalizePayload(value: Partial<GgtreePayload>): GgtreePayload {
  return {
    newick: normalizeNewick(value.newick) || EXAMPLE_NEWICK,
    ...DEFAULT_STYLE,
    ...value
  };
}

function parseAnnotationCsv(value: string): TreeAnnotation[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstCells = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = firstCells.includes("name") || firstCells.includes("tip") || firstCells.includes("tip_name");
  const headers = hasHeader ? firstCells : ["name", "group", "protein_length", "gc", "temperature", "metal", "activity"];
  const rows = hasHeader ? lines.slice(1) : lines;

  const annotations: TreeAnnotation[] = [];
  rows.forEach((line) => {
    const cells = splitCsvLine(line);
    const get = (...names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header));
      return index >= 0 ? cells[index]?.trim() ?? "" : "";
    };
    const name = get("name", "tip", "tip_name");
    if (!name) return;
    annotations.push({
      name,
      group: get("group", "taxon", "taxonomy") || undefined,
      proteinLength: parseOptionalNumber(get("protein_length", "length", "aa")),
      gc: parseOptionalNumber(get("gc", "gc%", "gc_percent")),
      temperature: parseOptionalNumber(get("temperature", "temp", "optimal_temp")),
      metal: get("metal", "ion") || undefined,
      activity: get("activity", "function") || undefined
    });
  });
  return annotations;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseOptionalNumber(value: string): number | undefined {
  const parsed = Number(value.replace(/%|°C|aa/gi, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function downloadStyleJson(value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ggtree-style.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function layoutLabel(layout: GgtreePayload["layout"]): string {
  if (layout === "circular") return "圆形树";
  if (layout === "fan") return "扇形树";
  return "矩形树";
}

function previewSupportMode(mode: GgtreePayload["support_mode"]): "none" | "all" | "low" | "dots" {
  if (mode === "text") return "all";
  return mode;
}

function formatJobError(error: JobRecord<GgtreeResult>["error"]): string {
  if (!error) return "后端任务未返回错误详情。";
  if (typeof error === "string") return error;
  const message = error.message || error.code || "后端任务失败。";
  const details = error.details ? Object.entries(error.details) : [];
  if (details.length === 0) return message;
  return `${message} (${details.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")})`;
}
