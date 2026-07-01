import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { AlignedRecord, PositionQualityRow } from "./msaQualityTypes";

const RESIDUE_WIDTH = 14;
const NAME_COLUMN_WIDTH = 160;
type AlignmentColorMode = "conservation" | "non-gap-conservation" | "residue" | "quality";

const NUCLEOTIDE_RESIDUE_CLASS: Record<string, string> = {
  A: "residue-a",
  C: "residue-c",
  G: "residue-g",
  T: "residue-t",
  U: "residue-u",
  "-": "residue-gap"
};

const PROTEIN_RESIDUE_CLASS: Record<string, string> = {
  A: "residue-protein-hydrophobic",
  V: "residue-protein-hydrophobic",
  I: "residue-protein-hydrophobic",
  L: "residue-protein-hydrophobic",
  M: "residue-protein-hydrophobic",
  F: "residue-protein-hydrophobic",
  W: "residue-protein-hydrophobic",
  Y: "residue-protein-hydrophobic",
  S: "residue-protein-polar",
  T: "residue-protein-polar",
  N: "residue-protein-polar",
  Q: "residue-protein-polar",
  K: "residue-protein-positive",
  R: "residue-protein-positive",
  H: "residue-protein-positive",
  D: "residue-protein-negative",
  E: "residue-protein-negative",
  G: "residue-protein-glycine",
  P: "residue-protein-proline",
  C: "residue-protein-cysteine",
  "-": "residue-gap"
};

interface AlignmentBrowserProps {
  records: AlignedRecord[];
  positions: PositionQualityRow[];
  focusStart: number | null;
  sequenceType: string;
  highlightedPositions?: number[];
  highlightLabel?: string;
  highlightCount?: number;
  onClearHighlight?: () => void;
}

