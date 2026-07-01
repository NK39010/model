import { useEffect, useMemo, useState } from "react";
import type { AlignedRecord, PositionQualityRow } from "./msaQualityTypes";

const WINDOW_SIZE = 120;

const RESIDUE_CLASS: Record<string, string> = {
  A: "residue-a",
  C: "residue-c",
  G: "residue-g",
  T: "residue-t",
  U: "residue-u",
  "-": "residue-gap"
};

interface AlignmentBrowserProps {
  records: AlignedRecord[];
  positions: PositionQualityRow[];
  focusStart: number | null;
}

export function AlignmentBrowser({ records, positions, focusStart }: AlignmentBrowserProps) {
  const alignmentLength = records[0]?.sequence.length ?? 0;
  const [start, setStart] = useState(1);

  useEffect(() => {
    if (focusStart) {
      setStart(Math.min(Math.max(1, focusStart), Math.max(1, alignmentLength - WINDOW_SIZE + 1)));
    }
  }, [alignmentLength, focusStart]);

  const end = Math.min(alignmentLength, start + WINDOW_SIZE - 1);
  const visiblePositions = useMemo(() => positions.slice(start - 1, end), [end, positions, start]);

  return (
    <section className="report-block alignment-block">
      <div className="block-title-row">
        <h3>Alignment Browser</h3>
        <span>
          {start}-{end} / {alignmentLength}
        </span>
      </div>
      <input
        className="position-slider"
        type="range"
        min={1}
        max={Math.max(1, alignmentLength - WINDOW_SIZE + 1)}
        value={start}
        onChange={(event) => setStart(Number(event.target.value))}
      />
      <div className="alignment-browser">
        <div className="alignment-name alignment-ruler-label">Position</div>
        <div className="alignment-ruler">
          {visiblePositions.map((position) => (
            <span key={position.position} className={position.position % 10 === 0 ? "tick-major" : ""}>
              {position.position % 10 === 0 ? position.position : ""}
            </span>
          ))}
        </div>
        <div className="alignment-name consensus-label">Consensus</div>
        <div className="alignment-sequence">
          {visiblePositions.map((position) => (
            <span
              key={position.position}
              className={`residue ${residueClass(position.consensus)} ${position.is_high_gap ? "residue-warn" : ""}`}
              title={`Position ${position.position}, support ${(position.consensus_support * 100).toFixed(1)}%`}
            >
              {position.consensus}
            </span>
          ))}
        </div>
        {records.map((record) => (
          <AlignmentRow key={record.name} record={record} start={start} end={end} />
        ))}
      </div>
    </section>
  );
}

function AlignmentRow({ record, start, end }: { record: AlignedRecord; start: number; end: number }) {
  const visible = record.sequence.slice(start - 1, end);
  return (
    <>
      <div className="alignment-name" title={record.name}>
        {record.name}
      </div>
      <div className="alignment-sequence">
        {Array.from(visible).map((char, index) => (
          <span key={`${record.name}-${start + index}`} className={`residue ${residueClass(char)}`}>
            {char}
          </span>
        ))}
      </div>
    </>
  );
}

function residueClass(char: string): string {
  return RESIDUE_CLASS[char] ?? "residue-other";
}
