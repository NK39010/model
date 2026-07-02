import { useMemo, useState } from "react";
import { ErrorBoundary } from "../shared/components/ErrorBoundary";
import { BmgePanel } from "../tools/bmge/BmgePanel";
import { GgtreePanel } from "../tools/ggtree/GgtreePanel";
import { IqtreePanel } from "../tools/iqtree/IqtreePanel";
import { MafftPanel } from "../tools/mafft/MafftPanel";
import { MsaQualityPanel } from "../tools/msa-quality/MsaQualityPanel";
import { TrimalPanel } from "../tools/trimal/TrimalPanel";

type CategoryKey = "msa";
type ToolKey = "mafft" | "msa-quality" | "trimal" | "bmge" | "iqtree" | "ggtree";

const CATEGORIES: Array<{ key: CategoryKey; label: string; subtitle: string; shortLabel: string }> = [
  {
    key: "msa",
    label: "Multiple Sequence Alignment",
    subtitle: "多序列比对",
    shortLabel: "MSA"
  }
];

const TOOLS: Record<CategoryKey, Array<{ key: ToolKey; label: string; subtitle: string; shortLabel: string }>> = {
  msa: [
    { key: "mafft", label: "MAFFT", subtitle: "多序列比对", shortLabel: "MAF" },
    { key: "msa-quality", label: "MSA Quality", subtitle: "比对质量评估", shortLabel: "QUA" },
    { key: "trimal", label: "trimAl", subtitle: "比对修剪", shortLabel: "TRM" },
    { key: "bmge", label: "BMGE", subtitle: "熵筛选修剪", shortLabel: "BMG" },
    { key: "iqtree", label: "IQ-TREE", subtitle: "系统发育树", shortLabel: "TREE" },
    { key: "ggtree", label: "R / ggtree", subtitle: "发育树绘图", shortLabel: "GGT" }
  ]
};

