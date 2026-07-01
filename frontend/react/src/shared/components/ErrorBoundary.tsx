import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : "界面渲染失败。" };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Tool render error", error, info.componentStack);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.message) {
      this.setState({ message: "" });
    }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="status-message status-message-error tool-error-boundary">
          <strong>这个工具界面渲染失败了</strong>
          <span>{this.state.message}</span>
        </div>
      );
    }

    return this.props.children;
  }
}
