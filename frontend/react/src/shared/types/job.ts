export type JobStatus = "completed" | "failed" | "running" | "queued" | "pending";

export interface JobError {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface JobRecord<TResult> {
  id: string;
  tool_name: string;
  status: JobStatus;
  workdir: string;
  result: TResult | null;
  error: JobError | string | null;
  created_at: string;
  updated_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface ResultFiles {
  [label: string]: string;
}
