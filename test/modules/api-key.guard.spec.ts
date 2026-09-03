import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiKeyGuard } from '#/modules/auth/api-key.guard.js';

const guard = new ApiKeyGuard();

const contextWith = (headers: Record<string, unknown>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

afterEach(() => {
  delete process.env.API_KEY;
});

describe('ApiKeyGuard', () => {
  it('admits a request carrying the configured key', () => {
    process.env.API_KEY = 'correct-horse-battery-staple';
    expect(guard.canActivate(contextWith({ 'x-api-key': 'correct-horse-battery-staple' }))).toBe(true);
  });

  it('fails closed when no key is configured', () => {
    // The dangerous alternative is treating "unconfigured" as "unprotected",
    // which turns a missing env var into an open API on exactly the deployment
    // where that matters most.
    expect(() => guard.canActivate(contextWith({ 'x-api-key': 'anything' })))
      .toThrow(/API_KEY is not configured/);
  });

  it.each([
    ['absent', {}],
    ['empty', { 'x-api-key': '' }],
    ['wrong', { 'x-api-key': 'nope' }],
    ['a prefix of the real key', { 'x-api-key': 'correct-horse' }],
    ['the real key plus padding', { 'x-api-key': 'correct-horse-battery-staple-extra' }],
  ])('rejects a %s key', (_name, headers) => {
    process.env.API_KEY = 'correct-horse-battery-staple';
    expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
  });

  it('reads the first value when the header arrives repeated', () => {
    // Fastify collapses a repeated header into an array. Comparing the array
    // itself always fails, which would lock out a legitimate caller behind a
    // proxy that duplicates the header.
    process.env.API_KEY = 'k';
    expect(guard.canActivate(contextWith({ 'x-api-key': ['k', 'other'] }))).toBe(true);
  });
});
