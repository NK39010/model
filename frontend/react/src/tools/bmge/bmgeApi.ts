import { submitJob, type JobRunOptions } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { BmgePayload, BmgeResult } from "./bmgeTypes";

export function runBmge(payload: BmgePayload, options?: JobRunOptions<BmgeResult>): Promise<JobRecord<BmgeResult>> {
  return submitJob<BmgePayload, BmgeResult>("BMGE", payload, options);
}
