const MAX_TOOL_HISTORY = 10;
const MAX_INLINE_PAYLOAD_CHARS = 250_000;
const STORAGE_PREFIX = "bio-learn:tool-history";

export interface ToolHistoryItem<TPayload> {
  id: string;
  toolName: string;
  fileName: string;
  createdAt: string;
  summary: string;
  paramsSummary: string;
  /** Legacy inline payload. New entries restore input from the persisted job. */
  payload?: TPayload;
  jobId?: string;
  inputFileSize?: number;
}

export function readToolHistory<TPayload>(toolName: string): Array<ToolHistoryItem<TPayload>> {
  if (typeof window === "undefined") return [];
  try {
    compactStoredHistories();
    const raw = window.localStorage.getItem(storageKey(toolName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compactStoredHistories(): void {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(`${STORAGE_PREFIX}:`)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const compacted = parsed.map((item) => compactHistoryItem(item as ToolHistoryItem<unknown>));
      window.localStorage.setItem(key, JSON.stringify(compacted));
    } catch {
      // Keep malformed or unavailable storage isolated from normal tool usage.
    }
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
  const previous = readToolHistory<TPayload>(toolName).map(compactHistoryItem);
  const withoutDuplicate = previous.filter(
    (entry) => entry.fileName !== item.fileName || entry.paramsSummary !== item.paramsSummary
  );
  const next = [nextItem, ...withoutDuplicate].slice(0, MAX_TOOL_HISTORY);
  writeToolHistory(toolName, next);
  return next;
}

function compactHistoryItem<TPayload>(item: ToolHistoryItem<TPayload>): ToolHistoryItem<TPayload> {
  if (!item.jobId || item.payload === undefined) return item;
  try {
    if (JSON.stringify(item.payload).length <= MAX_INLINE_PAYLOAD_CHARS) return item;
  } catch {
    return item;
  }
  const compactItem = { ...item };
  delete compactItem.payload;
  return compactItem;
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
