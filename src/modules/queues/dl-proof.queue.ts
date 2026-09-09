export const DL_PROOF_QUEUE = 'dl-proof';

export interface DLProofJobData {
  /** The `dl_proof` row this job fills in. Created before enqueueing so the
   *  caller gets an id to poll immediately. */
  proofId: string;
  job: import('#/kb/domain/dl-spec.js').DLJobInput;
  skipRender?: boolean;
  deterministicOnly?: boolean;
}
