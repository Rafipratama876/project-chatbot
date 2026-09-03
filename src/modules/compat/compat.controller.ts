import {
  BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { ApiKeyGuard } from '#/modules/auth/api-key.guard.js';
import { CompatService } from './compat.service.js';

@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller({ path: 'chatbot', version: '1' })
export class CompatController {
  constructor(private readonly compat: CompatService) {}

  @Get('personalities')
  personalities() {
    return envelope(this.compat.personalities());
  }

  @Post('sessions')
  async create(@Body() body: Record<string, unknown>, @Req() request: FastifyRequest) {
    const input = request.isMultipart() ? await multipartFields(request) : body;
    const personality = String(input.personalityId ?? '');
    if (!['channel-letters', 'personalities-channel-letters'].includes(personality)) {
      throw new BadRequestException('Only the Channel Letters personality is supported');
    }
    const raw = input.projectJson;
    const projectJson = typeof raw === 'string' ? parseJson(raw) : raw;
    return envelope(await this.compat.create(projectJson));
  }

  @Get('sessions/:id')
  async get(@Param('id') id: string) {
    return envelope(await this.compat.get(id));
  }

  @Post('sessions/:id/messages')
  async send(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return envelope(await this.compat.send(id, body));
  }

  /**
   * Runs a Project JSON through all six gates and returns the render bundle —
   * the three.js captures, the measured drawings and the construction values —
   * without composing a board.
   *
   * For a caller that owns its own presentation. No session row is created: a
   * session exists to carry a revision conversation, and a caller that composes
   * its own proof runs that conversation itself.
   */
  @Post('render-bundle')
  async renderBundle(@Body() body: Record<string, unknown>, @Req() request: FastifyRequest) {
    const input = request.isMultipart() ? await multipartFields(request) : body;
    const raw = input.projectJson ?? input;
    const projectJson = typeof raw === 'string' ? parseJson(raw) : raw;
    return envelope(await this.compat.renderBundle(projectJson));
  }
}

async function multipartFields(request: FastifyRequest): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      await part.toBuffer();
      continue;
    }
    result[part.fieldname] = part.value;
  }
  return result;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException('projectJson must be valid JSON');
  }
}

function envelope<T>(data: T) {
  return { success: true, data };
}
