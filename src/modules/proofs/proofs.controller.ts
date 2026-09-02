import {
  BadRequestException, Body, Controller, Get, Header, NotFoundException,
  Param, Post, Query, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodError } from 'zod';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ProofsService } from './proofs.service.js';
import { PROOF_QUEUE, type ProofJobData } from '#/modules/queues/proof.queue.js';
import { CreateProofDto, ReviseProofDto } from './dto/create-proof.dto.js';
import { ProofResponseDto } from './dto/proof-response.dto.js';
import { ThresholdService } from '#/modules/knowledge/threshold.service.js';
import { DesignReferenceService } from '#/modules/knowledge/design-reference.service.js';
import { renderSpecBlock } from '#/kb/output/specBlock.js';
import { renderDisclosures, buildDisclosures } from '#/kb/output/disclosures.js';

@ApiTags('proofs')
@Controller({ path: 'proofs', version: '1' })
export class ProofsController {
  constructor(
    private readonly proofs: ProofsService,
    private readonly thresholds: ThresholdService,
    private readonly designRefs: DesignReferenceService,
    @InjectQueue(PROOF_QUEUE) private readonly queue: Queue<ProofJobData>,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Run a job through all six gates and produce a proof.',
    description:
      'Gate 1 intake → Gate 2 composition (§6.0) → Gate 3 defaults (§8.1) → ' +
      'Gate 4 validation (§6.1–§6.7) → Gate 5 render contract (§9.2) → Gate 6 output (§9.3/§9.4).',
  })
  async create(
    @Body() body: unknown,
    @Query('async') async_?: string,
  ): Promise<ProofResponseDto> {
    const { job, skipRender, deterministicOnly } = this.parse(body);

    if (async_ === 'true') {
      // The row is reserved before enqueueing so the caller gets an id to poll
      // immediately, rather than after a render it is not waiting on.
      const reserved = await this.proofs.reserve(job);
      await this.queue.add('render', {
        proofId: reserved.id, job, skipRender, deterministicOnly,
      });
      return ProofResponseDto.from(reserved);
    }

    return ProofResponseDto.from(await this.proofs.create(job, { skipRender, deterministicOnly }));
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Run the rules without rendering or persisting.',
    description: 'Deterministic path only — no model calls. Judgments escalate rather than guess.',
  })
  async preview(@Body() body: unknown) {
    const { job } = this.parse(body);
    const { spec, trace, unverifiedThresholds } = await this.proofs.preview(job);
    const disclosures = buildDisclosures(spec, trace, unverifiedThresholds);
    return {
      specBlock: renderSpecBlock(spec),
      disclosures: renderDisclosures(disclosures),
      elements: spec.elements.map((e) => ({
        id: e.id, role: e.role, content: e.content,
        construction: e.construction, copyTreatment: e.copyTreatment,
        capHeight: e.capHeight, narrowestStroke: e.narrowestStroke,
      })),
      escalations: spec.escalations,
      blocked: spec.blocked,
      trace: trace.ordered(),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ProofResponseDto> {
    return ProofResponseDto.from(await this.proofs.findOne(id));
  }

  @Get(':id/sheet')
  @Header('content-type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: 'The proof sheet as a printable page.',
    description: 'Day and night views, §9.3 specifications, logo elevation, section detail, §9.4 disclosures.',
  })
  async sheet(@Param('id') id: string): Promise<string> {
    const proof = await this.proofs.findOne(id);
    return proof.sheetHtml ?? '<!doctype html><p>This proof has no sheet — it may have failed before assembly.</p>';
  }

  @Get(':id/panels/:name')
  @ApiOperation({ summary: 'One rendered panel.' })
  async panel(@Param('id') id: string, @Param('name') name: string, @Res() reply: FastifyReply) {
    const proof = await this.proofs.findOne(id);
    // Either variant is addressable by its own filename, so the base render
    // stays fetchable even when the enhanced one is what the page shows.
    const panel = proof.panels.find((p) => path.basename(p.file) === name);
    if (panel) return reply.type('image/png').send(createReadStream(panel.file));

    const enhanced = proof.panels.find(
      (p) => p.enhanced && path.basename(p.enhanced.file) === name,
    );
    if (enhanced?.enhanced) {
      return reply.type('image/png').send(createReadStream(enhanced.enhanced.file));
    }
    throw new NotFoundException(`no panel "${name}" on proof ${id}`);
  }

  @Get(':id/trace')
  @ApiOperation({
    summary: 'The full rule trace.',
    description:
      'Every mutation with its rule ID, gate, tier, severity, path, before and after. ' +
      'This is what §9.4 is generated from, so it is the audit record for a proof.',
  })
  async trace(@Param('id') id: string) {
    const proof = await this.proofs.findOne(id);
    return {
      kbVersion: proof.kbVersion,
      entries: proof.trace,
      defaults: proof.traceDefaults,
      precedenceRefusals: proof.traceRefusals,
    };
  }

  @Get(':id/similar')
  @ApiOperation({
    summary: 'Past signs like this one.',
    description: 'Advisory only (§9.5). Never feeds a rule, a dimension or a material.',
  })
  async similar(@Param('id') id: string, @Query('limit') limit?: string) {
    const proof = await this.proofs.findOne(id);
    if (!proof.spec) return [];
    return this.designRefs.findSimilar(proof.spec, limit ? Number(limit) : 5);
  }

  @Post(':id/revisions')
  @ApiOperation({
    summary: 'Apply a revision request.',
    description:
      'Patches the intake form and re-runs every gate as a new proof. The stored spec ' +
      'is never edited in place — a spec changed outside the gates has not been validated by them.',
  })
  async revise(@Param('id') id: string, @Body() body: ReviseProofDto): Promise<ProofResponseDto> {
    if (!body?.request?.trim()) throw new BadRequestException('request is required');
    return ProofResponseDto.from(await this.proofs.revise(id, body.request));
  }

  @Get('by-job/:jobId')
  async byJob(@Param('jobId') jobId: string): Promise<ProofResponseDto[]> {
    return (await this.proofs.findByJob(jobId)).map(ProofResponseDto.from);
  }

  @Get('by-rule/:ruleId')
  @ApiOperation({
    summary: 'Every proof a given rule fired on.',
    description: 'The question that gets asked when a rule or a [DER] value turns out to be wrong.',
  })
  async byRule(@Param('ruleId') ruleId: string): Promise<ProofResponseDto[]> {
    return (await this.proofs.findByRule(ruleId)).map(ProofResponseDto.from);
  }

  private parse(body: unknown) {
    try {
      return CreateProofDto.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'invalid job',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      throw error;
    }
  }
}
