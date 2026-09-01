import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DesignsService } from './designs.service.js';
import { ExportService } from './export.service.js';
import {
  CreateDesignSchema, ReviseSchema, UpdateLogoSchema, UpdateSpecSchema,
  UpdateWallPositionSchema, parseBody, toDesignView, toRenderView,
  type DesignView, type RenderView,
} from './dto.js';

/**
 * The wizard's own API.
 *
 * A design is intake the customer can come back to; a proof is one immutable
 * run of the gates against it. Every endpoint here writes intake — none of
 * them writes a spec, because a spec that did not come out of the gates has
 * not been checked by them.
 */
@ApiTags('designs')
@Controller({ path: 'designs', version: '1' })
export class DesignsController {
  constructor(
    private readonly designs: DesignsService,
    private readonly exports: ExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every design, newest first.' })
  async list(): Promise<DesignView[]> {
    const designs = await this.designs.list();
    // The list shows a name, a status and a thumbnail's worth of context —
    // loading every design's full render and chat history to render that would
    // be a few hundred rows of joins for text nobody reads on this page.
    return designs.map((d) => toDesignView(d));
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<DesignView> {
    const design = await this.designs.findOne(id);
    const [renders, messages] = await Promise.all([
      this.designs.rendersOf(id),
      this.designs.messagesOf(id),
    ]);
    return toDesignView(design, renders, messages);
  }

  @Post()
  async create(@Body() body: unknown): Promise<DesignView> {
    const { name } = parseBody(CreateDesignSchema, body);
    return toDesignView(await this.designs.create(name));
  }

  @Patch(':id/logo')
  async logo(@Param('id') id: string, @Body() body: unknown): Promise<DesignView> {
    return toDesignView(await this.designs.updateLogo(id, parseBody(UpdateLogoSchema, body)));
  }

  @Patch(':id/wall-position')
  @ApiOperation({
    summary: 'The wall, the sign box on it, and the size that box really is.',
    description:
      'The box as a fraction of the image plus its width in inches IS the '
      + 'calibration — every dimension the engine checks is denominated in it.',
  })
  async wall(@Param('id') id: string, @Body() body: unknown): Promise<DesignView> {
    const dto = parseBody(UpdateWallPositionSchema, body);
    return toDesignView(await this.designs.updateWallPosition(id, dto));
  }

  @Patch(':id/spec')
  async spec(@Param('id') id: string, @Body() body: unknown): Promise<DesignView> {
    return toDesignView(await this.designs.updateSpec(id, parseBody(UpdateSpecSchema, body)));
  }

  @Post(':id/render')
  @ApiOperation({
    summary: 'Queue a render.',
    description: 'Returns immediately with a PENDING render to poll.',
  })
  async render(@Param('id') id: string): Promise<RenderView> {
    return toRenderView(await this.designs.render(id));
  }

  @Post(':id/revise')
  @ApiOperation({
    summary: 'A revision request, in plain language.',
    description:
      'Patches the intake form and re-runs every gate as a new version. '
      + 'The stored proof is never edited in place.',
  })
  async revise(@Param('id') id: string, @Body() body: unknown) {
    const { message } = parseBody(ReviseSchema, body);
    const result = await this.designs.revise(id, message);
    return {
      agentMessage: {
        id: result.agentMessage.id,
        role: result.agentMessage.role,
        content: result.agentMessage.content,
        createdAt: result.agentMessage.createdAt.toISOString(),
      },
      render: result.render ? toRenderView(result.render) : null,
      specChanged: result.specChanged,
    };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string): Promise<DesignView> {
    return toDesignView(await this.designs.approve(id));
  }

  @Post(':id/export/pdf')
  @ApiOperation({ summary: 'The proof sheet as a PDF.' })
  async exportPdf(@Param('id') id: string): Promise<{ url: string }> {
    return { url: await this.exports.pdf(id) };
  }
}
