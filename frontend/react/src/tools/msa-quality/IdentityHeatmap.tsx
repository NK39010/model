import { useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart, type EChartHandle } from "./EChart";
import type { IdentityMatrix } from "./msaQualityTypes";

interface IdentityHeatmapProps {
  identityMatrix: IdentityMatrix;
}

const PALETTES = [
  { name: "Green", low: "#f5f1e8", high: "#245a45" },
  { name: "Blue", low: "#eef3fb", high: "#2457a6" },
  { name: "Red", low: "#fff2ec", high: "#b93228" },
  { name: "Purple", low: "#f4f0fb", high: "#5f3ea8" },
  { name: "Gray", low: "#f3f4f2", high: "#303a35" }
];

export function IdentityHeatmap({ identityMatrix }: IdentityHeatmapProps) {
  const chartRef = useRef<EChartHandle | null>(null);
  const [lowColor, setLowColor] = useState(PALETTES[0].low);
  const [highColor, setHighColor] = useState(PALETTES[0].high);
  const [aspectRatio, setAspectRatio] = useState(1);

  const option = useMemo<EChartsOption>(() => {
    const data = identityMatrix.matrix.flatMap((row, y) => row.map((value, x) => [x, y, Number((value * 100).toFixed(2))]));
    return {
      animation: false,
      textStyle: {
        fontFamily: '"Times New Roman", Times, serif',
        color: "#000000"
      },
      tooltip: {
        textStyle: { fontFamily: '"Times New Roman", Times, serif', color: "#000000" },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          const value = Array.isArray(item.data) ? item.data : [];
          return `${identityMatrix.labels[value[1] as number]} vs ${identityMatrix.labels[value[0] as number]}<br/>${value[2]}%`;
        }
      },
      grid: { width: "66%", height: "68%", top: "center", left: "12%" },
      xAxis: {
        type: "category",
        data: identityMatrix.labels,
        axisLabel: { rotate: 45, fontFamily: '"Times New Roman", Times, serif', color: "#000000" }
      },
      yAxis: {
        type: "category",
        data: identityMatrix.labels,
        axisLabel: { fontFamily: '"Times New Roman", Times, serif', color: "#000000" }
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { fontFamily: '"Times New Roman", Times, serif', color: "#000000" },
        inRange: { color: [lowColor, highColor] }
      },
      series: [{ type: "heatmap", data }]
    };
  }, [highColor, identityMatrix, lowColor]);

  const applyPalette = (name: string) => {
    const palette = PALETTES.find((item) => item.name === name);
    if (!palette) {
      return;
    }
    setLowColor(palette.low);
    setHighColor(palette.high);
  };

  const downloadPng = () => {
    const dataUrl = chartRef.current?.getDataUrl();
    if (!dataUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "identity-matrix-heatmap.png";
    link.click();
  };

  return (
    <section className="report-block">
      <div className="block-title-row">
        <h3>Identity Matrix</h3>
        <button className="compact-action" type="button" onClick={downloadPng}>
          Download PNG
        </button>
      </div>
      <div className="heatmap-controls" aria-label="Identity heatmap color controls">
        <label>
          <span>Palette</span>
          <select onChange={(event) => applyPalette(event.target.value)} defaultValue={PALETTES[0].name}>
            {PALETTES.map((palette) => (
              <option key={palette.name} value={palette.name}>
                {palette.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Aspect Ratio</span>
          <div className="aspect-ratio-control">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={aspectRatio}
              onChange={(event) => setAspectRatio(Number(event.target.value))}
              aria-label="Heatmap aspect ratio"
            />
            <output>{aspectRatio.toFixed(2)}:1</output>
          </div>
        </label>
        <label>
          <span>Low</span>
          <input type="color" value={lowColor} onChange={(event) => setLowColor(event.target.value)} />
        </label>
        <label>
          <span>High</span>
          <input type="color" value={highColor} onChange={(event) => setHighColor(event.target.value)} />
        </label>
        <div className="heatmap-gradient" style={{ background: `linear-gradient(90deg, ${lowColor}, ${highColor})` }} />
      </div>
      <div className="identity-heatmap-frame" style={{ aspectRatio: `${aspectRatio} / 1` }}>
        <EChart ref={chartRef} option={option} height="100%" />
      </div>
    </section>
  );
}
