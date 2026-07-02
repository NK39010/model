import { submitJob, type JobRunOptions } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { MsaQualityPayload, MsaQualityResult } from "./msaQualityTypes";

export function runMsaQuality(payload: MsaQualityPayload, options?: JobRunOptions<MsaQualityResult>): Promise<JobRecord<MsaQualityResult>> {
  return submitJob<MsaQualityPayload, MsaQualityResult>("MSA_quality", payload, options);
}