export function AlignmentBrowser({
  records,
  positions,
  focusStart,
  sequenceType,
  highlightedPositions = [],
  highlightLabel,
  highlightCount = 0,
  onClearHighlight
}: AlignmentBrowserProps) {
  const alignmentLength = records[0]?.sequence.length ?? 0;
  const [start, setStart] = useState(1);
  const [windowSize, setWindowSize] = useState(40);
  const [colorMode, setColorMode] = useState<AlignmentColorMode>("conservation");
  const browserRef = useRef<HTMLDivElement | null>(null);
  const scrollbarRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerX: number; scrollLeft: number } | null>(null);

  useEffect(() => {
    const browser = browserRef.current;
    if (!browser) return;

    const updateWindowSize = () => {
      const sequenceWidth = Math.max(RESIDUE_WIDTH, browser.clientWidth - NAME_COLUMN_WIDTH);
      setWindowSize(Math.max(1, Math.ceil(sequenceWidth / RESIDUE_WIDTH) + 2));
    };
    const observer = new ResizeObserver(updateWindowSize);
    observer.observe(browser);
    updateWindowSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusStart) return;
    const nextStart = Math.min(Math.max(1, focusStart), Math.max(1, alignmentLength - windowSize + 1));
    setStart(nextStart);
    if (scrollbarRef.current) scrollbarRef.current.scrollLeft = (nextStart - 1) * RESIDUE_WIDTH;
  }, [alignmentLength, focusStart, windowSize]);

  const end = Math.min(alignmentLength, start + windowSize - 1);
  const visiblePositions = useMemo(() => positions.slice(start - 1, end), [end, positions, start]);
  const highlightedPositionSet = useMemo(() => new Set(highlightedPositions), [highlightedPositions]);

  const handleHorizontalScroll = () => {
    const scrollbar = scrollbarRef.current;
    if (!scrollbar) return;
    setStart(
      Math.min(
        Math.floor(scrollbar.scrollLeft / RESIDUE_WIDTH) + 1,
        Math.max(1, alignmentLength - windowSize + 1)
      )
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scrollbar = scrollbarRef.current;
    if (!scrollbar) return;
    dragRef.current = { pointerX: event.clientX, scrollLeft: scrollbar.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const scrollbar = scrollbarRef.current;
    const drag = dragRef.current;
    if (!scrollbar || !drag) return;
    scrollbar.scrollLeft = drag.scrollLeft - (event.clientX - drag.pointerX);
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.classList.remove("dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const scrollbar = scrollbarRef.current;
    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (!scrollbar || horizontalDelta === 0) return;
    event.preventDefault();
    scrollbar.scrollLeft += horizontalDelta;
  };

  return (
    <section className="report-block alignment-block">
      <div className="block-title-row">
        <h3>序列速览</h3>
        <span>
          {start}-{end} / {alignmentLength}
        </span>
      </div>
      <p className="alignment-scroll-hint">
        拖动横向滚动条连续浏览完整比对；默认按有效保守性配色。
      </p>
      {highlightLabel ? (
        <div className="alignment-highlight-banner">
          <span>
            正在高亮：{highlightLabel}
            {highlightCount ? ` · ${highlightCount.toLocaleString()} 个` : ""}
          </span>
          <button type="button" onClick={onClearHighlight}>清除</button>
        </div>
      ) : null}
      <div className="alignment-mode-control" aria-label="序列速览配色方式">
        <span>配色方式</span>
        {ALIGNMENT_COLOR_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={colorMode === mode.value ? "active" : ""}
            onClick={() => setColorMode(mode.value)}
            aria-pressed={colorMode === mode.value}
            title={mode.description}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div className="alignment-horizontal-scroll" ref={scrollbarRef} onScroll={handleHorizontalScroll}>
        <div className="alignment-horizontal-spacer" style={{ width: alignmentLength * RESIDUE_WIDTH }} />
      </div>
      <div
        className="alignment-browser"
        ref={browserRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={handleWheel}
      >
        <div className="alignment-name alignment-ruler-label">位点</div>
        <div className="alignment-ruler">
          {visiblePositions.map((position) => (
            <span
              key={position.position}
              className={`${position.position % 10 === 0 ? "tick-major" : ""} ${
                highlightedPositionSet.has(position.position) ? "alignment-column-highlight" : ""
              }`}
            >
              {position.position % 10 === 0 ? position.position : ""}
            </span>
          ))}
        </div>
        <div className="alignment-name consensus-label">共识序列</div>
        <div className="alignment-sequence">
          {visiblePositions.map((position) => (
            <span
              key={position.position}
              className={`residue ${residueClass(position.consensus, sequenceType, position, colorMode)} ${position.is_high_gap ? "residue-warn" : ""} ${
                highlightedPositionSet.has(position.position) ? "residue-highlight" : ""
              }`}
              title={positionTitle(position)}
            >
              {position.consensus}
            </span>
          ))}
        </div>
        {records.map((record) => (
          <AlignmentRow
            key={record.name}
            record={record}
            start={start}
            end={end}
            sequenceType={sequenceType}
            visiblePositions={visiblePositions}
            colorMode={colorMode}
            highlightedPositionSet={highlightedPositionSet}
          />
        ))}
      </div>
    </section>
  );
}

function AlignmentRow({
  record,
  start,
  end,
  sequenceType,
  visiblePositions,
  colorMode,
  highlightedPositionSet
}: {
  record: AlignedRecord;
  start: number;
  end: number;
  sequenceType: string;
  visiblePositions: PositionQualityRow[];
  colorMode: AlignmentColorMode;
  highlightedPositionSet: Set<number>;
}) {
  const visible = record.sequence.slice(start - 1, end);
  return (
    <>
      <div className="alignment-name" title={record.name}>
        {record.name}
      </div>
      <div className="alignment-sequence">
        {Array.from(visible).map((char, index) => (
          <span
            key={`${record.name}-${start + index}`}
            className={`residue ${residueClass(char, sequenceType, visiblePositions[index], colorMode)} ${
              highlightedPositionSet.has(start + index) ? "residue-highlight" : ""
            }`}
            title={visiblePositions[index] ? positionTitle(visiblePositions[index]) : undefined}
          >
            {char}
          </span>
        ))}
      </div>
    </>
  );
}

const ALIGNMENT_COLOR_MODES: Array<{
  value: AlignmentColorMode;
  label: string;
  description: string;
}> = [
  { value: "conservation", label: "有效保守性", description: "按非 GAP 保守性与非 GAP 比例综合后的有效保守性配色。" },
  { value: "non-gap-conservation", label: "非 GAP 保守性", description: "只按非 GAP 残基内部的一致程度配色，高 GAP 列仍可能显示为高保守。" },
  { value: "residue", label: "残基类型", description: "按核苷酸或氨基酸性质配色。" },
  { value: "quality", label: "GAP / 质量问题", description: "突出高 GAP、低保守性和高熵值比对列。" }
];

function residueClass(
  char: string,
  sequenceType: string,
  position: PositionQualityRow | undefined,
  colorMode: AlignmentColorMode
): string {
  if (colorMode === "conservation" && position) {
    if (char === "-") return "residue-gap";
    const effectiveConservation = position.conservation * (1 - position.gap_fraction);
    if (effectiveConservation >= 0.9) return "residue-conservation-high";
    if (effectiveConservation >= 0.6) return "residue-conservation-mid";
    return "residue-conservation-low";
  }

  if (colorMode === "non-gap-conservation" && position) {
    if (char === "-") return "residue-gap";
    if (position.conservation >= 0.9) return "residue-conservation-high";
    if (position.conservation >= 0.6) return "residue-conservation-mid";
    return "residue-conservation-low";
  }

  if (colorMode === "quality" && position) {
    if (char === "-") return "residue-gap";
    if (position.is_high_gap) return "residue-quality-gap";
    if (position.is_low_conservation) return "residue-quality-low-conservation";
    if (position.is_high_entropy) return "residue-quality-high-entropy";
    return "residue-quality-ok";
  }

  const palette = sequenceType.toLowerCase() === "protein" ? PROTEIN_RESIDUE_CLASS : NUCLEOTIDE_RESIDUE_CLASS;
  return palette[char.toUpperCase()] ?? "residue-other";
}

function positionTitle(position: PositionQualityRow): string {
  return [
    `比对位点 ${position.position}`,
    `非 GAP 保守性 ${(position.conservation * 100).toFixed(1)}%`,
    `有效保守性 ${(position.conservation * (1 - position.gap_fraction) * 100).toFixed(1)}%`,
    `GAP 比例 ${(position.gap_fraction * 100).toFixed(1)}%`,
    `熵值 ${position.entropy.toFixed(2)}`,
    `共识支持度 ${(position.consensus_support * 100).toFixed(1)}%`
  ].join("，");
}
