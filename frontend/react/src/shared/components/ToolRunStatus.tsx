import { formatElapsed } from "../hooks/useRunTimer";

interface ToolRunStatusProps {
  title: string;
  description: string;
  elapsedSeconds: number;
  stage: string;
  metrics?: Array<{ label: string; value: string | number }>;
  onCancel?: () => void;
}

export function ToolRunStatus({ title, description, elapsedSeconds, stage, metrics = [], onCancel }: ToolRunStatusProps) {
  return (
    <section className="report-block tool-run-status" aria-live="polite">
      <div className="tool-run-status-header">
        <span className="run-spinner" aria-hidden="true" />
        <div className="tool-run-status-copy">
          <div className="tool-run-status-title-row">
            <h3>{title}</h3>
            <div className="tool-run-actions"><strong>{formatElapsed(elapsedSeconds)}</strong>{onCancel ? <button type="button" onClick={onCancel}>停止任务</button> : null}</div>
          </div>
          <p>{description}</p>
        </div>
      </div>
      <div className="tool-run-stage">
        <span className="tool-run-stage-dot" />
        <span>当前阶段</span>
        <strong>{stage}</strong>
      </div>
      {metrics.length > 0 ? (
        <div className="tool-run-metrics">
          {metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}
        </div>
      ) : null}
      <div className="tool-run-progress" aria-label="任务正在运行"><span /></div>
      <p className="tool-run-progress-note">此工具暂未提供可靠百分比，完成前显示实时阶段与运行时间。</p>
    </section>
  );
}
