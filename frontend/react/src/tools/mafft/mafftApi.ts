import { submitJob } from "../../api/jobs";
import type { JobRecord } from "../../shared/types/job";
import type { MafftPayload, MafftResult } from "./mafftTypes";

export function runMafft(payload: MafftPayload): Promise<JobRecord<MafftResult>> {
  return submitJob<MafftPayload, MafftResult>("mafft_alignment", payload);
}
