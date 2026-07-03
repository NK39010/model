import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";

export interface PhylogeneticTreePreviewProps {
  newick: string;
  branchColor?: string;
  branchWidth?: number;
  tipColor?: string;
  tipFontSize?: number;
  supportColor?: string;
  supportThreshold?: number;
  supportFontSize?: number;
  backgroundColor?: string;
  showTipLabels?: boolean;
  showSupport?: boolean;
  showNodes?: boolean;
  showBranchLength?: boolean;
  layoutMode?: "rectangular" | "circular" | "fan";
  labelMode?: "auto" | "all" | "search" | "hover";
  supportMode?: "none" | "auto" | "all" | "hover" | "low" | "dots";
  lowSupportThreshold?: number;
  radialScale?: number;
  fanAngle?: number;
  centerGap?: number;
  tipSpacing?: number;
  tipLabelOffset?: number;
  tipLabelAngle?: number;
  xExpand?: number;
  rightMargin?: number;
  alignTips?: boolean;
  searchQuery?: string;
  collapseMinTips?: number;
  annotations?: TreeAnnotation[];
  labelOverrides?: Record<string, TreeLabelOverride>;
  supportOverrides?: Record<string, TreeSupportOverride>;
  nodeOverrides?: Record<string, TreeNodeOverride>;
  textSizeScale?: number;
  lineWidthScale?: number;
  onCanvasContextMenu?: (event: MouseEvent<SVGSVGElement>) => void;
  onTipContextMenu?: (event: MouseEvent<SVGGElement>, leafName: string) => void;
  onTipTransform?: (leafName: string, transform: Partial<Pick<TreeLabelOverride, "translate_x" | "translate_y" | "angle">>) => void;
  onSupportContextMenu?: (event: MouseEvent<SVGGElement>, supportId: string, supportLabel: string) => void;
  onNodeContextMenu?: (event: MouseEvent<SVGElement>, nodeId: string, nodeLabel: string) => void;
  allowDownload?: boolean;
  downloadFileName?: string;
  showMeta?: boolean;
  displayScale?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface TreeLabelOverride {
  visible?: boolean;
  color?: string;
  font_size?: number;
  offset?: number;
  angle?: number;
  translate_x?: number;
  translate_y?: number;
}

export interface TreeSupportOverride {
  visible?: boolean;
  color?: string;
  font_size?: number;
  mode?: "text" | "dots";
}

export interface TreeNodeOverride {
  branch_highlight?: boolean;
  branch_color?: string;
  branch_width?: number;
  collapsed?: boolean;
}

export interface PhylogeneticTreePreviewHandle {
  downloadSvg: () => void;
}

export interface TreeAnnotation {
  name: string;
  group?: string;
  proteinLength?: number;
  gc?: number;
  temperature?: number;
  metal?: string;
  activity?: string;
}

interface TreeNode {
  name: string;
  support: string;
  length: number | null;
  children: TreeNode[];
  x: number;
  y: number;
  distance: number;
  angle?: number;
  radius?: number;
  collapsedTipCount?: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  child?: TreeNode;
}

interface TreeLayout {
  width: number;
  height: number;
  leaves: TreeNode[];
  nodes: TreeNode[];
  segments: Segment[];
  usesBranchLength: boolean;
  labelX: number;
  annotationX: number;
  treeUnitsToPixels: number;
  fixedCanvas: boolean;
}

const LEFT_PAD = 28;
const RIGHT_PAD = 180;
const TOP_PAD = 28;
const ROW_HEIGHT = 30;
const BASE_SVG_WIDTH = 980;

export const PhylogeneticTreePreview = forwardRef<PhylogeneticTreePreviewHandle, PhylogeneticTreePreviewProps>(function PhylogeneticTreePreview({
  newick,
  branchColor = "#6f8376",
  branchWidth = 2,
  tipColor = "#17211c",
  tipFontSize = 12,
  supportColor = "#9a5a35",
  supportThreshold = 0,
  supportFontSize = 10,
  backgroundColor = "#ffffff",
  showTipLabels = true,
  showSupport = true,
  showNodes = true,
  showBranchLength = true,
  layoutMode = "rectangular",
  labelMode = "auto",
  supportMode = "auto",
  lowSupportThreshold = 70,
  radialScale = 1,
  fanAngle = 300,
  centerGap = 0.06,
  tipSpacing = 1,
  tipLabelOffset = 0,
  tipLabelAngle = 0,
  xExpand = 0,
  rightMargin = 0,
  alignTips = false,
  searchQuery = "",
  collapseMinTips = 0,
  annotations = [],
  labelOverrides = {},
  supportOverrides = {},
  nodeOverrides = {},
  textSizeScale = 1,
  lineWidthScale = 1,
  onCanvasContextMenu,
  onTipContextMenu,
  onTipTransform,
  onSupportContextMenu,
  onNodeContextMenu,
  allowDownload = true,
  downloadFileName = "phylogenetic-tree.svg",
  showMeta = true,
  displayScale,
  canvasWidth,
  canvasHeight
}, ref) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedTip, setSelectedTip] = useState<string | null>(null);
  const tipTextRefs = useRef(new Map<string, SVGTextElement>());
  const [selectionBox, setSelectionBox] = useState<{ tipName: string; x: number; y: number; width: number; height: number } | null>(null);
  const tipDragRef = useRef<{
    pointerId: number;
    leafName: string;
    mode: "move" | "rotate";
    startPoint: { x: number; y: number };
    startTranslate: { x: number; y: number };
    startAngle: number;
    startPointerAngle: number;
    rotationCenter: { x: number; y: number };
  } | null>(null);
  useImperativeHandle(ref, () => ({
    downloadSvg: () => {
      if (svgRef.current) downloadSvgElement(svgRef.current, downloadFileName);
    }
  }), [downloadFileName]);

