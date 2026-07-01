interface TreePreviewProps {
  newick: string;
}

interface TreeNode {
  name: string;
  support: string;
  length: number | null;
  children: TreeNode[];
  x: number;
  y: number;
  distance: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface TreeLayout {
  width: number;
  height: number;
  leaves: TreeNode[];
  nodes: TreeNode[];
  segments: Segment[];
  usesBranchLength: boolean;
}

const LEFT_PAD = 28;
const RIGHT_PAD = 180;
const TOP_PAD = 28;
const ROW_HEIGHT = 30;
const BASE_SVG_WIDTH = 980;

export function TreePreview({ newick }: TreePreviewProps) {
  const parsed = safeParseNewick(newick);
  if (!parsed) {
    return <p className="quiet-text">无法解析 Newick 树文件。</p>;
  }

  const layout = safeBuildLayout(parsed);
  if (!layout) {
    return <p className="quiet-text">无法生成树图预览。</p>;
  }

  if (layout.leaves.length === 0) {
    return <p className="quiet-text">Newick 中没有可展示的叶节点。</p>;
  }

  return (
    <div className="tree-preview" aria-label="Phylogenetic tree preview">
      <div className="tree-preview-meta">
        <span>{layout.leaves.length} tips</span>
        <span>{layout.usesBranchLength ? "按分支长度缩放" : "按拓扑层级缩放"}</span>
        <button className="compact-action tree-download-action" type="button" onClick={() => downloadTreeSvg(layout)}>
          下载 SVG
        </button>
      </div>
      <svg
        className="tree-preview-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ minWidth: layout.width }}
        role="img"
        aria-label="IQ-TREE phylogenetic tree"
      >
        {layout.segments.map((segment, index) => (
          <line
            className="tree-branch"
            key={`segment-${index}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
          />
        ))}
        {layout.nodes.map((node, index) => (
          <g key={`node-${index}`}>
            <circle className={node.children.length > 0 ? "tree-node internal" : "tree-node tip"} cx={node.x} cy={node.y} r={node.children.length > 0 ? 3 : 2.5} />
            {node.children.length > 0 && node.support ? (
              <text className="tree-support-label" x={node.x + 7} y={node.y - 6}>
                {node.support}
              </text>
            ) : null}
          </g>
        ))}
        {layout.leaves.map((leaf, index) => (
          <text className="tree-tip-label" key={`label-${leaf.name}-${index}`} x={leaf.x + 8} y={leaf.y + 4}>
            <title>{leaf.name}</title>
            {leaf.name}
          </text>
        ))}
      </svg>
    </div>
  );
}

function safeParseNewick(input: string): TreeNode | null {
  try {
    return parseNewick(input);
  } catch {
    return null;
  }
}

function safeBuildLayout(root: TreeNode): TreeLayout | null {
  try {
    return buildLayout(root);
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

function buildLayout(root: TreeNode): TreeLayout {
  const leaves: TreeNode[] = [];
  const nodes: TreeNode[] = [];
  const segments: Segment[] = [];
  const usesBranchLength = hasBranchLength(root);
  const width = estimateWidth(root);

  assignDistances(root, 0, usesBranchLength);
  const maxDistance = Math.max(findMaxDistance(root), 1);
  const drawableWidth = width - LEFT_PAD - RIGHT_PAD;

  let leafIndex = 0;
  const assignCoordinates = (node: TreeNode) => {
    nodes.push(node);
    node.x = LEFT_PAD + (node.distance / maxDistance) * drawableWidth;

    if (node.children.length === 0) {
      node.y = TOP_PAD + leafIndex * ROW_HEIGHT;
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
    height: Math.max(TOP_PAD * 2 + Math.max(leaves.length - 1, 0) * ROW_HEIGHT, 120),
    leaves,
    nodes,
    segments,
    usesBranchLength
  };
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
    segments.push({ x1: node.x, y1: child.y, x2: child.x, y2: child.y });
    collectSegments(child, segments);
  });
}

function hasBranchLength(node: TreeNode): boolean {
  return node.length !== null || node.children.some(hasBranchLength);
}

function findMaxDistance(node: TreeNode): number {
  return Math.max(node.distance, ...node.children.map(findMaxDistance));
}

function estimateWidth(root: TreeNode): number {
  const labels = collectLeafNames(root);
  const longestLabel = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.max(BASE_SVG_WIDTH, 800 + Math.min(longestLabel * 8, 520));
}

function collectLeafNames(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.name || "unnamed"];
  return node.children.flatMap(collectLeafNames);
}

function isNumericLabel(label: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(label);
}

function unquote(label: string): string {
  if ((label.startsWith("'") && label.endsWith("'")) || (label.startsWith("\"") && label.endsWith("\""))) {
    return label.slice(1, -1);
  }
  return label;
}

function downloadTreeSvg(layout: TreeLayout) {
  const svg = buildTreeSvgMarkup(layout);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "iqtree-phylogenetic-tree.svg";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildTreeSvgMarkup(layout: TreeLayout): string {
  const branches = layout.segments
    .map(
      (segment) =>
        `<line class="tree-branch" x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" />`
    )
    .join("");
  const nodes = layout.nodes
    .map((node) => {
      const className = node.children.length > 0 ? "tree-node internal" : "tree-node tip";
      const radius = node.children.length > 0 ? 3 : 2.5;
      const support =
        node.children.length > 0 && node.support
          ? `<text class="tree-support-label" x="${node.x + 7}" y="${node.y - 6}">${escapeXml(node.support)}</text>`
          : "";
      return `<g><circle class="${className}" cx="${node.x}" cy="${node.y}" r="${radius}" />${support}</g>`;
    })
    .join("");
  const labels = layout.leaves
    .map((leaf) => `<text class="tree-tip-label" x="${leaf.x + 8}" y="${leaf.y + 4}">${escapeXml(leaf.name)}</text>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="IQ-TREE phylogenetic tree">
  <style>
    .tree-branch { stroke: #6f8376; stroke-width: 2; stroke-linecap: square; fill: none; }
    .tree-node { stroke: #fbfcfa; stroke-width: 1.5; }
    .tree-node.internal { fill: #326b4d; }
    .tree-node.tip { fill: #1d3528; }
    .tree-tip-label { fill: #17211c; font-family: Inter, Arial, sans-serif; font-size: 12px; font-weight: 800; }
    .tree-support-label { fill: #9a5a35; font-family: Menlo, Consolas, monospace; font-size: 10px; font-weight: 800; }
  </style>
  ${branches}
  ${nodes}
  ${labels}
</svg>
`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case "\"":
        return "&quot;";
      default:
        return character;
    }
  });
}
