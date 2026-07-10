import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { cancelJob, fileUrl, getJob, getJobInput } from "../../api/jobs";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import { ToolRunStatus } from "../../shared/components/ToolRunStatus";
import { useRunTimer } from "../../shared/hooks/useRunTimer";
import type { JobRecord } from "../../shared/types/job";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runGgtree } from "./ggtreeApi";
import { buildGgtreeStyleSpec, ggtreeCanvasToPreviewPixels, resolveEffectiveGgtreeStyle } from "./ggtreeStyleSpec";
import type { GgtreePayload, GgtreeResult, GgtreeTreeNode } from "./ggtreeTypes";

const TOOL_NAME = "ggtree_visualization";
const EXAMPLE_NEWICK = "((Human:0.08,Mouse:0.10)95:0.04,Dog:0.15);";
const DEFAULT_STYLE: Omit<GgtreePayload, "newick"> = {
  layout: "rectangular",
  show_tip_labels: true,
  show_support: true,
  show_nodes: true,
  show_branch_length: true,
  align_tip_labels: false,
  tip_font_size: 2.6,
  tip_label_offset: 0.015,
  tip_label_angle: 0,
  branch_width: 0.45,
  branch_color: "#303633",
  tip_label_color: "#171b19",
  support_mode: "text",
  support_font_size: 2,
  support_color: "#6e4d3a",
  background_color: "#ffffff",
  support_threshold: 70,
  tree_theme: "publication",
  x_expand: 0.14,
  right_margin: 14,
  open_angle: 10,
  auto_size: true,
  dpi: 300,
  width: 9,
  height: 6,
  label_overrides: {},
  support_overrides: {},
  node_overrides: {},
  reroot_node_id: "",
  midpoint_root: false,
  preview_only: false,
  tip_metadata: {},
  show_species_labels: true,
  species_font_size: 1.5,
  species_label_color: "#52675b",
  species_label_offset: 0.06
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
  const [purposeMode, setPurposeMode] = useState<"topology" | "distance" | "large" | "paper">("paper");
  const [controlTab, setControlTab] = useState<"basic" | "advanced" | "datasets" | "export">("basic");
  const [showTreeInfo, setShowTreeInfo] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [savedViews, setSavedViews] = useState<Array<{ id: string; name: string; payload: GgtreePayload }>>(() => loadGgtreeViews());
  const [realPreviewJob, setRealPreviewJob] = useState<JobRecord<GgtreeResult> | null>(null);
  const [isRealPreviewLoading, setIsRealPreviewLoading] = useState(false);
  const [realPreviewError, setRealPreviewError] = useState("");
  const [realSvgMarkup, setRealSvgMarkup] = useState("");
  const previewRequestRef = useRef(0);
  const previewJobIdRef = useRef("");
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
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
  const syncState = realPreviewError ? "error" : isRealPreviewLoading ? "syncing" : realPreviewIsCurrent ? "synced" : "stale";
  const tipNames = useMemo(() => new Set(extractNewickTipNames(payload.newick)), [payload.newick]);
  const [contextMenu, setContextMenu] = useState<TreeContextMenu | null>(null);
  const structureNodes = displayedPreviewResult?.tree_model?.nodes ?? [];
  const selectedNode = structureNodes.find((node) => node.id === selectedNodeId);
  const updateSelectedNode = (patch: Partial<GgtreePayload["node_overrides"][string]>) => {
    if (!selectedNodeId) return;
    setPayload((current) => ({
      ...current,
      node_overrides: {
        ...current.node_overrides,
        [selectedNodeId]: { ...(current.node_overrides[selectedNodeId] ?? {}), ...patch }
      }
    }));
  };
  useEffect(() => {
    if (!result) return;
    setRenderedFingerprint(styleFingerprint);
  }, [result]);
  useEffect(() => {
    if (realPreviewIsCurrent) return;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const timer = window.setTimeout(async () => {
      setIsRealPreviewLoading(true);
      setRealPreviewError("");
      try {
        if (previewJobIdRef.current) {
          await cancelJob<GgtreeResult>(previewJobIdRef.current).catch(() => undefined);
        }
        const nextJob = await runGgtree({ ...payload, preview_only: true }, { onStarted: (started) => { previewJobIdRef.current = started.id; } });
        if (previewRequestRef.current !== requestId) return;
        if (!nextJob.result) throw new Error(formatJobError(nextJob.error));
        setRealPreviewJob(nextJob);
        setRenderedFingerprint(styleFingerprint);
        previewJobIdRef.current = "";
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
  }, [payload, realPreviewIsCurrent, styleFingerprint]);
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
  }, [payload.layout, payload.newick]);

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
    if (viewport) {
      const scale = Math.min(
        (viewport.clientWidth - 48) / ggtreeCanvasToPreviewPixels(effectiveStyle.width),
        (viewport.clientHeight - 48) / ggtreeCanvasToPreviewPixels(effectiveStyle.height)
      );
      setZoom(Math.max(10, Math.min(200, Math.round(scale * 100))));
      return;
    }
  };
  const openTipMenu = (event: ReactMouseEvent, tipName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "tip", x: event.clientX, y: event.clientY, tipName });
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

  return (
    <>
      <section className="report-block ggtree-design-studio">
        <div className="block-title-row ggtree-workbench-toolbar">
          <div><h3>ggtree 绘图工作台</h3><span>{treeSummary.tipCount} tips · {layoutLabel(payload.layout)}</span></div>
          <div className="ggtree-preview-actions" aria-label="预览缩放">
            <span className={`ggtree-sync-state ${syncState}`}><i />{syncState === "synced" ? "已与 ggtree 同步" : syncState === "syncing" ? "正在同步" : syncState === "error" ? "同步失败" : "存在未同步修改"}</span>
            <span className="ggtree-authoritative-badge">R / ggtree 权威画布</span>
          </div>
        </div>
        <div className="ggtree-live-layout">
          <GgtreeLayerPanel payload={payload} setPayload={setPayload} treeNodes={structureNodes} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          <div className="ggtree-preview-column">
            <div className="ggtree-viewport-toolbar" aria-label="画布视图控制">
              <button type="button" onClick={() => setZoom((value) => Math.max(10, value - 10))} aria-label="缩小">−</button>
              <span>{zoom}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} aria-label="放大">＋</button>
              <button type="button" onClick={fitCanvas}>适应</button>
              <button type="button" onClick={centerCanvas}>居中</button>
              <button type="button" className={showTreeInfo ? "active" : ""} onClick={() => setShowTreeInfo((value) => !value)}>信息</button>
              <button type="button" onClick={() => document.querySelector<HTMLInputElement>(".ggtree-node-search")?.focus()}>搜索</button>
              <button type="button" onClick={() => setControlTab("datasets")}>注释</button>
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
            <div className="ggtree-canvas-stage real-preview">
              {showTreeInfo ? <div className="ggtree-tree-info-popover"><strong>Tree information</strong><span>{treeSummary.tipCount} tips</span><span>{displayedPreviewResult?.tree_model?.internal_node_count ?? 0} internal nodes</span><span>{payload.show_branch_length ? "Phylogram" : "Cladogram"}</span><span>{layoutLabel(payload.layout)}</span></div> : null}
              {realPreviewFile && displayedPreviewJobId ? (
                <div className="ggtree-real-preview-frame">
                  {isRealPreviewLoading ? <div className="ggtree-preview-stale">正在刷新 ggtree 真实预览…</div> : null}
                  {realPreviewError ? <div className="ggtree-preview-stale error">{realPreviewError}</div> : null}
                  {realSvgMarkup ? <div className="ggtree-real-svg" style={{ width: ggtreeCanvasToPreviewPixels(effectiveStyle.width) * zoom / 100 }} onContextMenu={(event) => { const target = event.target instanceof Element ? event.target.closest("text") : null; const name = target?.textContent?.trim() ?? ""; if (tipNames.has(name)) openTipMenu(event, name); }} dangerouslySetInnerHTML={{ __html: realSvgMarkup }} /> : <img src={fileUrl(displayedPreviewJobId, realPreviewFile)} alt="R ggtree 真实预览" style={{ width: ggtreeCanvasToPreviewPixels(effectiveStyle.width) * zoom / 100 }} />}
                </div>
              ) : <div className="ggtree-real-preview-empty"><strong>正在准备 ggtree 真实预览</strong><span>{realPreviewError || "R 完成绘图后会在这里显示 SVG。"}</span></div>}
            </div></div>
            <FloatingTreeControls payload={payload} setPayload={setPayload} />
          </div>
          <div className="ggtree-live-controls ggtree-inspector">
            <div className="ggtree-panel-heading"><strong>Tree controls</strong><span>R / ggtree</span></div>
            {selectedNode && !selectedNode.is_tip ? <section className="ggtree-selection-card">
              <div><strong>选中类群</strong><span>{selectedNode.descendant_labels?.length ?? 0} tips</span></div>
              <small>{selectedNode.descendant_labels?.slice(0, 4).join(", ")}{(selectedNode.descendant_labels?.length ?? 0) > 4 ? "…" : ""}</small>
              <div className="ggtree-selection-actions">
                <button type="button" onClick={() => updateSelectedNode({ rotated: !payload.node_overrides[selectedNodeId]?.rotated })}>旋转子树</button>
                <button type="button" onClick={() => updateSelectedNode({ collapsed: !payload.node_overrides[selectedNodeId]?.collapsed })}>{payload.node_overrides[selectedNodeId]?.collapsed ? "展开类群" : "折叠类群"}</button>
                <button type="button" disabled={selectedNode.parent_id === null} onClick={() => setPayload((current) => ({ ...current, reroot_node_id: selectedNodeId, midpoint_root: false, node_overrides: {} }))}>设为根</button>
                <button type="button" onClick={() => setSelectedNodeId("")}>取消选择</button>
              </div>
            </section> : null}
            {selectedNode?.is_tip ? <section className="ggtree-selection-card">
              <div><strong>选中 Tip</strong><span>{selectedNode.original_label}</span></div>
              <div className="ggtree-selection-actions">
                <button type="button" onClick={() => updateLabelOverride(selectedNode.original_label, { visible: true })}>显示标签</button>
                <button type="button" onClick={() => updateLabelOverride(selectedNode.original_label, { visible: false })}>隐藏标签</button>
                <button type="button" onClick={() => setSelectedNodeId("")}>取消选择</button>
              </div>
            </section> : null}
            <div className="ggtree-control-tabs" role="tablist" aria-label="树图设置">
              {([['basic', 'Basic'], ['advanced', 'Advanced'], ['datasets', 'Datasets'], ['export', 'Export']] as const).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={controlTab === value} className={controlTab === value ? "active" : ""} onClick={() => setControlTab(value)}>{label}</button>
              ))}
            </div>
            <GgtreeStyleControls
              payload={payload}
              setPayload={setPayload}
              purposeMode={purposeMode}
              setPurposeMode={setPurposeMode}
              tab={controlTab}
            />
            {controlTab === "export" ? <>
              <div className="ggtree-view-actions">
                <button type="button" onClick={() => {
                  const name = window.prompt("视图名称", `View ${savedViews.length + 1}`)?.trim();
                  if (!name) return;
                  const next = [...savedViews, { id: `${Date.now()}`, name, payload }];
                  localStorage.setItem("ggtree:saved-views", JSON.stringify(next));
                  setSavedViews(next);
                }}>保存当前视图</button>
                <select defaultValue="" onChange={(event) => {
                  const view = savedViews.find((item) => item.id === event.target.value);
                  if (view) setPayload(normalizePayload(view.payload));
                  event.target.value = "";
                }}><option value="">恢复命名视图…</option>{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select>
              </div>
              <button className="header-run-action ggtree-export-action" type="button" disabled={isExporting} onClick={onExport}>
                {isExporting ? "◌ 正在生成" : result ? "↻ 重新生成全部格式" : "生成 SVG / PDF / PNG"}
              </button>
              <button
                className="ggtree-json-export-action"
                type="button"
                onClick={() => downloadStyleJson(buildGgtreeStyleSpec(payload, treeSummary.tipCount))}
              >
                ⤓ 导出 Style JSON
              </button>
              <small>画布与 PNG/PDF/SVG 均使用同一套 ggtree 参数。</small>
            </> : null}
          </div>
          {contextMenu ? (
                <GgtreeContextMenu
                  menu={contextMenu}
                  payload={payload}
                  setPayload={setPayload}
                  updateLabelOverride={updateLabelOverride}
                  clearLabelOverride={clearLabelOverride}
                  onClose={() => setContextMenu(null)}
                />
          ) : null}
        </div>
        <div className="ggtree-statusbar"><span>{treeSummary.tipCount} tips</span><span>{payload.show_support ? "支持度已显示" : "支持度已隐藏"}</span><span>{zoom}%</span><span className={syncState}>{syncState === "synced" ? "ggtree 已同步" : "等待同步"}</span></div>
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

function GgtreeLayerPanel({
  payload,
  setPayload,
  treeNodes,
  selectedNodeId,
  onSelectNode
}: {
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
  treeNodes: GgtreeTreeNode[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const toggle = (key: "show_tip_labels" | "show_support" | "show_nodes") =>
    setPayload((current) => ({ ...current, [key]: !current[key] }));
  return (
    <aside className="ggtree-layer-panel" aria-label="绘图图层">
      <div className="ggtree-panel-heading"><strong>图层</strong><span>控制画布内容</span></div>
      <div className="ggtree-layer-group">
        <div className="ggtree-layer-group-title"><span>⌄</span><strong>Tree</strong></div>
        <LayerToggle label="Branches" checked count="1" />
        <LayerToggle label="Tip labels" checked={payload.show_tip_labels} onChange={() => toggle("show_tip_labels")} />
        <LayerToggle label="Node points" checked={payload.show_nodes} onChange={() => toggle("show_nodes")} />
        <LayerToggle label="Support values" checked={payload.show_support} onChange={() => toggle("show_support")} />
      </div>
      <div className="ggtree-layer-group ggtree-tree-structure">
        <div className="ggtree-layer-group-title"><span>⌄</span><strong>Tree structure</strong></div>
        <input className="ggtree-node-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 tip / clade" />
        <div className="ggtree-node-list">
          {treeNodes.filter((node) => {
            const text = [node.original_label, ...node.descendant_labels].join(" ").toLowerCase();
            return !query.trim() || text.includes(query.trim().toLowerCase());
          }).map((node) => (
            <button key={node.id} type="button" className={selectedNodeId === node.id ? "active" : ""} onClick={() => onSelectNode(node.id)}>
              <span>{node.is_tip ? node.original_label : node.descendant_labels.slice(0, 2).join(" · ") || "Internal node"}</span>
              <small>{node.is_tip ? "tip" : node.descendant_labels.length}</small>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function LayerToggle({ label, checked, onChange, count }: { label: string; checked: boolean; onChange?: () => void; count?: string }) {
  return (
    <label className="ggtree-layer-row">
      <input type="checkbox" checked={checked} disabled={!onChange} onChange={onChange} />
      <span>{label}</span>
      {count ? <small>{count}</small> : null}
    </label>
  );
}

function GgtreeStyleControls({
  payload,
  setPayload,
  purposeMode,
  setPurposeMode,
  tab
}: {
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
  purposeMode: "topology" | "distance" | "large" | "paper";
  setPurposeMode: React.Dispatch<React.SetStateAction<"topology" | "distance" | "large" | "paper">>;
  tab: "basic" | "advanced" | "datasets" | "export";
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
        tip_font_size: 2.6,
        tip_label_offset: 0.015,
        branch_width: 0.45,
        support_mode: "low",
        tree_theme: "clean"
      }));
      return;
    }
    if (purpose === "large") {
      setPayload((current) => ({
        ...current,
        show_tip_labels: true,
        show_support: true,
        align_tip_labels: false,
        support_threshold: 70,
        tip_font_size: 1.6,
        tip_label_offset: 0.01,
        branch_width: 0.3,
        support_mode: "low",
        tree_theme: "publication",
        auto_size: true
      }));
      return;
    }
    if (purpose === "paper") {
      setPayload((current) => ({
        ...current,
        show_tip_labels: true,
        show_support: true,
        align_tip_labels: false,
        support_threshold: 70,
        tip_font_size: 2.6,
        support_font_size: 2,
        tip_label_offset: 0.015,
        branch_width: 0.45,
        branch_color: "#303633",
        tip_label_color: "#171b19",
        support_color: "#6e4d3a",
        background_color: "#ffffff",
        support_mode: "text",
        tree_theme: "publication",
        x_expand: 0.14,
        right_margin: 14,
        dpi: 300
      }));
      return;
    }
    setPayload((current) => ({
      ...current,
      show_tip_labels: true,
      show_support: true,
      show_branch_length: true,
      align_tip_labels: true,
      support_threshold: 70,
      tip_font_size: 2.4,
      tip_label_offset: 0.015,
      branch_width: 0.4,
      support_mode: "text",
      tree_theme: "axis"
    }));
  };

  return (
    <div className="ggtree-control-sections">
      {tab === "basic" ? <>
      <section className="ggtree-compact-card">
        <CompactSegmentedRow
          label="Mode"
          value={payload.layout}
          options={[["circular", "Circular"], ["rectangular", "Rectangular"], ["fan", "Fan"]]}
          onChange={(layout) => {
            setPayload((current) => layout === "rectangular" ? { ...current, layout, align_tip_labels: true } : {
              ...current,
              layout,
              show_branch_length: false,
              show_support: false,
              support_mode: "dots",
              align_tip_labels: false,
              branch_width: Math.min(current.branch_width, 0.45),
              right_margin: Math.max(current.right_margin, 18)
            });
          }}
        />
        <CompactSegmentedRow
          label="Preset"
          value={purposeMode}
          options={[["paper", "Paper"], ["distance", "Distance"], ["topology", "Topology"], ["large", "Large"]]}
          onChange={applyPurpose}
        />
        {payload.layout !== "rectangular" ? (
          payload.layout === "fan" ? <CompactRangeRow label="Arc" value={360 - payload.open_angle} min={30} max={360} step={5} display={`${360 - payload.open_angle}°`} onChange={(value) => update("open_angle", 360 - value)} /> : <CompactRangeRow label="Rotate" value={payload.tip_label_angle} min={-180} max={180} step={5} display={`${payload.tip_label_angle}°`} onChange={(value) => update("tip_label_angle", value)} />
        ) : null}
        <CompactSegmentedRow
          label="Length"
          value={payload.show_branch_length ? "use" : "ignore"}
          options={[["use", "Use"], ["ignore", "Ignore"]]}
          onChange={(value) => update("show_branch_length", value === "use")}
        />
        <CompactSegmentedRow
          label="Labels"
          value={payload.show_tip_labels ? "display" : "hide"}
          options={[["display", "Display"], ["hide", "Hide"]]}
          onChange={(value) => update("show_tip_labels", value === "display")}
        />
        <div className="ggtree-compact-row">
          <span className="ggtree-compact-label">颜色</span>
          <div className="ggtree-color-chip-row">
            <ColorChip label="分支" value={payload.branch_color} onChange={(value) => update("branch_color", value)} />
            <ColorChip label="背景" value={payload.background_color} onChange={(value) => update("background_color", value)} />
          </div>
        </div>
      </section>
      <details className="ggtree-compact-details" open>
        <summary>Label options</summary>
        <div className="ggtree-details-body">
          <CompactSegmentedRow
            label="Position"
            value={payload.layout === "rectangular" && !payload.align_tip_labels ? "tips" : "aligned"}
            options={[["aligned", "Aligned"], ["tips", "At tips"]]}
            onChange={(value) => update("align_tip_labels", value === "aligned")}
          />
          <CompactSegmentedRow
            label="Rotation"
            value={payload.tip_label_angle === 0 ? "off" : "on"}
            options={[["on", "On"], ["off", "Off"]]}
            onChange={(value) => update("tip_label_angle", value === "on" ? 210 : 0)}
          />
          <CompactRangeRow label="Seq size" value={payload.tip_font_size} min={0.8} max={30} step={0.2} display={`${payload.tip_font_size}px`} onChange={(value) => update("tip_font_size", value)} />
          <CompactRangeRow label="Seq ring" value={payload.tip_label_offset} min={0} max={1.2} step={0.01} display={`${payload.tip_label_offset}`} onChange={(value) => update("tip_label_offset", value)} />
          <ColorChip label="序列颜色" value={payload.tip_label_color} onChange={(value) => update("tip_label_color", value)} />
        </div>
      </details>
      <details className="ggtree-compact-details" open>
        <summary>Species ring</summary>
        <div className="ggtree-details-body">
          <CompactSegmentedRow
            label="Species"
            value={payload.show_species_labels ? "display" : "hide"}
            options={[["display", "Display"], ["hide", "Hide"]]}
            onChange={(value) => update("show_species_labels", value === "display")}
          />
          <CompactRangeRow label="Sp size" value={payload.species_font_size} min={0.8} max={30} step={0.2} display={`${payload.species_font_size}px`} onChange={(value) => update("species_font_size", value)} />
          <CompactRangeRow label="Sp ring" value={payload.species_label_offset} min={0} max={1.5} step={0.01} display={`${payload.species_label_offset}`} onChange={(value) => update("species_label_offset", value)} />
          <ColorChip label="物种颜色" value={payload.species_label_color} onChange={(value) => update("species_label_color", value)} />
        </div>
      </details>
      <details className="ggtree-compact-details" open>
        <summary>Branch options</summary>
        <div className="ggtree-details-body">
          <CompactRangeRow label="Width" value={payload.branch_width} min={0.1} max={4} step={0.1} display={`${payload.branch_width}px`} onChange={(value) => update("branch_width", value)} />
          <CompactRangeRow label="Margin" value={payload.right_margin} min={0} max={80} step={1} display={`${payload.right_margin}`} onChange={(value) => update("right_margin", value)} />
        </div>
      </details>
      </> : null}
      {tab === "advanced" ? <>
      <section className="ggtree-compact-card">
        <div className="ggtree-structure-actions">
          <button type="button" onClick={() => setPayload((current) => ({ ...current, midpoint_root: true, reroot_node_id: "", node_overrides: {} }))}>中点定根</button>
          <button type="button" onClick={() => setPayload((current) => ({ ...current, midpoint_root: false, reroot_node_id: "", node_overrides: {} }))}>恢复原始根</button>
        </div>
      </section>
      <details className="ggtree-compact-details" open>
        <summary>支持度</summary>
        <div className="ggtree-details-body">
          <label className="field"><span>显示方式</span><select value={payload.support_mode} onChange={(event) => { const value = event.target.value as GgtreePayload["support_mode"]; update("support_mode", value); update("show_support", value !== "none"); }}><option value="text">数字</option><option value="dots">圆点</option><option value="low">仅低支持度</option><option value="none">隐藏</option></select></label>
          <CompactRangeRow label="阈值" value={payload.support_threshold} min={0} max={100} step={1} display={`${payload.support_threshold}`} onChange={(value) => update("support_threshold", value)} />
          <CompactRangeRow label="字号" value={payload.support_font_size} min={0.8} max={24} step={0.2} display={`${payload.support_font_size}`} onChange={(value) => update("support_font_size", value)} />
          <ColorChip label="支持度颜色" value={payload.support_color} onChange={(value) => update("support_color", value)} />
        </div>
      </details>
      <details className="ggtree-compact-details">
        <summary>高级外观</summary>
        <div className="ggtree-details-body">
          <CompactRangeRow label="分支粗细" value={payload.branch_width} min={0.1} max={4} step={0.1} display={`${payload.branch_width}`} onChange={(value) => update("branch_width", value)} />
          <CompactRangeRow label="X扩展" value={payload.x_expand} min={0} max={1} step={0.01} display={`${payload.x_expand}`} onChange={(value) => update("x_expand", value)} />
          <CompactRangeRow label="右边距" value={payload.right_margin} min={0} max={80} step={1} display={`${payload.right_margin}`} onChange={(value) => update("right_margin", value)} />
          <label className="toggle-field"><input type="checkbox" checked={payload.auto_size} onChange={(event) => update("auto_size", event.target.checked)} />按 tip 数自动调整导出尺寸</label>
        </div>
      </details>
      </> : null}
      {tab === "datasets" ? <>
        <section className="ggtree-compact-card">
          <div className="ggtree-dataset-heading"><strong>Tip metadata</strong><span>{Object.keys(payload.tip_metadata).length} rows</span></div>
          <p className="quiet-text">粘贴 CSV/TSV：tip, sequence_label, species。圆形和扇形图会显示内圈序列名与外圈斜体物种名。</p>
          <TipMetadataEditor value={payload.tip_metadata} onChange={(value) => update("tip_metadata", value)} />
        </section>
        <details className="ggtree-compact-details" open>
          <summary>Species ring</summary>
          <div className="ggtree-details-body">
            <label className="toggle-field"><input type="checkbox" checked={payload.show_species_labels} onChange={(event) => update("show_species_labels", event.target.checked)} />显示外圈物种名</label>
            <CompactRangeRow label="字号" value={payload.species_font_size} min={0.8} max={30} step={0.2} display={`${payload.species_font_size}`} onChange={(value) => update("species_font_size", value)} />
            <CompactRangeRow label="环距" value={payload.species_label_offset} min={0} max={1} step={0.01} display={`${payload.species_label_offset}`} onChange={(value) => update("species_label_offset", value)} />
            <ColorChip label="物种颜色" value={payload.species_label_color} onChange={(value) => update("species_label_color", value)} />
          </div>
        </details>
      </> : null}
      {tab === "export" ?
      <details className="ggtree-compact-details">
        <summary>导出设置</summary>
        <div className="ggtree-export-grid">
          <label className="field"><span>宽度（in）</span><input type="number" min={4} max={30} value={payload.width} onChange={(event) => update("width", Number(event.target.value))} /></label>
          <label className="field"><span>高度（in）</span><input type="number" min={4} max={40} value={payload.height} onChange={(event) => update("height", Number(event.target.value))} /></label>
          <label className="field"><span>DPI</span><select value={payload.dpi} onChange={(event) => update("dpi", Number(event.target.value))}><option value={150}>150</option><option value={300}>300</option><option value={600}>600</option></select></label>
        </div>
      </details>
      : null}
    </div>
  );
}

function GgtreeContextMenu({
  menu,
  payload,
  setPayload,
  updateLabelOverride,
  clearLabelOverride,
  updateSupportOverride = () => undefined,
  clearSupportOverride = () => undefined,
  updateNodeOverride = () => undefined,
  clearNodeOverride = () => undefined,
  labelMode = "auto",
  setLabelMode = () => undefined,
  setSupportMode = () => undefined,
  tipSpacing = 1,
  setTipSpacing = () => undefined,
  onClose
}: {
  menu: TreeContextMenu;
  payload: GgtreePayload;
  setPayload: React.Dispatch<React.SetStateAction<GgtreePayload>>;
  updateLabelOverride: (tipName: string, patch: Partial<NonNullable<GgtreePayload["label_overrides"][string]>>) => void;
  clearLabelOverride: (tipName: string) => void;
  updateSupportOverride?: (supportId: string, patch: Partial<NonNullable<GgtreePayload["support_overrides"][string]>>) => void;
  clearSupportOverride?: (supportId: string) => void;
  updateNodeOverride?: (nodeId: string, patch: Partial<NonNullable<GgtreePayload["node_overrides"][string]>>) => void;
  clearNodeOverride?: (nodeId: string) => void;
  labelMode?: "auto" | "all" | "search" | "hover";
  setLabelMode?: (value: "auto" | "all" | "search" | "hover") => void;
  setSupportMode?: (value: GgtreePayload["support_mode"]) => void;
  tipSpacing?: number;
  setTipSpacing?: (value: number) => void;
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
            <input type="number" min={0.8} max={30} step={0.5} value={payload.tip_font_size} onChange={(event) => update("tip_font_size", Number(event.target.value))} />
            <span>支持字号</span>
            <input type="number" min={0.8} max={24} step={0.2} value={payload.support_font_size} onChange={(event) => update("support_font_size", Number(event.target.value))} />
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
            <input type="number" min={0.8} max={30} step={0.5} value={payload.label_overrides?.[menu.tipName]?.font_size ?? payload.tip_font_size} onChange={(event) => updateLabelOverride(menu.tipName, { font_size: Number(event.target.value) })} />
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
            <input type="number" min={0.8} max={24} step={0.2} value={payload.support_overrides?.[menu.supportId]?.font_size ?? payload.support_font_size} onChange={(event) => updateSupportOverride(menu.supportId, { font_size: Number(event.target.value) })} />
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
  const applyLayout = (layout: GgtreePayload["layout"]) => {
    setPayload((current) => layout === "rectangular" ? { ...current, layout } : {
      ...current,
      layout,
      show_branch_length: false,
      show_support: false,
      support_mode: "dots",
      align_tip_labels: false,
      tip_font_size: Math.min(current.tip_font_size, 1.8),
      branch_width: Math.min(current.branch_width, 0.4)
    });
  };

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
          <button key={value} type="button" className={payload.layout === value ? "active" : ""} onClick={() => applyLayout(value)}>{label}</button>
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

function TipMetadataEditor({ value, onChange }: { value: GgtreePayload["tip_metadata"]; onChange: (value: GgtreePayload["tip_metadata"]) => void }) {
  const [text, setText] = useState(() => metadataToText(value));
  return <textarea className="ggtree-metadata-editor" spellCheck={false} value={text} onChange={(event) => { setText(event.target.value); onChange(parseTipMetadata(event.target.value)); }} placeholder={"tip,sequence_label,species\nED1,ED1,Escherichia coli\nED2,ED2,Bacillus subtilis"} />;
}

function metadataToText(value: GgtreePayload["tip_metadata"]): string {
  const rows = Object.entries(value).map(([tip, item]) => [tip, item.sequence_label ?? "", item.species ?? ""].map(csvCell).join(","));
  return ["tip,sequence_label,species", ...rows].join("\n");
}

function parseTipMetadata(value: string): GgtreePayload["tip_metadata"] {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return {};
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const header = splitDelimitedLine(lines[0], delimiter).map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.includes("tip") || header.includes("name");
  const columns = hasHeader ? header : ["tip", "sequence_label", "species"];
  const rows = hasHeader ? lines.slice(1) : lines;
  const result: GgtreePayload["tip_metadata"] = {};
  for (const line of rows) {
    const cells = splitDelimitedLine(line, delimiter);
    const read = (...names: string[]) => {
      const index = columns.findIndex((column) => names.includes(column));
      return index >= 0 ? cells[index]?.trim() ?? "" : "";
    };
    const tip = read("tip", "name", "tip_name");
    if (!tip) continue;
    result[tip] = { sequence_label: read("sequence_label", "sequence", "label") || tip, species: read("species", "organism", "taxon") };
  }
  return result;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of line) {
    if (character === '"') { quoted = !quoted; continue; }
    if (character === delimiter && !quoted) { cells.push(current); current = ""; continue; }
    current += character;
  }
  cells.push(current);
  return cells;
}

function csvCell(value: string): string {
  return /[,"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function loadGgtreeViews(): Array<{ id: string; name: string; payload: GgtreePayload }> {
  try {
    const value = JSON.parse(localStorage.getItem("ggtree:saved-views") ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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
