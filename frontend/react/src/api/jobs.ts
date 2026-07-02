import type { JobRecord } from "../shared/types/job";

export interface JobRunOptions<TResult> {
  onStarted?: (job: JobRecord<TResult>) => void;
  onUpdate?: (job: JobRecord<TResult>) => void;
}

export async function submitJob<TPayload, TResult>(toolName: string, payload: TPayload, options: JobRunOptions<TResult> = {}): Promise<JobRecord<TResult>> {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tool_name: toolName,
      payload
    })
  });

  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(responseErrorMessage(body, "Job submission failed."));
  }
  let job = body as JobRecord<TResult>;
  options.onStarted?.(job);
  while (job.status === "pending" || job.status === "queued" || job.status === "running") {
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    job = await getJob<TResult>(job.id);
    options.onUpdate?.(job);
  }
  return job;
}

export async function cancelJob<TResult>(jobId: string): Promise<JobRecord<TResult>> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(responseErrorMessage(body, "Failed to stop the job."));
  return body as JobRecord<TResult>;
}

export async function getJob<TResult>(jobId: string): Promise<JobRecord<TResult>> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(responseErrorMessage(body, "Failed to load the saved job."));
  }
  return body as JobRecord<TResult>;
}

export async function getJobInput<TPayload>(jobId: string): Promise<TPayload> {
  const response = await fetch(fileUrl(jobId, "input.json"));
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(responseErrorMessage(body, "Failed to load the saved job input."));
  }
  return body as TPayload;
}

export function fileUrl(jobId: string, fileName: string): string {
  return `/api/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(fileName)}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function responseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}
