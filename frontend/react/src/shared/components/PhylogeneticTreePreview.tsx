import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

export interface PhylogeneticTreePreviewProps {
  newick: string;
  branchColor?: string;
  branchWidth?: number;
  tipColor?: string;
  tipFontSize?: number;
  supportColor?: string;
  supportThreshold?: number;
  backgroundColor?: string;
  showTipLabels?: boolean;
  showSupport?: boolean;
  showBranchLength?: boolean;
  layoutMode?: "rectangular" | "circular" | "fan";
  labelMode?: "auto" | "all" | "search" | "hover";
  supportMode?: "none" | "auto" | "all" | "hover" | "low" | "dots";
  lowSupportThreshold?: number;
  radialScale?: number;
  fanAngle?: number;
  centerGap?: number;
  tipSpacing?: number;
  alignTips?: boolean;
  searchQuery?: string;
  collapseMinTips?: number;
  annotations?: TreeAnnotation[];
  allowDownload?: boolean;
  downloadFileName?: string;
  showMeta?: boolean;
  displayScale?: number;
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
  backgroundColor = "#ffffff",
  showTipLabels = true,
  showSupport = true,
  showBranchLength = true,
  layoutMode = "rectangular",
  labelMode = "auto",
  supportMode = "auto",
  lowSupportThreshold = 70,
  radialScale = 1,
  fanAngle = 300,
  centerGap = 0.06,
  tipSpacing = 1,
  alignTips = false,
  searchQuery = "",
  collapseMinTips = 0,
  annotations = [],
  allowDownload = true,
  downloadFileName = "phylogenetic-tree.svg",
  showMeta = true,
  displayScale
}, ref) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  useImperativeHandle(ref, () => ({
    downloadSvg: () => {
      if (svgRef.current) downloadSvgElement(svgRef.current, downloadFileName);
    }
  }), [downloadFileName]);

  const preview = useMemo(() => {
    const parsed = safeParseNewick(newick);
    const root = parsed ? collapseTree(parsed, collapseMinTips) : null;
    if (!root) return null;
    const built = safeBuildLayout(root, showBranchLength, tipSpacing, annotations.length > 0);
    return built ? { root, layout: transformLayout(built, layoutMode, radialScale, fanAngle, centerGap) } : null;
  }, [annotations.length, centerGap, collapseMinTips, fanAngle, layoutMode, newick, radialScale, showBranchLength, tipSpacing]);

  if (!preview) {
    return <p className="quiet-text">无法解析 Newick 树文件。</p>;
  }
  const { root, layout } = preview;

  if (layout.leaves.length === 0) {
    return <p className="quiet-text">Newick 中没有可展示的叶节点。</p>;
  }

  const labelStep = labelMode === "auto" ? Math.max(1, Math.ceil(layout.leaves.length / 90)) : 1;
  const eligibleSupportNodes = layout.nodes.filter((node) => node.children.length > 0 && node.support && supportValue(node.support) >= supportThreshold);
  const supportStep = supportMode === "auto" ? Math.max(1, Math.ceil(eligibleSupportNodes.length / 60)) : 1;
  const supportOrder = new Map(eligibleSupportNodes.map((node, index) => [node, index]));
  const search = searchQuery.trim().toLowerCase();
  const matchedLeaves = search ? new Set(layout.leaves.filter((leaf) => leaf.name.toLowerCase().includes(search))) : new Set<TreeNode>();
  const matchedPathNodes = search ? collectMatchedPathNodes(root, matchedLeaves) : new Set<TreeNode>();
  const radialPaths = layoutMode === "rectangular" ? [] : collectRadialPaths(root, layout.width / 2);
  const annotationsByName = new Map(annotations.map((annotation) => [annotation.name, annotation]));
  const hasAnnotations = layoutMode === "rectangular" && annotations.length > 0;
  const maxProteinLength = Math.max(1, ...annotations.map((annotation) => annotation.proteinLength ?? 0));
  const maxTemperature = Math.max(1, ...annotations.map((annotation) => annotation.temperature ?? 0));
  const downloadCurrentSvg = () => {
    if (svgRef.current) downloadSvgElement(svgRef.current, downloadFileName);
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
        style={displayScale === undefined
          ? { minWidth: layout.width, backgroundColor }
          : { width: layout.width * displayScale, height: layout.height * displayScale, minWidth: 0, backgroundColor }}
      >
        {layoutMode === "rectangular" ? layout.segments.map((segment, index) => (
          <line
            className={`tree-branch ${matchedPathNodes.has(segment.child as TreeNode) ? "search-hit" : search ? "search-dimmed" : ""}`}
            key={`segment-${index}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            style={{ stroke: branchColor, strokeWidth: branchWidth }}
          />
        )) : radialPaths.map(({ d, child }, index) => (
          <path
            key={`radial-${index}`}
            d={d}
            fill="none"
            className={`tree-branch ${matchedPathNodes.has(child) ? "search-hit" : search ? "search-dimmed" : ""}`}
            style={{ stroke: branchColor, strokeWidth: branchWidth }}
          />
        ))}
        {layout.nodes.map((node, index) => (
          <g className="tree-node-group" key={`node-${index}`}>
            <circle className={node.children.length > 0 ? "tree-node internal" : "tree-node tip"} cx={node.x} cy={node.y} r={node.children.length > 0 ? 3 : 2.5} />
            {renderSupport(node, {
              showSupport,
              supportMode,
              supportThreshold,
              lowSupportThreshold,
              supportOrder,
              supportStep,
              supportColor
            })}
          </g>
        ))}
        {showTipLabels ? layout.leaves.map((leaf, index) => (
          <g className="tree-tip-group" key={`label-${leaf.name}-${index}`}>
            {leaf.collapsedTipCount ? <path className="tree-collapsed-clade" d={`M ${leaf.x - 2} ${leaf.y - 6} L ${leaf.x + 9} ${leaf.y} L ${leaf.x - 2} ${leaf.y + 6} Z`} /> : null}
            <circle cx={leaf.x} cy={leaf.y} r={8} fill="transparent"><title>{leaf.name}</title></circle>
            <text
              className={`tree-tip-label ${labelMode === "hover" || labelMode === "search" && !matchedLeaves.has(leaf) || (labelMode === "auto" && index % labelStep !== 0 && !matchedLeaves.has(leaf)) ? "collision-hidden" : ""} ${matchedLeaves.has(leaf) ? "search-hit" : search ? "search-dimmed" : ""}`}
              x={layoutMode === "rectangular" ? (alignTips ? layout.labelX : leaf.x) + 8 : leaf.x}
              y={layoutMode === "rectangular" ? leaf.y + 4 : leaf.y}
              textAnchor={radialTextAnchor(leaf, layoutMode)}
              transform={radialLabelTransform(leaf, layoutMode)}
            >
              <title>{leaf.name}</title>
              <tspan style={{ fill: tipColor, fontSize: tipFontSize }}>{leaf.name}</tspan>
            </text>
          </g>
        )) : null}
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
  hasAnnotations: boolean
): TreeLayout | null {
  try {
    return buildLayout(root, showBranchLength, tipSpacing, hasAnnotations);
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
  hasAnnotations = false
): TreeLayout {
  const leaves: TreeNode[] = [];
  const nodes: TreeNode[] = [];
  const segments: Segment[] = [];
  const usesBranchLength = showBranchLength && hasBranchLength(root);
  const width = estimateWidth(root, hasAnnotations);
  const leafCount = collectLeafNames(root).length;
  const rowHeight = (leafCount > 200 ? 14 : leafCount > 80 ? 20 : ROW_HEIGHT) * Math.max(0.7, Math.min(2.4, tipSpacing));

  assignDistances(root, 0, usesBranchLength);
  const maxDistance = Math.max(findMaxDistance(root), 1);
  const annotationWidth = hasAnnotations ? 360 : 0;
  const drawableWidth = width - LEFT_PAD - RIGHT_PAD - annotationWidth;
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
    height: Math.max(TOP_PAD * 2 + Math.max(leaves.length - 1, 0) * rowHeight, 120),
    leaves,
    nodes,
    segments,
    usesBranchLength,
    labelX,
    annotationX
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
    supportColor
  }: {
    showSupport: boolean;
    supportMode: NonNullable<PhylogeneticTreePreviewProps["supportMode"]>;
    supportThreshold: number;
    lowSupportThreshold: number;
    supportOrder: Map<TreeNode, number>;
    supportStep: number;
    supportColor: string;
  }
) {
  if (!showSupport || node.children.length === 0 || !node.support) return null;
  if (supportMode === "none") return null;
  const value = supportValue(node.support);
  if (value < supportThreshold) return null;
  const x = node.x + (node.angle === undefined ? 7 : Math.cos(node.angle) * 9);
  const y = node.y + (node.angle === undefined ? -6 : Math.sin(node.angle) * 9);

  if (supportMode === "dots") {
    const radius = value >= 95 ? 3.5 : value >= lowSupportThreshold ? 2.5 : 0;
    return radius ? <circle className="tree-support-dot" cx={x} cy={y} r={radius} style={{ fill: supportColor }}><title>{node.support}</title></circle> : null;
  }

  if (supportMode === "low" && value >= lowSupportThreshold) {
    return <circle className="tree-support-dot" cx={x} cy={y} r={2.8} style={{ fill: supportColor }}><title>{node.support}</title></circle>;
  }

  return (
    <text
      className={`tree-support-label ${supportMode === "hover" || (supportMode === "auto" && (supportOrder.get(node) ?? 0) % supportStep !== 0) ? "collision-hidden" : ""}`}
      x={x}
      y={y}
      style={{ fill: supportColor }}
    >
      {node.support}
    </text>
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
  if (mode === "rectangular") return layout;

  const sourceWidth = layout.labelX + RIGHT_PAD;
  const sourceHeight = layout.height;
  const baseSize = Math.max(820, Math.min(2400, layout.leaves.length * (mode === "fan" ? 3.2 : 3)));
  const size = Math.max(700, Math.min(4000, baseSize * radialScale));
  const center = size / 2;
  const maxRadius = center - 110;
  const clampedFanAngle = Math.max(120, Math.min(360, fanAngle));
  const angleSpan = mode === "fan" ? (clampedFanAngle * Math.PI) / 180 : Math.PI * 2;
  const startAngle = mode === "fan" ? -angleSpan / 2 : -Math.PI;
  const innerRadius = maxRadius * Math.max(0, Math.min(0.35, centerGap));
  const mapPoint = (x: number, y: number) => {
    const radius = innerRadius + ((x - LEFT_PAD) / Math.max(1, sourceWidth - LEFT_PAD - RIGHT_PAD)) * (maxRadius - innerRadius);
    const angle = startAngle + ((y - TOP_PAD) / Math.max(1, sourceHeight - TOP_PAD * 2)) * angleSpan;
    return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius, angle, radius };
  };

  layout.nodes.forEach((node) => Object.assign(node, mapPoint(node.x, node.y)));
  layout.segments = layout.segments.map((segment) => {
    const start = mapPoint(segment.x1, segment.y1);
    const end = mapPoint(segment.x2, segment.y2);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  });
  layout.width = size;
  layout.height = size;
  return layout;
}

function collectRadialPaths(root: TreeNode, center: number): Array<{ d: string; child: TreeNode }> {
  const paths: Array<{ d: string; child: TreeNode }> = [];
  const visit = (parent: TreeNode) => {
    parent.children.forEach((child) => {
      if (parent.angle === undefined || parent.radius === undefined || child.angle === undefined || child.radius === undefined) return;
      const arcEnd = polarPoint(center, parent.radius, child.angle);
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

function polarPoint(center: number, radius: number, angle: number) {
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}

function radialTextAnchor(leaf: TreeNode, mode: PhylogeneticTreePreviewProps["layoutMode"]): "start" | "end" {
  if (mode === "rectangular" || leaf.angle === undefined) return "start";
  return Math.cos(leaf.angle) < 0 ? "end" : "start";
}

function radialLabelTransform(leaf: TreeNode, mode: PhylogeneticTreePreviewProps["layoutMode"]): string | undefined {
  if (mode === "rectangular" || leaf.angle === undefined) return undefined;
  let degrees = (leaf.angle * 180) / Math.PI;
  const flip = Math.cos(leaf.angle) < 0;
  if (flip) degrees += 180;
  const offset = flip ? -9 : 9;
  return `rotate(${degrees} ${leaf.x} ${leaf.y}) translate(${offset} 4)`;
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
    .tree-tip-label { font-family: Inter, Arial, sans-serif; font-weight: 800; }
    .tree-support-label { font-family: Menlo, Consolas, monospace; font-size: 10px; font-weight: 800; }
    .tree-tip-label.collision-hidden, .tree-support-label.collision-hidden { opacity: 0; }
    .tree-branch.search-dimmed, .tree-tip-label.search-dimmed { opacity: 0.22; }
    .tree-branch.search-hit { stroke: #d87a33 !important; stroke-width: 4; }
    .tree-tip-label.search-hit { font-weight: 900; }
    .tree-support-dot { stroke: #fbfcfa; stroke-width: 1; }
    .tree-collapsed-clade { fill: #326b4d; opacity: 0.85; }
    .tree-annotation-text { fill: #4f6158; font-family: Inter, Arial, sans-serif; font-size: 10px; font-weight: 700; }
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
