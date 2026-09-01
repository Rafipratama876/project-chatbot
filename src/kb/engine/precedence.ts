/**
 * KB §8.2 — precedence, highest wins.
 *
 *   1. BUILDABILITY & SAFETY   Anything that would not light, hold, or is unsafe.
 *   2. LANDLORD / PERMIT       Protrusion limits, permitted area, mandated mount.
 *   3. CUSTOMER EXPLICIT       Written instruction in Additional Information.
 *   4. SIGN PACK HOUSE STANDARD  §6 rules and §8.1 defaults.
 *   5. AGENT DEFAULT           Anything §8.1 does not name.
 *
 * Implemented as ownership per path: once a level claims a field, a weaker
 * level cannot overwrite it, and the refusal is logged rather than dropped.
 * The §8.2 worked case falls out of this: the customer asking for a 4″ tagline
 * as channel letters is level 3, and CL-R-51 writes at level 1, so level 1 wins
 * and the callout explains why.
 */
import type { TraceLog } from './trace.js';

export enum Authority {
  BUILDABILITY = 1,
  PERMIT = 2,
  CUSTOMER = 3,
  HOUSE = 4,
  AGENT = 5,
}

export const AUTHORITY_LABEL: Record<Authority, string> = {
  [Authority.BUILDABILITY]: 'buildability & safety',
  [Authority.PERMIT]: 'landlord / permit',
  [Authority.CUSTOMER]: 'customer explicit',
  [Authority.HOUSE]: 'Sign Pack house standard',
  [Authority.AGENT]: 'agent default',
};

interface Claim { authority: Authority; by: string; value: unknown }

export class PrecedenceResolver {
  private readonly claims = new Map<string, Claim>();

  constructor(private readonly trace: TraceLog) {}

  /** Returns true when the write is allowed to proceed. */
  canWrite(path: string, authority: Authority, by: string, value: unknown): boolean {
    const held = this.claims.get(path);
    if (!held) return true;
    if (authority <= held.authority) return true;

    this.trace.pushRefusal({
      path,
      attemptedBy: by,
      attemptedAuthority: authority,
      heldBy: held.by,
      heldAuthority: held.authority,
      attemptedValue: value,
    });
    return false;
  }

  claim(path: string, authority: Authority, by: string, value: unknown): void {
    const held = this.claims.get(path);
    if (!held || authority <= held.authority) {
      this.claims.set(path, { authority, by, value });
    }
  }

  ownerOf(path: string): Claim | undefined { return this.claims.get(path); }

  /** Fields the customer explicitly set — §9.4 must not report these as defaults. */
  customerClaimed(): string[] {
    return [...this.claims.entries()]
      .filter(([, c]) => c.authority === Authority.CUSTOMER)
      .map(([p]) => p);
  }
}
