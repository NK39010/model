import { HelpTip } from "../../shared/components/HelpTip";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import type { MsaQualityResult } from "./msaQualityTypes";

interface QualityTracksProps {
  result: MsaQualityResult;
}

export function QualityTracks({ result }: QualityTracksProps) {
  const option = useMemo<EChartsOption>(() => {
    const x = result.position_quality.map((row) => row.position);
    return {
      animation: false,
      color: ["#d84f4f", "#237a57", "#5a64c8"],
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["GAP 比例", "保守性", "熵值"] },
      grid: { top: 42, right: 18, bottom: 34, left: 42 },
      xAxis: { type: "category", data: x, name: "比对位点", axisLabel: { hideOverlap: true } },
      yAxis: [
        { type: "value", min: 0, max: 1 },
        { type: "value", min: 0, name: "熵值" }
      ],
      series: [
        { name: "GAP 比例", type: "line", data: result.tracks.gap_fraction, showSymbol: false, smooth: true },
        { name: "保守性", type: "line", data: result.tracks.conservation, showSymbol: false, smooth: true },
        { name: "熵值", type: "line", yAxisIndex: 1, data: result.tracks.entropy, showSymbol: false, smooth: true }
      ],
      dataZoom: [
        { type: "inside", throttle: 60 },
        { type: "slider", height: 18, bottom: 6 }
      ]
    };
  }, [result]);

  return (
    <section className="report-block">
      <h3>GAP 比例 / 保守性 / 熵值 <HelpTip text="沿比对坐标展示每一列的 GAP 比例、非 GAP 保守性和熵值。高 GAP、高熵或低保守性区域通常需要重点检查。" /></h3>
      <EChart option={option} height={300} />
    </section>
  );
}
