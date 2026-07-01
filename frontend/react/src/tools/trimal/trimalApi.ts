import { submitJob } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { TrimalPayload, TrimalResult } from "./trimalTypes";

export function runTrimal(payload: TrimalPayload): Promise<JobRecord<TrimalResult>> {
  return submitJob<TrimalPayload, TrimalResult>("trimal_alignment_trimming", payload);
}
