import {
  BadRequestException, Body, Controller, Get, Param, Post, Req, UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CompatService } from './compat.service.js';

@Controller({ path: 'chatbot', version: '1' })
export class CompatController {
  constructor(private readonly compat: CompatService) {}

  @Get('personalities')
  personalities(@Req() request: FastifyRequest) {
    authorize(request);
    return envelope(this.compat.personalities());
  }

  @Post('sessions')
  async create(@Body() body: Record<string, unknown>, @Req() request: FastifyRequest) {
    authorize(request);
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
  async get(@Param('id') id: string, @Req() request: FastifyRequest) {
    authorize(request);
    return envelope(await this.compat.get(id));
  }

  @Post('sessions/:id/messages')
  async send(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: FastifyRequest,
  ) {
    authorize(request);
    return envelope(await this.compat.send(id, body));
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

function authorize(request: FastifyRequest): void {
  const expected = process.env.API_KEY;
  if (!expected) throw new UnauthorizedException('API_KEY is not configured');
  if (request.headers['x-api-key'] !== expected) throw new UnauthorizedException('Invalid API key');
}
