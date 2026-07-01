interface StatusMessageProps {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}

export function StatusMessage({ tone = "info", children }: StatusMessageProps) {
  return <div className={`status-message status-message-${tone}`}>{children}</div>;
}
