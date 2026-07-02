import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cancelJob, getJob, getJobInput } from "../../api/jobs";
import { FilePicker } from "../../shared/components/FilePicker";
import { HelpTip } from "../../shared/components/HelpTip";
import { PhylogeneticTreePreview, type PhylogeneticTreePreviewHandle, type TreeAnnotation } from "../../shared/components/PhylogeneticTreePreview";
import { ResultFiles } from "../../shared/components/ResultFiles";
import { StatusMessage } from "../../shared/components/StatusMessage";
import { ToolHistoryMenu } from "../../shared/components/ToolHistoryMenu";
import { ToolRunStatus } from "../../shared/components/ToolRunStatus";
import { useRunTimer } from "../../shared/hooks/useRunTimer";
import type { JobRecord } from "../../shared/types/job";
import { addToolHistory, readToolHistory, type ToolHistoryItem } from "../../shared/utils/toolHistory";
import { runGgtree } from "./ggtreeApi";
import type { GgtreePayload, GgtreeResult } from "./ggtreeTypes";

const TOOL_NAME = "ggtree_visualization";
const EXAMPLE_NEWICK = "((Human:0.08,Mouse:0.10)95:0.04,Dog:0.15);";
const DEFAULT_STYLE: Omit<GgtreePayload, "newick"> = {
  layout: "rectangular",
  show_tip_labels: true,
  show_support: true,
  show_branch_length: true,
  tip_font_size: 3,
  branch_width: 0.7,
  branch_color: "#52675b",
  tip_label_color: "#17211c",
  support_color: "#9a5a35",
  background_color: "#ffffff",
  support_threshold: 0,
  dpi: 300,
  width: 11,
  height: 8
};

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
          paramsSummary: `${payload.width} × ${payload.height} in · ${payload.tip_font_size} pt`,
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
          <StatusMessage>上传或粘贴 Newick 后点击 RUN，进入实时 React 树图设计界面。</StatusMessage>
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
  const [supportMode, setSupportMode] = useState<"none" | "auto" | "all" | "hover" | "low" | "dots">("dots");
  const [lowSupportThreshold, setLowSupportThreshold] = useState(70);
  const [radialScale, setRadialScale] = useState(1);
  const [fanAngle, setFanAngle] = useState(300);
  const [centerGap, setCenterGap] = useState(0.06);
  const [tipSpacing, setTipSpacing] = useState(1);
  const [alignTips, setAlignTips] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapseMinTips, setCollapseMinTips] = useState(0);
  const [annotationText, setAnnotationText] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<PhylogeneticTreePreviewHandle | null>(null);
  const treeSummary = useMemo(() => summarizeNewick(payload.newick), [payload.newick]);
  const annotations = useMemo(() => parseAnnotationCsv(annotationText), [annotationText]);

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
  }, [centerGap, collapseMinTips, fanAngle, payload.layout, radialScale, tipSpacing, zoom]);

  const fitCanvas = () => {
    const viewport = viewportRef.current;
    const svg = viewport?.querySelector("svg");
    if (!viewport || !svg) return;
    const viewBox = svg.viewBox.baseVal;
    if (!viewBox.width || !viewBox.height) return;
    const scale = Math.min((viewport.clientWidth - 48) / viewBox.width, (viewport.clientHeight - 48) / viewBox.height);
    setZoom(Math.max(10, Math.min(200, Math.round(scale * 100))));
  };

  return (
    <>
      <section className="report-block ggtree-design-studio">
        <div className="block-title-row">
          <div><h3>实时树图设计</h3><span>调整控件会立即更新 SVG 预览</span></div>
          <div className="ggtree-preview-actions" aria-label="预览缩放">
            <button type="button" onClick={() => setZoom((value) => Math.max(10, value - 10))}>−</button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))}>＋</button>
            <button type="button" onClick={fitCanvas}>适应窗口</button>
            <button type="button" onClick={centerCanvas}>回到中心</button>
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
            <button className="header-run-action ggtree-export-action" type="button" onClick={() => previewRef.current?.downloadSvg()}>
              ⤓ 下载当前预览 SVG
            </button>
            <button className="ggtree-r-export-action" type="button" disabled={isExporting} onClick={onExport}>
              {isExporting ? "◌ 正在生成 R 图" : result ? "↻ 重新生成 PNG/PDF" : "生成 R/ggtree PNG/PDF"}
            </button>
            <button
              className="ggtree-json-export-action"
              type="button"
              onClick={() => downloadStyleJson({
                payload,
                preview: {
                  labelMode,
                  supportMode,
                  purposeMode,
                  lowSupportThreshold,
                  radialScale,
                  fanAngle,
                  centerGap,
                  tipSpacing,
                  alignTips,
                  collapseMinTips,
                  searchQuery
                },
                annotationText
              })}
            >
              ⤓ EXPORT STYLE JSON
            </button>
            <small>“下载当前预览 SVG”会保存眼前这张图；PNG/PDF 会调用 R / ggtree 重新渲染，外观可能与实时预览略有差异。</small>
          </div>
          <div className="ggtree-preview-viewport" ref={viewportRef}>
            <div className="ggtree-canvas-stage">
              <PhylogeneticTreePreview
                ref={previewRef}
                newick={payload.newick}
                branchColor={payload.branch_color}
                branchWidth={payload.branch_width}
                tipColor={payload.tip_label_color}
                tipFontSize={payload.tip_font_size * 4}
                supportColor={payload.support_color}
                supportThreshold={payload.support_threshold}
                lowSupportThreshold={lowSupportThreshold}
                backgroundColor={payload.background_color}
                showTipLabels={payload.show_tip_labels}
                showSupport={payload.show_support}
                showBranchLength={payload.show_branch_length}
                layoutMode={payload.layout}
                labelMode={labelMode}
                supportMode={supportMode}
                radialScale={radialScale}
                fanAngle={fanAngle}
                centerGap={centerGap}
                tipSpacing={tipSpacing}
                alignTips={alignTips}
                searchQuery={searchQuery}
                collapseMinTips={collapseMinTips}
                annotations={annotations}
                allowDownload
                downloadFileName="ggtree-current-preview.svg"
                showMeta={false}
                displayScale={zoom / 100}
              />
            </div>
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
  supportMode: "none" | "auto" | "all" | "hover" | "low" | "dots";
  setSupportMode: React.Dispatch<React.SetStateAction<"none" | "auto" | "all" | "hover" | "low" | "dots">>;
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
        support_threshold: 50,
        tip_font_size: 3,
        branch_width: 0.7
      }));
      setLabelMode("auto");
      setSupportMode("low");
      setAlignTips(true);
      setCollapseMinTips(0);
      return;
    }
    if (purpose === "large") {
      setPayload((current) => ({
        ...current,
        show_tip_labels: true,
        show_support: true,
        support_threshold: 70,
        tip_font_size: 2.5,
        branch_width: 0.6
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
        support_threshold: 80,
        tip_font_size: 3.5,
        branch_width: 0.8,
        background_color: "#ffffff",
        dpi: 300
      }));
      setLabelMode("auto");
      setSupportMode("low");
      setLowSupportThreshold(70);
      setAlignTips(payload.layout === "rectangular");
      return;
    }
    setPayload((current) => ({
      ...current,
      show_tip_labels: true,
      show_support: true,
      show_branch_length: true,
      support_threshold: 50,
      tip_font_size: 3,
      branch_width: 0.7
    }));
    setLabelMode("auto");
    setSupportMode("dots");
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
        <CompactSegmentedRow
          label="布局"
          value={payload.layout}
          options={[["rectangular", "矩形"], ["circular", "圆形"], ["fan", "扇形"]]}
          onChange={(value) => update("layout", value)}
        />
        <CompactSegmentedRow
          label="枝长"
          value={payload.show_branch_length ? "real" : "uniform"}
          options={[["real", "真实"], ["uniform", "统一"]]}
          onChange={(value) => update("show_branch_length", value === "real")}
        />
        <CompactSegmentedRow
          label="标签"
          value={labelMode}
          options={[["all", "全部"], ["auto", "自动"], ["search", "搜索"], ["hover", "悬停"]]}
          onChange={setLabelMode}
          after={<CompactToggle checked={payload.show_tip_labels} label="显示" onChange={(checked) => update("show_tip_labels", checked)} />}
        />
        <CompactRangeRow label="字号" value={payload.tip_font_size} min={1} max={12} step={0.5} display={`${payload.tip_font_size}`} onChange={(value) => update("tip_font_size", value)} />
        <CompactSegmentedRow
          label="支持度"
          value={supportMode}
          options={[["none", "隐藏"], ["low", "低值"], ["dots", "圆点"], ["all", "全部"]]}
          onChange={setSupportMode}
          after={<CompactToggle checked={payload.show_support} label="显示" onChange={(checked) => update("show_support", checked)} />}
        />
        <CompactRangeRow label="阈值" value={payload.support_threshold} min={0} max={100} step={1} display={`${payload.support_threshold}`} onChange={(value) => update("support_threshold", value)} />
        <CompactRangeRow label="低值线" value={lowSupportThreshold} min={0} max={100} step={1} display={`${lowSupportThreshold}`} onChange={setLowSupportThreshold} />
        <CompactRangeRow label="Tip距" value={tipSpacing} min={0.7} max={2.4} step={0.05} display={`${Math.round(tipSpacing * 100)}%`} onChange={setTipSpacing} />
        {payload.layout !== "rectangular" ? (
          <>
            <CompactRangeRow label="半径" value={radialScale} min={0.5} max={1.4} step={0.05} display={`${Math.round(radialScale * 100)}%`} onChange={setRadialScale} />
            <CompactRangeRow label="留白" value={centerGap} min={0} max={0.3} step={0.01} display={`${Math.round(centerGap * 100)}%`} onChange={setCenterGap} />
            {payload.layout === "fan" ? <CompactRangeRow label="扇角" value={fanAngle} min={120} max={360} step={5} display={`${fanAngle}°`} onChange={setFanAngle} /> : null}
          </>
        ) : null}
        <CompactRangeRow label="折叠" value={collapseMinTips} min={0} max={300} step={10} display={collapseMinTips ? `≥${collapseMinTips}` : "关"} onChange={setCollapseMinTips} />
        <div className="ggtree-compact-row">
          <span className="ggtree-compact-label">颜色</span>
          <div className="ggtree-color-chip-row">
            <ColorChip label="分支" value={payload.branch_color} onChange={(value) => update("branch_color", value)} />
            <ColorChip label="标签" value={payload.tip_label_color} onChange={(value) => update("tip_label_color", value)} />
            <ColorChip label="支持" value={payload.support_color} onChange={(value) => update("support_color", value)} />
            <ColorChip label="背景" value={payload.background_color} onChange={(value) => update("background_color", value)} />
          </div>
        </div>
      </section>
      <details className="ggtree-compact-details">
        <summary>高级外观</summary>
        <div className="ggtree-details-body">
          <CompactRangeRow label="分支粗细" value={payload.branch_width} min={0.1} max={4} step={0.1} display={`${payload.branch_width}`} onChange={(value) => update("branch_width", value)} />
          <label className="toggle-field"><input type="checkbox" checked={alignTips} onChange={(event) => setAlignTips(event.target.checked)} />Rectangular 标签右对齐</label>
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

function formatJobError(error: JobRecord<GgtreeResult>["error"]): string {
  if (!error) return "后端任务未返回错误详情。";
  if (typeof error === "string") return error;
  const message = error.message || error.code || "后端任务失败。";
  const details = error.details ? Object.entries(error.details) : [];
  if (details.length === 0) return message;
  return `${message} (${details.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")})`;
}
