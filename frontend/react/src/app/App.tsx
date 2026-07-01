import { useState } from "react";
import { MafftPanel } from "../tools/mafft/MafftPanel";
import { MsaQualityPanel } from "../tools/msa-quality/MsaQualityPanel";

type CategoryKey = "msa";
type ToolKey = "mafft" | "msa-quality";

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
    { key: "msa-quality", label: "MSA Quality", subtitle: "比对质量评估", shortLabel: "QUA" }
  ]
};

export function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("msa");
  const [activeTool, setActiveTool] = useState<ToolKey>("mafft");
  const [qualityInput, setQualityInput] = useState("");
  const [isCategoryCollapsed, setIsCategoryCollapsed] = useState(false);
  const [isToolCollapsed, setIsToolCollapsed] = useState(false);

  const analyzeAlignment = (alignedFasta: string) => {
    setQualityInput(alignedFasta);
    setActiveTool("msa-quality");
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
              <span>{isToolCollapsed ? tool.shortLabel : tool.label}</span>
              {!isToolCollapsed ? <small>{tool.subtitle}</small> : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace workspace-panel">
        <div className="workspace-page" key={`${activeCategory}-${activeTool}`}>
          <div className="workspace-breadcrumb">
            <span>{activeCategoryMeta.label}</span>
            <strong>{activeToolMeta.label}</strong>
          </div>
          {activeTool === "mafft" ? (
            <MafftPanel onAnalyzeAlignment={analyzeAlignment} />
          ) : (
            <MsaQualityPanel initialFasta={qualityInput} />
          )}
        </div>
      </section>
    </main>
  );
}
