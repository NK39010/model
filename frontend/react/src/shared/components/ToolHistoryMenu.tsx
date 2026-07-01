import { useEffect, useRef, useState } from "react";
import type { ToolHistoryItem } from "../utils/toolHistory";

interface ToolHistoryMenuProps<TPayload> {
  items: Array<ToolHistoryItem<TPayload>>;
  onRestore: (item: ToolHistoryItem<TPayload>) => void;
}

export function ToolHistoryMenu<TPayload>({ items, onRestore }: ToolHistoryMenuProps<TPayload>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="tool-history-menu" ref={rootRef}>
      <button
        className="tool-history-trigger"
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label="打开本工具历史记录"
        title="历史记录"
      >
        <span className="tool-history-icon" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="tool-history-panel" role="dialog" aria-label="历史记录">
          <div className="tool-history-title">历史记录</div>
          {items.length === 0 ? (
            <p className="tool-history-empty">暂无本工具历史记录</p>
          ) : (
            <div className="tool-history-list">
              {items.map((item) => (
                <button
                  type="button"
                  className="tool-history-item"
                  key={item.id}
                  onClick={() => {
                    onRestore(item);
                    setIsOpen(false);
                  }}
                >
                  <strong>{item.fileName}</strong>
                  <span>{item.summary}</span>
                  <span>{item.paramsSummary} · {formatHistoryTime(item.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
