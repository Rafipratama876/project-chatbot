import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

/**
 * The shared-secret check for every route an external caller reaches.
 *
 * A missing `API_KEY` fails closed. The alternative — treating "no key
 * configured" as "no key required" — turns a forgotten environment variable
 * into an open API, and the failure is silent precisely on the deployment
 * where it matters.
 *
 * Compared in constant time. The window is small, but a key is a fixed secret
 * compared on every request, which is the case where an early-exit `!==`
 * actually leaks something.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.API_KEY;
    if (!expected) throw new UnauthorizedException('API_KEY is not configured');

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers['x-api-key'];
    const supplied = Array.isArray(header) ? header[0] : header;
    if (!supplied || !matches(supplied, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}

function matches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself the answer.
  return a.length === b.length && timingSafeEqual(a, b);
}
