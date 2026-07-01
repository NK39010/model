export type JobStatus = "completed" | "failed" | "running" | "queued";

export interface JobRecord<TResult> {
  id: string;
  tool_name: string;
  status: JobStatus;
  workdir: string;
  result: TResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResultFiles {
  [label: string]: string;
}
