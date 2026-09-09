export const SC_PROOF_QUEUE = 'sc-proof';

export interface SCProofJobData {
  /** The `sc_proof` row this job fills in. Created before enqueueing so the
   *  caller gets an id to poll immediately. */
  proofId: string;
  job: import('#/kb/domain/sc-spec.js').SCJobInput;
  skipRender?: boolean;
  deterministicOnly?: boolean;
}
