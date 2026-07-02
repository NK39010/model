import { submitJob, type JobRunOptions } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { TrimalPayload, TrimalResult } from "./trimalTypes";

export function runTrimal(payload: TrimalPayload, options?: JobRunOptions<TrimalResult>): Promise<JobRecord<TrimalResult>> {
  return submitJob<TrimalPayload, TrimalResult>("trimal_alignment_trimming", payload, options);
}