export function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("msa");
  const [activeTool, setActiveTool] = useState<ToolKey>("mafft");
  const [qualityInput, setQualityInput] = useState("");
  const [trimalInput, setTrimalInput] = useState("");
  const [bmgeInput, setBmgeInput] = useState("");
  const [iqtreeInput, setIqtreeInput] = useState("");
  const [ggtreeInput, setGgtreeInput] = useState("");
  const [isCategoryCollapsed, setIsCategoryCollapsed] = useState(false);
  const [isToolCollapsed, setIsToolCollapsed] = useState(false);
  const [runningTools, setRunningTools] = useState<Partial<Record<ToolKey, boolean>>>({});
  const runningCallbacks = useMemo(() => Object.fromEntries(
    TOOLS.msa.map((tool) => [tool.key, (running: boolean) => setRunningTools((current) => current[tool.key] === running ? current : { ...current, [tool.key]: running })])
  ) as Record<ToolKey, (running: boolean) => void>, []);

  const analyzeAlignment = (alignedFasta: string) => {
    setQualityInput(alignedFasta);
    setActiveTool("msa-quality");
  };

  const trimAlignment = (alignedFasta: string) => {
    setTrimalInput(alignedFasta);
    setActiveTool("trimal");
  };

  const bmgeTrimAlignment = (alignedFasta: string) => {
    setBmgeInput(alignedFasta);
    setActiveTool("bmge");
  };

  const analyzeTrimmedAlignment = (trimmedFasta: string) => {
    setQualityInput(trimmedFasta);
    setActiveTool("msa-quality");
  };

  const buildTree = (alignedFasta: string) => {
    setIqtreeInput(alignedFasta);
    setActiveTool("iqtree");
  };

  const visualizeTree = (newick: string) => {
    setGgtreeInput(newick);
    setActiveTool("ggtree");
  };

  const chooseCategory = (category: CategoryKey) => {
    setActiveCategory(category);
    setActiveTool(TOOLS[category][0].key);
  };

  const activeCategoryMeta = CATEGORIES.find((category) => category.key === activeCategory) ?? CATEGORIES[0];
  const activeToolMeta = TOOLS[activeCategory].find((tool) => tool.key === activeTool) ?? TOOLS[activeCategory][0];

  return (
    <main
      className={[
        "app-shell",
        "four-level-shell",
        isCategoryCollapsed ? "category-panel-collapsed" : "",
        isToolCollapsed ? "tool-panel-collapsed" : ""
      ].join(" ")}
    >
      <aside className="level-panel brand-panel" aria-label="Bio-Learn">
        <h1>Bio-Learn</h1>
      </aside>

      <aside className="level-panel category-panel" aria-label="Tool categories">
        <div className="level-panel-header">
          <div>
            <span>Category</span>
            <strong>{isCategoryCollapsed ? activeCategoryMeta.shortLabel : "Tool Category"}</strong>
          </div>
          <button
            className="panel-collapse-button"
            type="button"
            onClick={() => setIsCategoryCollapsed((value) => !value)}
            aria-label={isCategoryCollapsed ? "Expand category panel" : "Collapse category panel"}
          >
            {isCategoryCollapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className="level-nav" aria-label="Tool categories">
          {CATEGORIES.map((category) => (
            <button
              key={category.key}
              className={category.key === activeCategory ? "active" : ""}
              onClick={() => chooseCategory(category.key)}
              title={category.label}
            >
              <span>{isCategoryCollapsed ? category.shortLabel : category.label}</span>
              {!isCategoryCollapsed ? <small>{category.subtitle}</small> : null}
            </button>
          ))}
        </nav>
      </aside>

      <aside className="level-panel tool-panel" aria-label="Tools">
        <div className="level-panel-header">
          <div>
            <span>Tool</span>
            <strong>{isToolCollapsed ? activeToolMeta.shortLabel : "Concrete Tool"}</strong>
          </div>
          <button
            className="panel-collapse-button"
            type="button"
            onClick={() => setIsToolCollapsed((value) => !value)}
            aria-label={isToolCollapsed ? "Expand tool panel" : "Collapse tool panel"}
          >
            {isToolCollapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className="level-nav" aria-label="Tools">
          {TOOLS[activeCategory].map((tool) => (
            <button
              key={tool.key}
              className={tool.key === activeTool ? "active" : ""}
              onClick={() => setActiveTool(tool.key)}
              title={tool.label}
            >
              <span className="tool-nav-label">{isToolCollapsed ? tool.shortLabel : tool.label}{runningTools[tool.key] ? <i className="tool-running-dot" aria-label="正在运行" /> : null}</span>
              {!isToolCollapsed ? <small>{tool.subtitle}</small> : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace workspace-panel">
        <div className="workspace-page">
          <div className="workspace-breadcrumb">
            <span>{activeCategoryMeta.label}</span>
            <strong>{activeToolMeta.label}</strong>
          </div>
          <div className="tool-view" hidden={activeTool !== "mafft"}>
            <ErrorBoundary resetKey="mafft">
              <MafftPanel onAnalyzeAlignment={analyzeAlignment} onBuildTree={buildTree} onRunningChange={runningCallbacks.mafft} />
            </ErrorBoundary>
          </div>
          <div className="tool-view" hidden={activeTool !== "msa-quality"}>
            <ErrorBoundary resetKey="msa-quality">
              <MsaQualityPanel initialFasta={qualityInput} onTrimAlignment={trimAlignment} onBmgeAlignment={bmgeTrimAlignment} onBuildTree={buildTree} onRunningChange={runningCallbacks["msa-quality"]} />
            </ErrorBoundary>
          </div>
          <div className="tool-view" hidden={activeTool !== "trimal"}>
            <ErrorBoundary resetKey="trimal">
              <TrimalPanel initialFasta={trimalInput} onAnalyzeTrimmed={analyzeTrimmedAlignment} onBuildTree={buildTree} onRunningChange={runningCallbacks.trimal} />
            </ErrorBoundary>
          </div>
          <div className="tool-view" hidden={activeTool !== "bmge"}>
            <ErrorBoundary resetKey="bmge">
              <BmgePanel initialFasta={bmgeInput} onAnalyzeTrimmed={analyzeTrimmedAlignment} onBuildTree={buildTree} onRunningChange={runningCallbacks.bmge} />
            </ErrorBoundary>
          </div>
          <div className="tool-view" hidden={activeTool !== "iqtree"}>
            <ErrorBoundary resetKey="iqtree">
              <IqtreePanel initialFasta={iqtreeInput} onVisualizeTree={visualizeTree} onRunningChange={runningCallbacks.iqtree} />
            </ErrorBoundary>
          </div>
          <div className="tool-view" hidden={activeTool !== "ggtree"}>
            <ErrorBoundary resetKey="ggtree">
              <GgtreePanel initialNewick={ggtreeInput} onRunningChange={runningCallbacks.ggtree} />
            </ErrorBoundary>
          </div>
        </div>
      </section>
    </main>
  );
}
