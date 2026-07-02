import { submitJob, type JobRunOptions } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { GgtreePayload, GgtreeResult } from "./ggtreeTypes";

export function runGgtree(payload: GgtreePayload, options?: JobRunOptions<GgtreeResult>): Promise<JobRecord<GgtreeResult>> {
  return submitJob<GgtreePayload, GgtreeResult>("ggtree_visualization", payload, options);
}
