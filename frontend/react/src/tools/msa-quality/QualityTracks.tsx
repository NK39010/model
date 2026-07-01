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
      legend: { top: 0, data: ["Gap", "Conservation", "Entropy"] },
      grid: { top: 42, right: 18, bottom: 34, left: 42 },
      xAxis: { type: "category", data: x, name: "Position", axisLabel: { hideOverlap: true } },
      yAxis: [
        { type: "value", min: 0, max: 1 },
        { type: "value", min: 0, name: "Entropy" }
      ],
      series: [
        { name: "Gap", type: "line", data: result.tracks.gap_fraction, showSymbol: false, smooth: true },
        { name: "Conservation", type: "line", data: result.tracks.conservation, showSymbol: false, smooth: true },
        { name: "Entropy", type: "line", yAxisIndex: 1, data: result.tracks.entropy, showSymbol: false, smooth: true }
      ],
      dataZoom: [
        { type: "inside", throttle: 60 },
        { type: "slider", height: 18, bottom: 6 }
      ]
    };
  }, [result]);

  return (
    <section className="report-block">
      <h3>Gap / Conservation / Entropy</h3>
      <EChart option={option} height={300} />
    </section>
  );
}
