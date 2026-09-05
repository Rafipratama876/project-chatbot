import {
  BadRequestException, Body, Controller, Get, Header, Param, Post, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodError } from 'zod';
import { DLProofsService } from './dl-proofs.service.js';
import { DLJobBuilderService } from './dl-job-builder.service.js';
import { CreateDLProofDto } from './dto/create-dl-proof.dto.js';
import { CreateDLProofFromWizardDto } from './dto/create-dl-proof-from-wizard.dto.js';
import { DLProofResponseDto } from './dto/dl-proof-response.dto.js';

@ApiTags('dl-proofs')
@Controller({ path: 'dl-proofs', version: '1' })
export class DLProofsController {
  constructor(
    private readonly proofs: DLProofsService,
    private readonly jobBuilder: DLJobBuilderService,
  ) {}

  @Post('wizard')
  @ApiOperation({
    summary: 'Build a Dimensional Letters job from the wizard (logo + wall box) and run it.',
    description:
      'The DL equivalent of the Channel Letters wizard\'s "Generate Proof" — turns a logo '
      + 'file and a wall-image box into measured artwork and a placement, then runs the job '
      + 'through the DL gates. No draft is persisted first (v1 has no dl_design table).',
  })
  async createFromWizard(@Body() body: CreateDLProofFromWizardDto): Promise<DLProofResponseDto> {
    const jobId = `dl-wizard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = await this.jobBuilder.build(body, jobId);
    return DLProofResponseDto.from(await this.proofs.create(job, {
      skipRender: body.skipRender, deterministicOnly: body.deterministicOnly,
    }));
  }

  @Post()
  @ApiOperation({
    summary: 'Run a Dimensional Letters job through its own gates and produce a proof.',
    description:
      'Intake → composition → defaults → validation → render contract → output. '
      + 'A separate pipeline from /api/v1/proofs (Channel Letters) — no shared rules.',
  })
  async create(@Body() body: unknown): Promise<DLProofResponseDto> {
    const { job, skipRender, deterministicOnly } = this.parse(body);
    return DLProofResponseDto.from(await this.proofs.create(job, { skipRender, deterministicOnly }));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<DLProofResponseDto> {
    return DLProofResponseDto.from(await this.proofs.findOne(id));
  }

  @Get(':id/sheet')
  @Header('content-type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'The Dimensional Letters proof sheet as a printable page.' })
  async sheet(@Param('id') id: string): Promise<string> {
    const proof = await this.proofs.findOne(id);
    return proof.sheetHtml ?? '<!doctype html><p>This proof has no sheet — it may have failed before assembly.</p>';
  }

  @Get(':id/panels/:name')
  @ApiOperation({ summary: 'One rendered panel.' })
  async panel(@Param('id') id: string, @Param('name') name: string, @Res() reply: FastifyReply) {
    const proof = await this.proofs.findOne(id);
    const panel = proof.panels.find((p) => path.basename(p.file) === name);
    if (panel) return reply.type('image/png').send(createReadStream(panel.file));

    const enhanced = proof.panels.find((p) => p.enhanced && path.basename(p.enhanced.file) === name);
    if (enhanced?.enhanced) return reply.type('image/png').send(createReadStream(enhanced.enhanced.file));

    return reply.status(404).send({ message: `no panel "${name}" on dl proof ${id}` });
  }

  @Get(':id/trace')
  async trace(@Param('id') id: string) {
    const proof = await this.proofs.findOne(id);
    return {
      dlVersion: proof.dlVersion,
      entries: proof.trace,
      defaults: proof.traceDefaults,
      precedenceRefusals: proof.traceRefusals,
    };
  }

  @Get('by-job/:jobId')
  async byJob(@Param('jobId') jobId: string): Promise<DLProofResponseDto[]> {
    return (await this.proofs.findByJob(jobId)).map(DLProofResponseDto.from);
  }

  private parse(body: unknown) {
    try {
      return CreateDLProofDto.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'invalid dl job',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      throw error;
    }
  }
}
