import { useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart, type EChartHandle } from "./EChart";
import type { IdentityMatrix } from "./msaQualityTypes";

interface IdentityHeatmapProps {
  identityMatrix: IdentityMatrix;
}

const PALETTES = [
  { name: "绿色", low: "#f5f1e8", high: "#245a45" },
  { name: "蓝色", low: "#eef3fb", high: "#2457a6" },
  { name: "红色", low: "#fff2ec", high: "#b93228" },
  { name: "紫色", low: "#f4f0fb", high: "#5f3ea8" },
  { name: "灰色", low: "#f3f4f2", high: "#303a35" }
];

export function IdentityHeatmap({ identityMatrix }: IdentityHeatmapProps) {
  const chartRef = useRef<EChartHandle | null>(null);
  const [lowColor, setLowColor] = useState(PALETTES[0].low);
  const [highColor, setHighColor] = useState(PALETTES[0].high);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [chartWidth, setChartWidth] = useState(720);

  const option = useMemo<EChartsOption>(() => {
    const data = identityMatrix.matrix.flatMap((row, y) => row.map((value, x) => [x, y, Number((value * 100).toFixed(2))]));
    return {
      animation: false,
      textStyle: {
        fontFamily: '"Times New Roman", Times, serif',
        color: "#000000",
        fontSize
      },
      tooltip: {
        textStyle: { fontFamily: '"Times New Roman", Times, serif', color: "#000000", fontSize },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          const value = Array.isArray(item.data) ? item.data : [];
          return `${identityMatrix.labels[value[1] as number]} 与 ${identityMatrix.labels[value[0] as number]}<br/>序列一致性：${value[2]}%`;
        }
      },
      grid: { width: "66%", height: "68%", top: "center", left: "12%" },
      xAxis: {
        type: "category",
        data: identityMatrix.labels,
        axisLabel: { rotate: 45, fontFamily: '"Times New Roman", Times, serif', color: "#000000", fontSize }
      },
      yAxis: {
        type: "category",
        data: identityMatrix.labels,
        axisLabel: { fontFamily: '"Times New Roman", Times, serif', color: "#000000", fontSize }
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { fontFamily: '"Times New Roman", Times, serif', color: "#000000", fontSize },
        inRange: { color: [lowColor, highColor] }
      },
      series: [{ type: "heatmap", data }]
    };
  }, [fontSize, highColor, identityMatrix, lowColor]);

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
    link.download = "pairwise-identity-heatmap.png";
    link.click();
  };

  return (
    <section className="report-block identity-heatmap-block">
      <div className="block-title-row">
        <h3>热力图</h3>
        <button className="compact-action" type="button" onClick={downloadPng}>
          下载 PNG
        </button>
      </div>
      <div className="heatmap-controls" aria-label="序列一致性热力图控制项">
        <div className="heatmap-color-row">
          <label>
            <span>配色方案</span>
            <select onChange={(event) => applyPalette(event.target.value)} defaultValue={PALETTES[0].name}>
              {PALETTES.map((palette) => (
                <option key={palette.name} value={palette.name}>{palette.name}</option>
              ))}
            </select>
          </label>
          <div className="heatmap-color-range">
            <label><span>颜色 A</span><input type="color" value={lowColor} onChange={(event) => setLowColor(event.target.value)} /></label>
            <label><span>颜色 B</span><input type="color" value={highColor} onChange={(event) => setHighColor(event.target.value)} /></label>
            <div className="heatmap-gradient" style={{ background: `linear-gradient(90deg, ${lowColor}, ${highColor})` }} />
          </div>
        </div>
        <div className="heatmap-size-row">
          <label><span>纵横比</span><div className="aspect-ratio-control"><input type="range" min={0.5} max={2} step={0.05} value={aspectRatio} onChange={(event) => setAspectRatio(Number(event.target.value))} aria-label="热力图纵横比" /><output>{aspectRatio.toFixed(2)}:1</output></div></label>
          <label><span>字体大小</span><div className="aspect-ratio-control"><input type="range" min={8} max={24} step={1} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /><output>{fontSize}px</output></div></label>
          <label><span>图片宽度</span><div className="aspect-ratio-control"><input type="range" min={480} max={2400} step={40} value={chartWidth} onChange={(event) => setChartWidth(Number(event.target.value))} /><output>{chartWidth}px</output></div></label>
        </div>
      </div>
      <div className="identity-heatmap-scroll">
        <div className="identity-heatmap-frame" style={{ aspectRatio: `${aspectRatio} / 1`, width: chartWidth }}>
          <EChart ref={chartRef} option={option} height="100%" />
        </div>
      </div>
    </section>
  );
}
