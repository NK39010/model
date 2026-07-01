interface HelpTipProps {
  text: string;
  label?: string;
}

export function HelpTip({ text, label = "参数说明" }: HelpTipProps) {
  return (
    <span className="help-tip" tabIndex={0} role="button" aria-label={`${label}：${text}`}>
      <span aria-hidden="true">?</span>
      <span className="help-tip-content" role="tooltip">{text}</span>
    </span>
  );
}
