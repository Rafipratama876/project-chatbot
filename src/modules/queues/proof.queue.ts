export const PROOF_QUEUE = 'cl-proof';

export interface ProofJobData {
  /** The `cl_proof` row this job fills in. Created before enqueueing so the
   *  caller gets an id to poll immediately. */
  proofId: string;
  job: import('#/kb/domain/spec.js').JobInput;
  skipRender?: boolean;
  deterministicOnly?: boolean;
}