  useLayoutEffect(() => {
    if (!selectedTip) {
      setSelectionBox(null);
      return;
    }
    const text = tipTextRefs.current.get(selectedTip);
    if (!text) return;
    const box = text.getBBox();
    setSelectionBox((current) => {
      const next = { tipName: selectedTip, x: box.x, y: box.y, width: box.width, height: box.height };
      return current && current.tipName === next.tipName && current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height
        ? current
        : next;
    });
  }, [labelOverrides, selectedTip, textSizeScale, tipFontSize]);

  const preview = useMemo(() => {
    const parsed = safeParseNewick(newick);
    const root = parsed ? applyTreeOverrides(collapseTree(parsed, collapseMinTips), nodeOverrides) : null;
    if (!root) return null;
    const built = safeBuildLayout(root, showBranchLength, tipSpacing, annotations.length > 0, xExpand, rightMargin, canvasWidth, canvasHeight);
    return built ? { root, layout: transformLayout(built, layoutMode, radialScale, fanAngle, centerGap) } : null;
  }, [annotations.length, canvasHeight, canvasWidth, centerGap, collapseMinTips, fanAngle, layoutMode, newick, nodeOverrides, radialScale, showBranchLength, tipSpacing, xExpand, rightMargin]);

  if (!preview) {
    return <p className="quiet-text">无法解析 Newick 树文件。</p>;
  }
  const { root, layout } = preview;

  if (layout.leaves.length === 0) {
    return <p className="quiet-text">Newick 中没有可展示的叶节点。</p>;
  }

  const labelCapacity = layoutMode === "rectangular"
    ? Math.max(1, Math.floor((layout.height - TOP_PAD * 2) / Math.max(16, tipFontSize * 1.35)))
    : Math.max(1, Math.floor((Math.PI * 2 * Math.max(80, Math.min(layout.width, layout.height) / 2 - 70)) / Math.max(30, tipFontSize * 4)));
  const labelStep = labelMode === "auto" ? Math.max(1, Math.ceil(layout.leaves.length / labelCapacity)) : 1;
  const eligibleSupportNodes = layout.nodes.filter((node) => node.children.length > 0 && node.support && supportValue(node.support) >= supportThreshold);
  const supportStep = supportMode === "auto" ? Math.max(1, Math.ceil(eligibleSupportNodes.length / 60)) : 1;
  const supportOrder = new Map(eligibleSupportNodes.map((node, index) => [node, index]));
  const search = searchQuery.trim().toLowerCase();
  const matchedLeaves = search ? new Set(layout.leaves.filter((leaf) => leaf.name.toLowerCase().includes(search))) : new Set<TreeNode>();
  const matchedPathNodes = search ? collectMatchedPathNodes(root, matchedLeaves) : new Set<TreeNode>();
  const radialPaths = layoutMode === "rectangular" ? [] : collectRadialPaths(root, layout.width / 2, layout.height / 2);
  const annotationsByName = new Map(annotations.map((annotation) => [annotation.name, annotation]));
  const hasAnnotations = layoutMode === "rectangular" && annotations.length > 0;
  const maxProteinLength = Math.max(1, ...annotations.map((annotation) => annotation.proteinLength ?? 0));
  const maxTemperature = Math.max(1, ...annotations.map((annotation) => annotation.temperature ?? 0));
  const downloadCurrentSvg = () => {
    if (svgRef.current) downloadSvgElement(svgRef.current, downloadFileName);
  };
  const svgPoint = (event: ReactPointerEvent<SVGGElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  };
  const updateDraggedTip = (event: ReactPointerEvent<SVGGElement>, leaf: TreeNode) => {
    const drag = tipDragRef.current;
    if (!onTipTransform || drag?.pointerId !== event.pointerId) return;
    const point = svgPoint(event);
    if (!point) return;
    if (drag.mode === "move") {
      const nextX = drag.startTranslate.x + point.x - drag.startPoint.x;
      const nextY = drag.startTranslate.y + point.y - drag.startPoint.y;
      onTipTransform(leaf.name, {
        translate_x: event.shiftKey ? Math.round(nextX / 10) * 10 : nextX,
        translate_y: event.shiftKey ? Math.round(nextY / 10) * 10 : nextY
      });
      return;
    }
    const pointerAngle = Math.atan2(point.y - drag.rotationCenter.y, point.x - drag.rotationCenter.x) * 180 / Math.PI;
    const angleDelta = normalizeDegrees(pointerAngle - drag.startPointerAngle);
    const nextAngle = normalizeDegrees(drag.startAngle + angleDelta);
    onTipTransform(leaf.name, { angle: event.shiftKey ? Math.round(nextAngle / 15) * 15 : nextAngle });
  };

