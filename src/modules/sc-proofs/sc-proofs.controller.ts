import {
  BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodError } from 'zod';
import { SCProofsService } from './sc-proofs.service.js';
import { SCJobBuilderService } from './sc-job-builder.service.js';
import { SCExportService } from './sc-export.service.js';
import { CreateSCProofDto } from './dto/create-sc-proof.dto.js';
import { CreateSCProofFromWizardDto } from './dto/create-sc-proof-from-wizard.dto.js';
import { SCProofResponseDto } from './dto/sc-proof-response.dto.js';

@ApiTags('sc-proofs')
@Controller({ path: 'sc-proofs', version: '1' })
export class SCProofsController {
  constructor(
    private readonly proofs: SCProofsService,
    private readonly jobBuilder: SCJobBuilderService,
    private readonly exports: SCExportService,
  ) {}

  @Post('wizard')
  @ApiOperation({
    summary: 'Build a Sign Cabinet job from the wizard (face graphic + wall box) and run it.',
    description:
      'The SC equivalent of the Channel Letters/Dimensional Letters wizard\'s "Generate Proof" '
      + '— turns a face-graphic file and a wall-image box into measured artwork and a placement, '
      + 'then runs the job through the SC gates. No draft is persisted first — the returned proof '
      + 'is its own revision chain root.',
  })
  async createFromWizard(@Body() body: CreateSCProofFromWizardDto): Promise<SCProofResponseDto> {
    const jobId = `sc-wizard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = await this.jobBuilder.build(body, jobId);
    return SCProofResponseDto.from(await this.proofs.create(job, {
      skipRender: body.skipRender, deterministicOnly: body.deterministicOnly,
    }));
  }

  @Post()
  @ApiOperation({
    summary: 'Run a Sign Cabinet job through its own gates and produce a proof.',
    description:
      'Intake → defaults → validation → render contract → output. '
      + 'A separate pipeline from /api/v1/proofs (Channel Letters) and /api/v1/dl-proofs '
      + '(Dimensional Letters) — no shared rules.',
  })
  async create(@Body() body: unknown): Promise<SCProofResponseDto> {
    const { job, skipRender, deterministicOnly } = this.parse(body);
    return SCProofResponseDto.from(await this.proofs.create(job, { skipRender, deterministicOnly }));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SCProofResponseDto> {
    return SCProofResponseDto.from(await this.proofs.findOne(id));
  }

  @Get(':id/sheet')
  @Header('content-type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'The Sign Cabinet proof sheet as a printable page.' })
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

    return reply.status(404).send({ message: `no panel "${name}" on sc proof ${id}` });
  }

  @Get(':id/trace')
  async trace(@Param('id') id: string) {
    const proof = await this.proofs.findOne(id);
    return {
      scVersion: proof.scVersion,
      entries: proof.trace,
      defaults: proof.traceDefaults,
      precedenceRefusals: proof.traceRefusals,
    };
  }

  @Get('by-job/:jobId')
  async byJob(@Param('jobId') jobId: string): Promise<SCProofResponseDto[]> {
    return (await this.proofs.findByJob(jobId)).map(SCProofResponseDto.from);
  }

  @Post(':id/revise')
  @ApiOperation({
    summary: 'Apply a revision request directly to one proof.',
    description:
      'Patches the intake form and re-runs every SC gate as a new proof in the same '
      + 'revision chain. The stored spec is never edited in place. For the chat-driven '
      + 'flow the review page actually uses, see POST /sc-proofs/root/:rootId/chat.',
  })
  async revise(@Param('id') id: string, @Body() body: { request?: string }): Promise<SCProofResponseDto> {
    if (!body?.request?.trim()) throw new BadRequestException('request is required');
    return SCProofResponseDto.from(await this.proofs.revise(id, body.request));
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string): Promise<SCProofResponseDto> {
    return SCProofResponseDto.from(await this.proofs.approve(id));
  }

  // ── Revision chain (rootProofId) ────────────────────────────────────────

  @Get('root/:rootId/latest')
  @ApiOperation({ summary: 'The newest proof in a revision chain.' })
  async latest(@Param('rootId') rootId: string): Promise<SCProofResponseDto> {
    return SCProofResponseDto.from(await this.proofs.latestInSeries(rootId));
  }

  @Get('root/:rootId/versions')
  @ApiOperation({ summary: 'Every proof in a revision chain, newest first.' })
  async versions(@Param('rootId') rootId: string): Promise<SCProofResponseDto[]> {
    return (await this.proofs.seriesOf(rootId)).map(SCProofResponseDto.from);
  }

  @Post('root/:rootId/regenerate')
  @ApiOperation({ summary: 'Re-run the same job as a new version — "Render ulang", no form change.' })
  async regenerate(@Param('rootId') rootId: string): Promise<SCProofResponseDto> {
    return SCProofResponseDto.from(await this.proofs.regenerate(rootId));
  }

  @Get('root/:rootId/messages')
  async messages(@Param('rootId') rootId: string) {
    return (await this.proofs.messagesOf(rootId)).map((m) => ({
      id: m.id, role: m.role, content: m.content, createdAt: m.createdAt,
    }));
  }

  @Post('root/:rootId/chat')
  @ApiOperation({
    summary: 'The chat-driven revise the review page uses.',
    description: 'Logs the message, revises the latest proof in the chain, logs the agent reply.',
  })
  async chat(@Param('rootId') rootId: string, @Body() body: { message?: string }) {
    if (!body?.message?.trim()) throw new BadRequestException('message is required');
    const result = await this.proofs.chat(rootId, body.message);
    return {
      agentMessage: {
        id: result.agentMessage.id, role: result.agentMessage.role,
        content: result.agentMessage.content, createdAt: result.agentMessage.createdAt,
      },
      proof: result.proof ? SCProofResponseDto.from(result.proof) : null,
      specChanged: result.specChanged,
    };
  }

  @Post('root/:rootId/export/pdf')
  @ApiOperation({ summary: 'The proof sheet of the newest ready proof in a chain, as a PDF.' })
  async exportPdf(@Param('rootId') rootId: string): Promise<{ url: string }> {
    return { url: await this.exports.pdf(rootId) };
  }

  private parse(body: unknown) {
    try {
      return CreateSCProofDto.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'invalid sc job',
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      throw error;
    }
  }
}
