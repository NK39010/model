import * as echarts from "echarts";
import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";

interface EChartProps {
  option: echarts.EChartsOption;
  height?: CSSProperties["height"];
}

export interface EChartHandle {
  getDataUrl: () => string | null;
}

export const EChart = forwardRef<EChartHandle, EChartProps>(function EChart({ option, height = 260 }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useImperativeHandle(ref, () => ({
    getDataUrl: () =>
      chartRef.current?.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff"
      }) ?? null
  }));

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option);
    const resize = () => chart.resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", resize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      chartRef.current = null;
      chart.dispose();
    };
  }, [option]);

  return <div className="echart" ref={containerRef} style={{ height }} />;
});