  return (
    <div className="tree-preview" aria-label="Phylogenetic tree preview">
      {showMeta ? <div className="tree-preview-meta">
        <span>{layout.leaves.length} tips</span>
        <span>{layout.usesBranchLength ? "按分支长度缩放" : "按拓扑层级缩放"}</span>
        {allowDownload ? <button className="compact-action tree-download-action" type="button" onClick={downloadCurrentSvg}>
          下载 SVG
        </button> : null}
      </div> : null}
      <svg
        ref={svgRef}
        className="tree-preview-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="IQ-TREE phylogenetic tree"
        data-layout={layoutMode}
        onClick={(event) => {
          if (!(event.target instanceof Element) || !event.target.closest(".tree-tip-group")) setSelectedTip(null);
        }}
        onContextMenu={(event) => {
          if (event.target === event.currentTarget) {
            onCanvasContextMenu?.(event);
          }
        }}
        style={displayScale === undefined
          ? { minWidth: layout.width, backgroundColor }
          : { width: layout.width * displayScale, height: layout.height * displayScale, minWidth: 0, backgroundColor }}
      >
        {layoutMode === "rectangular" ? layout.segments.map((segment, index) => {
          const nodeId = segment.child ? cladeNodeId(segment.child) : "";
          const nodeOverride = nodeId ? nodeOverrides[nodeId] : undefined;
          return (
          <line
            className={`tree-branch ${matchedPathNodes.has(segment.child as TreeNode) ? "search-hit" : nodeOverride?.branch_highlight ? "clade-highlighted" : search ? "search-dimmed" : ""}`}
            key={`segment-${index}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            onContextMenu={segment.child ? (event) => onNodeContextMenu?.(event, nodeId, cladeLabel(segment.child as TreeNode)) : undefined}
            style={{
              stroke: nodeOverride?.branch_highlight ? nodeOverride.branch_color ?? "#d87a33" : branchColor,
              strokeWidth: nodeOverride?.branch_highlight ? (nodeOverride.branch_width === undefined ? Math.max(branchWidth + 1.5, 3) : nodeOverride.branch_width * lineWidthScale) : branchWidth
            }}
          />
          );
        }) : radialPaths.map(({ d, child }, index) => {
          const nodeId = cladeNodeId(child);
          const nodeOverride = nodeOverrides[nodeId];
          return (
          <path
            key={`radial-${index}`}
            d={d}
            fill="none"
            className={`tree-branch ${matchedPathNodes.has(child) ? "search-hit" : nodeOverride?.branch_highlight ? "clade-highlighted" : search ? "search-dimmed" : ""}`}
            onContextMenu={(event) => onNodeContextMenu?.(event, nodeId, cladeLabel(child))}
            style={{
              stroke: nodeOverride?.branch_highlight ? nodeOverride.branch_color ?? "#d87a33" : branchColor,
              strokeWidth: nodeOverride?.branch_highlight ? (nodeOverride.branch_width === undefined ? Math.max(branchWidth + 1.5, 3) : nodeOverride.branch_width * lineWidthScale) : branchWidth
            }}
          />
          );
        })}
        {layout.nodes.map((node, index) => {
          const nodeId = cladeNodeId(node);
          const nodeOverride = nodeOverrides[nodeId];
          return (
          <g
            className="tree-node-group"
            key={`node-${index}`}
            onContextMenu={node.children.length > 0 ? (event) => onNodeContextMenu?.(event, nodeId, cladeLabel(node)) : undefined}
          >
            {showNodes && node.children.length > 0 ? (
              <circle
                className={`tree-node internal ${nodeOverride?.branch_highlight ? "highlighted" : ""}`}
                cx={node.x}
                cy={node.y}
                r={Math.max(0.6 * lineWidthScale, branchWidth * 1.7) / 2}
              />
            ) : null}
            {renderSupport(node, {
              showSupport,
              supportMode,
              supportThreshold,
              lowSupportThreshold,
              supportOrder,
              supportStep,
              supportColor,
              supportFontSize,
              textSizeScale,
              override: supportOverrides[cladeNodeId(node)],
              supportId: cladeNodeId(node),
              onSupportContextMenu
            })}
          </g>
          );
        })}
        {layout.leaves.map((leaf, index) => {
          const labelOverride = labelOverrides[leaf.name];
          const hiddenByMode = labelMode === "hover" || labelMode === "search" && !matchedLeaves.has(leaf) || (labelMode === "auto" && index % labelStep !== 0 && !matchedLeaves.has(leaf));
          const shouldShowLabel = labelOverride?.visible ?? showTipLabels;
          if (!shouldShowLabel) return null;
          const localLabelOffsetPx = Math.max(0, labelOverride?.offset ?? tipLabelOffset) * layout.treeUnitsToPixels;
          const labelX = layoutMode === "rectangular" ? (alignTips ? layout.labelX : leaf.x) + 8 + localLabelOffsetPx : leaf.x;
          const labelY = layoutMode === "rectangular" ? leaf.y + 4 : leaf.y;
          const labelAngle = labelOverride?.angle ?? tipLabelAngle;
          const translateX = labelOverride?.translate_x ?? 0;
          const translateY = labelOverride?.translate_y ?? 0;
          const renderedFontSize = labelOverride?.font_size ? labelOverride.font_size * textSizeScale : tipFontSize;
          const measuredBox = selectionBox?.tipName === leaf.name ? selectionBox : null;
          const selectionWidth = measuredBox?.width ?? Math.max(renderedFontSize, leaf.name.length * renderedFontSize * 0.58);
          const selectionHeight = measuredBox?.height ?? renderedFontSize;
          const selectionX = (measuredBox?.x ?? labelX) - 4;
          const selectionY = (measuredBox?.y ?? labelY - renderedFontSize) - 4;
          const selectionTransform = labelTransform(leaf, layoutMode, labelX, labelY, localLabelOffsetPx, labelAngle);
          const beginTipDrag = (event: ReactPointerEvent<SVGGElement>, mode: "move" | "rotate") => {
            if (event.button !== 0) return;
            const point = svgPoint(event);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            setSelectedTip(leaf.name);
            event.currentTarget.closest<SVGGElement>(".tree-tip-group")?.focus();
            const rotationCenter = layoutMode === "rectangular"
              ? { x: labelX + translateX, y: labelY + translateY }
              : { x: leaf.x + translateX, y: leaf.y + translateY };
            tipDragRef.current = {
              pointerId: event.pointerId,
              leafName: leaf.name,
              mode,
              startPoint: point,
              startTranslate: { x: translateX, y: translateY },
              startAngle: labelAngle,
              startPointerAngle: Math.atan2(point.y - rotationCenter.y, point.x - rotationCenter.x) * 180 / Math.PI,
              rotationCenter
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          };
          return (
          <g
            className={`tree-tip-group ${onTipTransform ? "is-editable" : ""} ${selectedTip === leaf.name ? "is-selected" : ""}`}
            key={`label-${leaf.name}-${index}`}
            tabIndex={onTipTransform ? 0 : undefined}
            role={onTipTransform ? "button" : undefined}
            aria-label={onTipTransform ? `编辑标签 ${leaf.name}` : undefined}
            transform={`translate(${translateX} ${translateY})`}
            onClick={onTipTransform ? (event) => {
              event.stopPropagation();
              setSelectedTip(leaf.name);
              event.currentTarget.focus();
            } : undefined}
            onFocus={onTipTransform ? () => setSelectedTip(leaf.name) : undefined}
            onContextMenu={(event) => onTipContextMenu?.(event, leaf.name)}
            onKeyDown={onTipTransform ? (event) => {
              const step = event.shiftKey ? 10 : 1;
              const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : null;
              if (!delta) return;
              event.preventDefault();
              event.stopPropagation();
              onTipTransform(leaf.name, { translate_x: translateX + delta[0], translate_y: translateY + delta[1] });
            } : undefined}
            onPointerDown={onTipTransform ? (event) => beginTipDrag(event, "move") : undefined}
            onPointerMove={onTipTransform ? (event) => {
              if (tipDragRef.current?.leafName !== leaf.name) return;
              event.preventDefault();
              event.stopPropagation();
              updateDraggedTip(event, leaf);
            } : undefined}
            onPointerUp={onTipTransform ? (event) => {
              if (tipDragRef.current?.pointerId !== event.pointerId) return;
              updateDraggedTip(event, leaf);
              tipDragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            } : undefined}
            onPointerCancel={onTipTransform ? (event) => {
              if (tipDragRef.current?.pointerId === event.pointerId) tipDragRef.current = null;
            } : undefined}
          >
            {selectedTip === leaf.name ? (
              <g className="tree-tip-selection" transform={selectionTransform}>
                <rect x={selectionX} y={selectionY} width={selectionWidth + 8} height={selectionHeight + 8} style={{ stroke: "#1473e6" }} />
                <line x1={selectionX + (selectionWidth + 8) / 2} y1={selectionY} x2={selectionX + (selectionWidth + 8) / 2} y2={selectionY - 18} style={{ stroke: "#1473e6" }} />
                <circle
                  className="tree-tip-rotate-handle"
                  cx={selectionX + (selectionWidth + 8) / 2}
                  cy={selectionY - 22}
                  r={5}
                  style={{ stroke: "#1473e6" }}
                  onPointerDown={(event) => beginTipDrag(event, "rotate")}
                />
              </g>
            ) : null}
            {leaf.collapsedTipCount ? <path className="tree-collapsed-clade" d={`M ${leaf.x - 2} ${leaf.y - 6} L ${leaf.x + 9} ${leaf.y} L ${leaf.x - 2} ${leaf.y + 6} Z`} /> : null}
            <circle cx={leaf.x} cy={leaf.y} r={8} fill="transparent"><title>{leaf.name}</title></circle>
            <text
              ref={(element) => {
                if (element) tipTextRefs.current.set(leaf.name, element);
                else tipTextRefs.current.delete(leaf.name);
              }}
              className={`tree-tip-label ${hiddenByMode && labelOverride?.visible !== true ? "collision-hidden" : ""} ${matchedLeaves.has(leaf) ? "search-hit" : search ? "search-dimmed" : ""}`}
              x={labelX}
              y={labelY}
              textAnchor={radialTextAnchor(leaf, layoutMode)}
              transform={selectionTransform}
            >
              <title>{leaf.name}</title>
              <tspan style={{ fill: labelOverride?.color ?? tipColor, fontSize: renderedFontSize }}>{leaf.name}</tspan>
            </text>
          </g>
          );
        })}
        {hasAnnotations ? layout.leaves.map((leaf, index) => (
          <AnnotationRow
            key={`annotation-${leaf.name}-${index}`}
            leaf={leaf}
            annotation={annotationsByName.get(leaf.name)}
            x={layout.annotationX}
            maxProteinLength={maxProteinLength}
            maxTemperature={maxTemperature}
          />
        )) : null}
      </svg>
    </div>
  );
});

function safeParseNewick(input: string): TreeNode | null {
  try {
    return parseNewick(input);
  } catch {
    return null;
  }
}

function safeBuildLayout(
  root: TreeNode,
  showBranchLength: boolean,
  tipSpacing: number,
  hasAnnotations: boolean,
  xExpand: number,
  rightMargin: number,
  canvasWidth?: number,
  canvasHeight?: number
): TreeLayout | null {
  try {
    return buildLayout(root, showBranchLength, tipSpacing, hasAnnotations, xExpand, rightMargin, canvasWidth, canvasHeight);
  } catch {
    return null;
  }
}

function parseNewick(input: string): TreeNode | null {
  let index = 0;
  const text = input.trim();

  const parseSubtree = (): TreeNode | null => {
    skipWhitespace();
    const children: TreeNode[] = [];

    if (text[index] === "(") {
      index += 1;
      while (index < text.length) {
        const child = parseSubtree();
        if (!child) return null;
        children.push(child);
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === ")") {
          index += 1;
          break;
        }
        return null;
      }
    }

    const rawLabel = readToken();
    const length = readLength();
    const isInternalSupport = children.length > 0 && isNumericLabel(rawLabel);

    return {
      name: isInternalSupport ? "" : rawLabel,
      support: isInternalSupport ? rawLabel : "",
      length,
      children,
      x: 0,
      y: 0,
      distance: 0
    };
  };

  const root = parseSubtree();
  skipWhitespace();
  if (text[index] === ";") index += 1;
  skipWhitespace();
  return root;

  function skipWhitespace() {
    while (/\s/.test(text[index] ?? "")) index += 1;
  }

  function readToken(): string {
    skipWhitespace();
    const start = index;
    while (index < text.length && !["(", ")", ",", ":", ";"].includes(text[index])) {
      index += 1;
    }
    return unquote(text.slice(start, index).trim());
  }

  function readLength(): number | null {
    skipWhitespace();
    if (text[index] !== ":") return null;
    index += 1;
    const start = index;
    while (index < text.length && !["(", ")", ",", ";"].includes(text[index])) {
      index += 1;
    }
    const value = Number(text.slice(start, index).trim());
    return Number.isFinite(value) ? value : null;
  }
}

function buildLayout(
  root: TreeNode,
  showBranchLength = true,
  tipSpacing = 1,
  hasAnnotations = false,
  xExpand = 0,
  rightMargin = 0,
  canvasWidth?: number,
  canvasHeight?: number
): TreeLayout {
  const leaves: TreeNode[] = [];
  const nodes: TreeNode[] = [];
  const segments: Segment[] = [];
  const usesBranchLength = showBranchLength && hasBranchLength(root);
  const fixedCanvas = Boolean(canvasWidth && canvasHeight);
  const baseWidth = canvasWidth ?? estimateWidth(root, hasAnnotations);
  const leafCount = collectLeafNames(root).length;
  const naturalRowHeight = (leafCount > 200 ? 14 : leafCount > 80 ? 20 : ROW_HEIGHT) * Math.max(0.7, Math.min(2.4, tipSpacing));
  const fittedRowHeight = leafCount > 1 && canvasHeight ? (canvasHeight - TOP_PAD * 2) / (leafCount - 1) : naturalRowHeight;
  // A ggtree export has a fixed physical canvas. Keep the React preview on that
  // same canvas instead of allowing its React-only row spacing to grow the SVG.
  const rowHeight = fixedCanvas ? fittedRowHeight : naturalRowHeight;

  assignDistances(root, 0, usesBranchLength);
  const maxDistance = Math.max(findMaxDistance(root), 1);
  const annotationWidth = hasAnnotations ? 360 : 0;
  const availableWidth = baseWidth - LEFT_PAD - RIGHT_PAD - annotationWidth;
  const expansionWidth = fixedCanvas
    ? availableWidth * Math.max(0, xExpand) / (1 + Math.max(0, xExpand))
    : availableWidth * Math.max(0, xExpand);
  const marginWidth = Math.max(0, rightMargin) * 96 / 72;
  const drawableWidth = Math.max(80, availableWidth - (fixedCanvas ? expansionWidth + marginWidth : 0));
  const width = fixedCanvas ? baseWidth : baseWidth + expansionWidth + marginWidth;
  const labelX = LEFT_PAD + drawableWidth;
  const annotationX = labelX + RIGHT_PAD - 110;

  let leafIndex = 0;
  const assignCoordinates = (node: TreeNode) => {
    nodes.push(node);
    node.x = LEFT_PAD + (node.distance / maxDistance) * drawableWidth;

    if (node.children.length === 0) {
      node.y = TOP_PAD + leafIndex * rowHeight;
      leaves.push(node);
      leafIndex += 1;
      return;
    }

    node.children.forEach(assignCoordinates);
    const childYs = node.children.map((child) => child.y);
    node.y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
  };

  assignCoordinates(root);
  collectSegments(root, segments);

  return {
    width,
    height: fixedCanvas
      ? Math.max(canvasHeight ?? 0, 120)
      : Math.max(TOP_PAD * 2 + Math.max(leaves.length - 1, 0) * rowHeight, 120),
    leaves,
    nodes,
    segments,
    usesBranchLength,
    labelX,
    annotationX,
    treeUnitsToPixels: drawableWidth / maxDistance,
    fixedCanvas
  };
}

function supportValue(label: string): number {
  const value = Number(label.split("/", 1)[0]);
  return Number.isFinite(value) ? value : 0;
}

function renderSupport(
  node: TreeNode,
  {
    showSupport,
    supportMode,
    supportThreshold,
    lowSupportThreshold,
    supportOrder,
    supportStep,
    supportColor,
    supportFontSize,
    textSizeScale,
    override,
    supportId,
    onSupportContextMenu
  }: {
    showSupport: boolean;
    supportMode: NonNullable<PhylogeneticTreePreviewProps["supportMode"]>;
    supportThreshold: number;
    lowSupportThreshold: number;
    supportOrder: Map<TreeNode, number>;
    supportStep: number;
    supportColor: string;
    supportFontSize: number;
    textSizeScale: number;
    override?: TreeSupportOverride;
    supportId: string;
    onSupportContextMenu?: (event: MouseEvent<SVGGElement>, supportId: string, supportLabel: string) => void;
  }
) {
  if (node.children.length === 0 || !node.support) return null;
  const isVisible = override?.visible ?? showSupport;
  if (!isVisible) return null;
  const mode = override?.mode ?? supportMode;
  if (mode === "none") return null;
  const value = supportValue(node.support);
  if (mode !== "low" && value < supportThreshold) return null;
  const x = node.x + (node.angle === undefined ? 7 : Math.cos(node.angle) * 9);
  const y = node.y + (node.angle === undefined ? -6 : Math.sin(node.angle) * 9);
  const color = override?.color ?? supportColor;
  const fontSize = override?.font_size ? override.font_size * textSizeScale : supportFontSize;

  if (mode === "dots") {
    const radius = Math.max(1.2 * textSizeScale, supportFontSize * 0.75) / 2;
    return (
      <g className="tree-support-target" onContextMenu={(event) => onSupportContextMenu?.(event, supportId, node.support)}>
        <circle className="tree-support-dot" cx={x} cy={y} r={radius} style={{ fill: color }}><title>{node.support}</title></circle>
      </g>
    );
  }

  if (mode === "low" && value >= lowSupportThreshold) {
    return null;
  }

  return (
    <g className="tree-support-target" onContextMenu={(event) => onSupportContextMenu?.(event, supportId, node.support)}>
      <text
        className={`tree-support-label ${mode === "hover" || (mode === "auto" && (supportOrder.get(node) ?? 0) % supportStep !== 0) ? "collision-hidden" : ""}`}
        x={x}
        y={y}
        style={{ fill: color, fontSize }}
      >
        {node.support}
      </text>
    </g>
  );
}

function AnnotationRow({
  leaf,
  annotation,
  x,
  maxProteinLength,
  maxTemperature
}: {
  leaf: TreeNode;
  annotation?: TreeAnnotation;
  x: number;
  maxProteinLength: number;
  maxTemperature: number;
}) {
  if (!annotation || leaf.collapsedTipCount) return null;
  const proteinWidth = Math.max(0, Math.min(70, ((annotation.proteinLength ?? 0) / maxProteinLength) * 70));
  const gcWidth = Math.max(0, Math.min(56, ((annotation.gc ?? 0) / 100) * 56));
  const tempWidth = Math.max(0, Math.min(56, ((annotation.temperature ?? 0) / maxTemperature) * 56));
  return (
    <g className="tree-annotation-row">
      {annotation.group ? <text x={x} y={leaf.y + 4} className="tree-annotation-text">{annotation.group}</text> : null}
      {annotation.proteinLength !== undefined ? <rect x={x + 74} y={leaf.y - 5} width={proteinWidth} height={8} rx={4} className="tree-annotation-bar protein"><title>{annotation.proteinLength} aa</title></rect> : null}
      {annotation.gc !== undefined ? <rect x={x + 154} y={leaf.y - 5} width={gcWidth} height={8} rx={4} className="tree-annotation-bar gc"><title>{annotation.gc}% GC</title></rect> : null}
      {annotation.temperature !== undefined ? <rect x={x + 220} y={leaf.y - 5} width={tempWidth} height={8} rx={4} className="tree-annotation-bar temp"><title>{annotation.temperature}°C</title></rect> : null}
      {annotation.metal ? <text x={x + 284} y={leaf.y + 4} className="tree-annotation-text">{annotation.metal}</text> : null}
      {annotation.activity ? <text x={x + 324} y={leaf.y + 4} className="tree-annotation-text">{annotation.activity}</text> : null}
    </g>
  );
}

function collapseTree(root: TreeNode, minTips: number): TreeNode {
  const threshold = Math.max(0, Math.floor(minTips));
  if (!threshold) return root;

  const clone = (node: TreeNode, isRoot = false): TreeNode => {
    const count = countLeaves(node);
    if (!isRoot && node.children.length > 0 && count >= threshold) {
      return makeNode(`Collapsed clade (${count} tips)`, node.support, node.length, count);
    }
    return {
      ...makeNode(node.name, node.support, node.length),
      children: node.children.map((child) => clone(child))
    };
  };

  return clone(root, true);
}

function applyTreeOverrides(root: TreeNode, nodeOverrides: Record<string, TreeNodeOverride>): TreeNode {
  const clone = (node: TreeNode, isRoot = false): TreeNode => {
    const nodeId = cladeNodeId(node);
    const override = nodeOverrides[nodeId];
    const leafCount = countLeaves(node);
    if (!isRoot && node.children.length > 0 && override?.collapsed) {
      return makeNode(`Collapsed clade (${leafCount} tips)`, node.support, node.length, leafCount);
    }
    return {
      ...makeNode(node.name, node.support, node.length, node.collapsedTipCount),
      children: node.children.map((child) => clone(child))
    };
  };

  return clone(root, true);
}

function makeNode(name: string, support: string, length: number | null, collapsedTipCount?: number): TreeNode {
  return {
    name,
    support,
    length,
    children: [],
    x: 0,
    y: 0,
    distance: 0,
    collapsedTipCount
  };
}

function countLeaves(node: TreeNode): number {
  if (node.children.length === 0) return node.collapsedTipCount ?? 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function collectMatchedPathNodes(root: TreeNode, matchedLeaves: Set<TreeNode>): Set<TreeNode> {
  const pathNodes = new Set<TreeNode>();
  const visit = (node: TreeNode): boolean => {
    const selfMatched = matchedLeaves.has(node);
    let childMatched = false;
    node.children.forEach((child) => {
      childMatched = visit(child) || childMatched;
    });
    if (selfMatched || childMatched) pathNodes.add(node);
    return selfMatched || childMatched;
  };
  visit(root);
  return pathNodes;
}

function transformLayout(
  layout: TreeLayout,
  mode: PhylogeneticTreePreviewProps["layoutMode"],
  radialScale: number,
  fanAngle: number,
  centerGap: number
): TreeLayout {
  if (mode === "rectangular") {
    // ggtree/ggplot uses an upward-growing y axis, so the first Newick tip is
    // drawn at the bottom. SVG grows downward; mirror it to keep tip and clade
    // orientation consistent with the exported ggtree figure.
    layout.nodes.forEach((node) => {
      node.y = layout.height - node.y;
    });
    layout.segments = layout.segments.map((segment) => ({
      ...segment,
      y1: layout.height - segment.y1,
      y2: layout.height - segment.y2
    }));
    return layout;
  }

  const sourceWidth = layout.labelX + RIGHT_PAD;
  const baseSize = Math.max(820, Math.min(2400, layout.leaves.length * (mode === "fan" ? 3.2 : 3)));
  const size = Math.max(700, Math.min(4000, baseSize * radialScale));
  const outputWidth = layout.fixedCanvas ? layout.width : size;
  const outputHeight = layout.fixedCanvas ? layout.height : size;
  const centerX = outputWidth / 2;
  const centerY = outputHeight / 2;
  const maxRadius = Math.max(80, Math.min(centerX, centerY) - 70) * (layout.fixedCanvas ? radialScale : 1);
  const clampedFanAngle = Math.max(120, Math.min(360, fanAngle));
  const angleSpan = mode === "fan" ? (clampedFanAngle * Math.PI) / 180 : Math.PI * 2;
  // ggtree maps tip indices 1..N onto the available clockwise angular span.
  const startAngle = angleSpan / Math.max(layout.leaves.length, 1);
  const innerRadius = maxRadius * Math.max(0, Math.min(0.35, centerGap));
  const sourceDrawableWidth = Math.max(1, sourceWidth - LEFT_PAD - RIGHT_PAD);
  const radialTreeUnitsToPixels = layout.treeUnitsToPixels * (maxRadius - innerRadius) / sourceDrawableWidth;
  const firstTipY = layout.leaves[0]?.y ?? TOP_PAD;
  const lastTipY = layout.leaves[layout.leaves.length - 1]?.y ?? firstTipY;
  const angularRange = Math.max(1, lastTipY - firstTipY);
  const mappedAngleSpan = angleSpan - startAngle;
  const mapPoint = (x: number, y: number) => {
    const radius = innerRadius + ((x - LEFT_PAD) / sourceDrawableWidth) * (maxRadius - innerRadius);
    const angle = startAngle + ((y - firstTipY) / angularRange) * mappedAngleSpan;
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius, angle, radius };
  };

  layout.nodes.forEach((node) => Object.assign(node, mapPoint(node.x, node.y)));
  layout.segments = layout.segments.map((segment) => {
    const start = mapPoint(segment.x1, segment.y1);
    const end = mapPoint(segment.x2, segment.y2);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  });
  layout.width = outputWidth;
  layout.height = outputHeight;
  layout.treeUnitsToPixels = radialTreeUnitsToPixels;
  return layout;
}

function collectRadialPaths(root: TreeNode, centerX: number, centerY: number): Array<{ d: string; child: TreeNode }> {
  const paths: Array<{ d: string; child: TreeNode }> = [];
  const visit = (parent: TreeNode) => {
    parent.children.forEach((child) => {
      if (parent.angle === undefined || parent.radius === undefined || child.angle === undefined || child.radius === undefined) return;
      const arcEnd = polarPoint(centerX, centerY, parent.radius, child.angle);
      const angleDelta = Math.abs(child.angle - parent.angle);
      const sweep = child.angle >= parent.angle ? 1 : 0;
      const d = parent.radius < 0.5
        ? `M ${parent.x} ${parent.y} L ${child.x} ${child.y}`
        : `M ${parent.x} ${parent.y} A ${parent.radius} ${parent.radius} 0 ${angleDelta > Math.PI ? 1 : 0} ${sweep} ${arcEnd.x} ${arcEnd.y} L ${child.x} ${child.y}`;
      paths.push({ d, child });
      visit(child);
    });
  };
  visit(root);
  return paths;
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number) {
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

function normalizeDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function radialTextAnchor(leaf: TreeNode, mode: PhylogeneticTreePreviewProps["layoutMode"]): "start" | "end" {
  if (mode === "rectangular" || leaf.angle === undefined) return "start";
  return Math.cos(leaf.angle) < 0 ? "end" : "start";
}

function labelTransform(
  leaf: TreeNode,
  mode: PhylogeneticTreePreviewProps["layoutMode"],
  x: number,
  y: number,
  offsetPx: number,
  angleDegrees: number
): string | undefined {
  if (mode === "rectangular" || leaf.angle === undefined) {
    return angleDegrees ? `rotate(${angleDegrees} ${x} ${y})` : undefined;
  }
  let degrees = (leaf.angle * 180) / Math.PI;
  const flip = Math.cos(leaf.angle) < 0;
  if (flip) degrees += 180;
  const offset = flip ? -(9 + offsetPx) : 9 + offsetPx;
  return `rotate(${degrees + angleDegrees} ${leaf.x} ${leaf.y}) translate(${offset} 4)`;
}

function assignDistances(node: TreeNode, parentDistance: number, usesBranchLength: boolean) {
  node.distance = parentDistance;
  node.children.forEach((child) => {
    const step = usesBranchLength ? child.length ?? 0 : 1;
    assignDistances(child, parentDistance + step, usesBranchLength);
  });
}

function collectSegments(node: TreeNode, segments: Segment[]) {
  if (node.children.length === 0) return;

  const childYs = node.children.map((child) => child.y);
  segments.push({
    x1: node.x,
    y1: Math.min(...childYs),
    x2: node.x,
    y2: Math.max(...childYs)
  });

  node.children.forEach((child) => {
    segments.push({ x1: node.x, y1: child.y, x2: child.x, y2: child.y, child });
    collectSegments(child, segments);
  });
}

function hasBranchLength(node: TreeNode): boolean {
  return node.length !== null || node.children.some(hasBranchLength);
}

function findMaxDistance(node: TreeNode): number {
  return Math.max(node.distance, ...node.children.map(findMaxDistance));
}

function estimateWidth(root: TreeNode, hasAnnotations = false): number {
  const labels = collectLeafNames(root);
  const longestLabel = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.max(BASE_SVG_WIDTH, 800 + Math.min(longestLabel * 8, 520) + (hasAnnotations ? 360 : 0));
}

function collectLeafNames(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.name || "unnamed"];
  return node.children.flatMap(collectLeafNames);
}

function cladeNodeId(node: TreeNode): string {
  return `clade:${collectLeafNames(node).sort().join("|")}`;
}

function cladeLabel(node: TreeNode): string {
  if (node.children.length === 0) return node.name || "unnamed tip";
  return `Clade (${countLeaves(node)} tips)`;
}

function isNumericLabel(label: string): boolean {
  return /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(label);
}

function unquote(label: string): string {
  if ((label.startsWith("'") && label.endsWith("'")) || (label.startsWith("\"") && label.endsWith("\""))) {
    return label.slice(1, -1);
  }
  return label;
}

function downloadSvgElement(svgElement: SVGSVGElement, fileName: string) {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const viewBox = svgElement.viewBox.baseVal;
  const renderedBox = svgElement.getBoundingClientRect();
  const renderedWidth = renderedBox.width > 0 ? renderedBox.width : viewBox.width;
  const renderedHeight = renderedBox.height > 0 ? renderedBox.height : viewBox.height;
  const backgroundColor = svgElement.style.backgroundColor || window.getComputedStyle(svgElement).backgroundColor;
  inlineComputedSvgStyles(svgElement, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", renderedWidth.toString());
  clone.setAttribute("height", renderedHeight.toString());
  clone.style.width = `${renderedWidth}px`;
  clone.style.height = `${renderedHeight}px`;
  clone.style.minWidth = "0";
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .tree-branch { stroke-linecap: square; fill: none; }
    .tree-node { stroke: #fbfcfa; stroke-width: 1.5; }
    .tree-node.internal { fill: #326b4d; }
    .tree-node.tip { fill: #1d3528; }
    .tree-tip-label { font-family: "Times New Roman", Times, serif; font-weight: 400; }
    .tree-support-label { font-family: "Times New Roman", Times, serif; font-size: 10px; font-weight: 400; }
    .tree-tip-label.collision-hidden, .tree-support-label.collision-hidden { opacity: 0; }
    .tree-branch.search-dimmed, .tree-tip-label.search-dimmed { opacity: 0.22; }
    .tree-branch.search-hit { stroke: #d87a33 !important; stroke-width: 4; }
    .tree-tip-label.search-hit { font-weight: 900; }
    .tree-support-dot { stroke: #fbfcfa; stroke-width: 1; }
    .tree-collapsed-clade { fill: #326b4d; opacity: 0.85; }
    .tree-annotation-text { fill: #4f6158; font-family: "Times New Roman", Times, serif; font-size: 10px; font-weight: 400; }
    .tree-annotation-bar.protein { fill: #5b8f75; }
    .tree-annotation-bar.gc { fill: #d6a45f; }
    .tree-annotation-bar.temp { fill: #8aa8c8; }
  `;
  clone.insertBefore(style, clone.firstChild);
  if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" && backgroundColor !== "transparent") {
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", viewBox.width.toString());
    background.setAttribute("height", viewBox.height.toString());
    background.setAttribute("fill", backgroundColor);
    clone.insertBefore(background, style.nextSibling);
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const INLINE_SVG_STYLE_PROPERTIES = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "paint-order",
  "pointer-events",
  "display",
  "visibility"
];

function inlineComputedSvgStyles(source: SVGSVGElement, clone: SVGSVGElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll<SVGElement>("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))];
  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index];
    if (!cloneElement) return;
    const computed = window.getComputedStyle(sourceElement);
    INLINE_SVG_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) cloneElement.style.setProperty(property, value);
    });
  });
}
