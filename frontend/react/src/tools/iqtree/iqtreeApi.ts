import { submitJob } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { IqtreePayload, IqtreeResult } from "./iqtreeTypes";

export function runIqtree(payload: IqtreePayload): Promise<JobRecord<IqtreeResult>> {
  return submitJob<IqtreePayload, IqtreeResult>("iqtree_phylogeny", payload);
}
