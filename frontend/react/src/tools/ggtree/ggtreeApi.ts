import { submitJob } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { GgtreePayload, GgtreeResult } from "./ggtreeTypes";

export function runGgtree(payload: GgtreePayload): Promise<JobRecord<GgtreeResult>> {
  return submitJob<GgtreePayload, GgtreeResult>("ggtree_visualization", payload);
}
