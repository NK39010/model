import { submitJob, type JobRunOptions } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { MafftPayload, MafftResult } from "./mafftTypes";

export function runMafft(payload: MafftPayload, options?: JobRunOptions<MafftResult>): Promise<JobRecord<MafftResult>> {
  return submitJob<MafftPayload, MafftResult>("mafft_alignment", payload, options);
}
