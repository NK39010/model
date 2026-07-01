import type { JobRecord } from "../shared/types/job";

export async function submitJob<TPayload, TResult>(toolName: string, payload: TPayload): Promise<JobRecord<TResult>> {
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

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Job submission failed.");
  }
  return body as JobRecord<TResult>;
}

export async function getJob<TResult>(jobId: string): Promise<JobRecord<TResult>> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to load the saved job.");
  }
  return body as JobRecord<TResult>;
}

export function fileUrl(jobId: string, fileName: string): string {
  return `/api/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(fileName)}`;
}
