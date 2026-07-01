const MAX_TOOL_HISTORY = 10;
const STORAGE_PREFIX = "bio-learn:tool-history";

export interface ToolHistoryItem<TPayload> {
  id: string;
  toolName: string;
  fileName: string;
  createdAt: string;
  summary: string;
  paramsSummary: string;
  payload: TPayload;
  jobId?: string;
  inputFileSize?: number;
}

export function readToolHistory<TPayload>(toolName: string): Array<ToolHistoryItem<TPayload>> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(toolName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addToolHistory<TPayload>(
  toolName: string,
  item: Omit<ToolHistoryItem<TPayload>, "id" | "toolName" | "createdAt">
): Array<ToolHistoryItem<TPayload>> {
  const nextItem: ToolHistoryItem<TPayload> = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    toolName,
    createdAt: new Date().toISOString()
  };
  const previous = readToolHistory<TPayload>(toolName);
  const withoutDuplicate = previous.filter(
    (entry) => entry.fileName !== item.fileName || entry.paramsSummary !== item.paramsSummary
  );
  const next = [nextItem, ...withoutDuplicate].slice(0, MAX_TOOL_HISTORY);
  writeToolHistory(toolName, next);
  return next;
}

function writeToolHistory<TPayload>(toolName: string, items: Array<ToolHistoryItem<TPayload>>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(toolName), JSON.stringify(items));
  } catch {
    // Local history is a convenience feature. If storage is full or unavailable,
    // keep the app workflow usable and silently skip persistence.
  }
}

function storageKey(toolName: string): string {
  return `${STORAGE_PREFIX}:${toolName}`;
}
