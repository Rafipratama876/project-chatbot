/**
 * KB §7.2 — Type × Mount compatibility matrix, verbatim.
 * `substitute` names the rule that owns the fix; the rule itself does the work.
 */
import type { SignType, MountMethod } from './taxonomy.js';

export type Compat =
  | { kind: 'allowed' }
  | { kind: 'conditional'; rule?: string }
  | { kind: 'substitute'; rule: string };

const A: Compat = { kind: 'allowed' };
const C = (rule?: string): Compat => (rule ? { kind: 'conditional', rule } : { kind: 'conditional' });
const S = (rule: string): Compat => ({ kind: 'substitute', rule });

type Row = Record<MountMethod, Compat>;

export const TYPE_MOUNT_MATRIX: Partial<Record<SignType, Row>> = {
  'CL-T-01': { 'CL-MT-01': A, 'CL-MT-02': A, 'CL-MT-03': A, 'CL-MT-04': A, 'CL-MT-05': A, 'CL-MT-06': C() },
  'CL-T-02': { 'CL-MT-01': S('CL-R-24'), 'CL-MT-02': A, 'CL-MT-03': S('CL-R-25'), 'CL-MT-04': A, 'CL-MT-05': C('CL-R-26'), 'CL-MT-06': C() },
  'CL-T-03': { 'CL-MT-01': S('CL-R-24'), 'CL-MT-02': A, 'CL-MT-03': S('CL-R-25'), 'CL-MT-04': A, 'CL-MT-05': C('CL-R-26'), 'CL-MT-06': C() },
  'CL-T-04': { 'CL-MT-01': A, 'CL-MT-02': A, 'CL-MT-03': A, 'CL-MT-04': A, 'CL-MT-05': A, 'CL-MT-06': C() },
  'CL-T-05': { 'CL-MT-01': A, 'CL-MT-02': A, 'CL-MT-03': A, 'CL-MT-04': A, 'CL-MT-05': A, 'CL-MT-06': C() },
  'CL-T-06': { 'CL-MT-01': S('CL-R-24'), 'CL-MT-02': A, 'CL-MT-03': S('CL-R-25'), 'CL-MT-04': A, 'CL-MT-05': C('CL-R-26'), 'CL-MT-06': C() },
  'CL-T-07': { 'CL-MT-01': A, 'CL-MT-02': A, 'CL-MT-03': A, 'CL-MT-04': A, 'CL-MT-05': A, 'CL-MT-06': C() },
  'CL-T-11': { 'CL-MT-01': A, 'CL-MT-02': A, 'CL-MT-03': C(), 'CL-MT-04': A, 'CL-MT-05': A, 'CL-MT-06': C() },
};

/**
 * §7.2: "Pill boxes, logo boxes and flat cut letters follow the same matrix as
 * CL-T-01 — they have no rear illumination, so no substitution applies."
 */
export function compatFor(type: SignType, mount: MountMethod): Compat {
  const row = TYPE_MOUNT_MATRIX[type] ?? TYPE_MOUNT_MATRIX['CL-T-01']!;
  return row[mount];
}

export const boxCompatFor = (mount: MountMethod): Compat =>
  TYPE_MOUNT_MATRIX['CL-T-01']![mount];
