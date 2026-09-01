import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { DesignEntity, DesignMessageEntity } from '#/modules/database/entities/design.entity.js';
import { WallPresetEntity } from '#/modules/database/entities/wall-preset.entity.js';
import { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import { StorageService } from '#/modules/storage/storage.service.js';
import { ArtworkService, readSource } from '#/modules/artwork/artwork.service.js';
import { ProofsService } from '#/modules/proofs/proofs.service.js';
import { PROOF_QUEUE, type ProofJobData } from '#/modules/queues/proof.queue.js';
import type { JobInput } from '#/kb/domain/spec.js';
import { KB_VERSION } from '#/kb/domain/boilerplate.js';
import {
  buildForm, buildPlacement, signSize, areaSqFt, facadeCorrection,
  DesignIncompleteError, type DesignLike,
} from './job-from-design.js';
import type {
  UpdateLogoDto, UpdateWallPositionDto, UpdateSpecDto,
} from './dto.js';

@Injectable()
export class DesignsService {
  private readonly logger = new Logger(DesignsService.name);

  constructor(
    @InjectRepository(DesignEntity) private readonly designs: Repository<DesignEntity>,
    @InjectRepository(DesignMessageEntity) private readonly messages: Repository<DesignMessageEntity>,
    @InjectRepository(WallPresetEntity) private readonly presets: Repository<WallPresetEntity>,
    @InjectRepository(ProofEntity) private readonly proofs: Repository<ProofEntity>,
    @InjectQueue(PROOF_QUEUE) private readonly queue: Queue<ProofJobData>,
    private readonly storage: StorageService,
    private readonly artwork: ArtworkService,
    private readonly proofsService: ProofsService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────

  async list(): Promise<DesignEntity[]> {
    return this.designs.find({ order: { updatedAt: 'DESC' }, take: 200 });
  }

  async findOne(id: string): Promise<DesignEntity> {
    const design = await this.designs.findOne({ where: { id } });
    if (!design) throw new NotFoundException(`design ${id} not found`);
    return design;
  }

  /** Newest first — index 0 is what the review page shows. */
  async rendersOf(designId: string): Promise<ProofEntity[]> {
    return this.proofs.find({
      where: { designId },
      order: { version: 'DESC' },
      take: 20,
    });
  }

  async messagesOf(designId: string): Promise<DesignMessageEntity[]> {
    return this.messages.find({ where: { designId }, order: { createdAt: 'ASC' } });
  }

  // ── The wizard's three steps ───────────────────────────────────────────

  async create(name: string): Promise<DesignEntity> {
    return this.designs.save(this.designs.create({ name: name.trim() || 'Untitled Sign' }));
  }

  async updateLogo(id: string, dto: UpdateLogoDto): Promise<DesignEntity> {
    const design = await this.findOne(id);
    if (dto.logoUrl !== undefined) design.logoUrl = dto.logoUrl || null;
    if (dto.logoText !== undefined) design.logoText = dto.logoText || null;
    // A design named for its sign reads better in the list than "Untitled".
    if (design.name === 'Untitled Sign' && design.logoText) design.name = design.logoText;
    return this.designs.save(design);
  }

  async updateWallPosition(id: string, dto: UpdateWallPositionDto): Promise<DesignEntity> {
    const design = await this.findOne(id);

    let presetFacade: DesignEntity['facadeRect'] = null;

    if (dto.wallPresetId) {
      const preset = await this.presets.findOneBy({ id: dto.wallPresetId });
      if (!preset) throw new NotFoundException(`wall preset ${dto.wallPresetId} not found`);
      design.wallPresetId = preset.id;
      design.customWallImageUrl = null;
      design.wallImageWidth = preset.imageWidth;
      design.wallImageHeight = preset.imageHeight;

      // A preset already states how wide the wall it depicts really is, so it
      // is a marked wall face — the whole image, seen square on. Ignoring it
      // and taking a typed size instead would leave two scales for the same
      // picture, which is the bug this path exists to close.
      const ppi = preset.imageWidth / preset.imageWidthInches;
      presetFacade = {
        corners: [
          { x: 0, y: 0 },
          { x: preset.imageWidth, y: 0 },
          { x: preset.imageWidth, y: preset.imageHeight },
          { x: 0, y: preset.imageHeight },
        ],
        widthInches: preset.imageWidthInches,
        heightInches: preset.imageHeight / ppi,
      };
    } else if (dto.customWallImageUrl) {
      design.customWallImageUrl = dto.customWallImageUrl;
      design.wallPresetId = null;
      const size = await this.measureStored(dto.customWallImageUrl);
      design.wallImageWidth = size.width;
      design.wallImageHeight = size.height;
    }

    if (!design.wallPresetId && !design.customWallImageUrl) {
      throw new BadRequestException('Pick a wall preset or upload a wall photograph.');
    }

    design.positionX = dto.positionX;
    design.positionY = dto.positionY;
    design.scale = dto.scale;
    design.scaleY = dto.scaleY ?? null;
    design.widthInches = dto.widthInches;
    design.heightInches = dto.heightInches;
    design.maxSignAreaAllowed = dto.maxSignAreaAllowed ?? null;
    design.facadeRect = dto.facadeRect ?? presetFacade;

    // With a marked wall face the real size is measured off that face, not
    // taken from the form — so the stored size and area are the measured ones.
    // Echoing back a width the render will not use is how the spec block ends
    // up describing a sign the picture does not show.
    // A wall face that contradicts its own pixels is corrected here, once, so
    // the stored design matches what will actually be rendered from it.
    const correction = facadeCorrection(design as DesignLike);
    if (correction && design.facadeRect) {
      this.logger.warn(
        `design ${id}: the marked wall face is a rectangle in the photograph, so its `
        + `height is fixed by its width — ${correction.statedInches}″ corrected to `
        + `${correction.correctedInches.toFixed(1)}″.`,
      );
      design.facadeRect = { ...design.facadeRect, heightInches: correction.correctedInches };
    }

    const measured = signSize(design as DesignLike);
    design.widthInches = round(measured.widthInches);
    design.heightInches = round(measured.heightInches);
    design.areaSqFt = areaSqFt(measured.widthInches, measured.heightInches);

    return this.designs.save(design);
  }

  async updateSpec(id: string, dto: UpdateSpecDto): Promise<DesignEntity> {
    const design = await this.findOne(id);
    design.spec = { ...(design.spec ?? {}), ...dto };
    return this.designs.save(design);
  }

  async approve(id: string): Promise<DesignEntity> {
    const design = await this.findOne(id);
    const ready = await this.proofs.findOne({
      where: { designId: id, status: 'ready' },
      order: { version: 'DESC' },
    });
    // Approving a design with nothing rendered would record a sign-off against
    // nothing — and "APPROVED" is the one status a customer is held to.
    if (!ready) {
      throw new BadRequestException('There is no completed render to approve yet.');
    }
    design.status = 'APPROVED';
    return this.designs.save(design);
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  /**
   * Queues a render and returns immediately.
   *
   * The proof row is created before the job is enqueued, so the review page
   * has an id to poll from the moment this returns rather than after a
   * Chromium page has finished rasterising.
   */
  async render(id: string): Promise<ProofEntity> {
    const design = await this.findOne(id);
    const version = await this.nextVersion(id);
    const job = await this.buildJob(design, version);

    const proof = await this.proofsService.reserve(job);
    await this.proofs.update(proof.id, { designId: design.id, version });

    await this.queue.add('render', { proofId: proof.id, job }, { jobId: proof.id });

    design.status = 'RENDERING';
    await this.designs.save(design);

    this.logger.log(`design ${id} → proof ${proof.id} (v${version}) queued`);
    return this.proofsService.findOne(proof.id);
  }

  /**
   * A revision request from the chat panel.
   *
   * The patch is applied to the FORM and every gate re-runs, exactly as the
   * proof API does it — a spec edited after the gates ran carries a disclosure
   * list describing decisions that no longer match it.
   */
  async revise(id: string, message: string): Promise<{
    agentMessage: DesignMessageEntity;
    render: ProofEntity | null;
    specChanged: boolean;
  }> {
    const design = await this.findOne(id);
    await this.messages.save(this.messages.create({ designId: id, role: 'USER', content: message }));

    const latest = await this.proofs.findOne({
      where: { designId: id },
      order: { version: 'DESC' },
    });
    if (!latest?.spec) {
      return {
        agentMessage: await this.say(id, 'There is no completed proof to revise yet — generate one first.'),
        render: null,
        specChanged: false,
      };
    }

    let revised: ProofEntity;
    try {
      revised = await this.proofsService.revise(latest.id, message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        agentMessage: await this.say(id, `I could not apply that: ${reason}`),
        render: null,
        specChanged: false,
      };
    }

    const version = await this.nextVersion(id);
    await this.proofs.update(revised.id, { designId: id, version });

    design.status = revised.status === 'ready' ? 'READY' : 'RENDERING';
    await this.designs.save(design);

    const summary = revised.blocked
      ? 'Applied — but the result is blocked and needs a human. See the escalations on the proof.'
      : `Applied. Version ${version} is ready.`;

    return {
      agentMessage: await this.say(id, summary),
      render: await this.proofsService.findOne(revised.id),
      specChanged: true,
    };
  }

  /**
   * Called by the queue processor when a render settles.
   *
   * Every terminal state moves the design off RENDERING. A blocked proof
   * (CL-R-46) goes back to DRAFT rather than to READY: something was rendered,
   * but it must not ship, and leaving the design in RENDERING would spin the
   * review page's poller forever against a job that has already finished.
   */
  async onRenderSettled(designId: string, status: ProofEntity['status']): Promise<void> {
    const design = await this.designs.findOneBy({ id: designId });
    if (!design || design.status === 'APPROVED') return;
    design.status = status === 'ready' ? 'READY' : 'DRAFT';
    await this.designs.save(design);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /**
   * A design → the job the gates run on.
   *
   * The wall photograph is inlined as a data URL because that is what the
   * renderer's browser context can read; the file on disk stays the source of
   * truth, and nothing here writes back to it.
   */
  private async buildJob(design: DesignEntity, version: number): Promise<JobInput> {
    if (!design.logoUrl) {
      throw new BadRequestException(
        'This proof needs the logo artwork. Sign text alone has no outline to measure, '
        + 'offset or extrude — upload an SVG, PNG or JPEG of the mark on the first step.',
      );
    }

    const wallUrl = design.customWallImageUrl ?? design.wallPreset?.imageUrl;
    if (!wallUrl) throw new DesignIncompleteError('wall', 'No wall image on this design.');

    const wallBuffer = await this.storage.read(wallUrl);
    const wallMime = this.storage.mimeOf(wallUrl);
    const size = StorageService.measure(wallBuffer, wallMime);

    const placement = buildPlacement(design as DesignLike, {
      dataUrl: `data:${wallMime};base64,${wallBuffer.toString('base64')}`,
      width: size.width,
      height: size.height,
    });

    const logoBuffer = await this.storage.read(design.logoUrl);
    const logoMime = this.storage.mimeOf(design.logoUrl);
    const source = readSource(
      logoMime === 'image/svg+xml'
        ? { svg: logoBuffer.toString('utf8') }
        : { data: logoBuffer.toString('base64'), mime: logoMime },
    );

    const name = design.logoText ?? design.name;
    const placed = this.artwork.place(source, placement, { name });

    return {
      jobId: `${design.id}-v${version}`,
      form: buildForm(design as DesignLike),
      artwork: placed.items,
      placement,
      artworkProvenance: {
        source: placed.source,
        confidence: placed.confidence,
        notes: [...placed.warnings, ...placed.calibrationWarnings.map((w) => w.message)],
      },
    } as JobInput;
  }

  private async nextVersion(designId: string): Promise<number> {
    const { max } = await this.proofs
      .createQueryBuilder('p')
      .select('MAX(p.version)', 'max')
      .where('p.design_id = :designId', { designId })
      .getRawOne<{ max: number | null }>() ?? { max: null };
    return (max ?? 0) + 1;
  }

  private async say(designId: string, content: string): Promise<DesignMessageEntity> {
    return this.messages.save(this.messages.create({ designId, role: 'AGENT', content }));
  }

  private async measureStored(url: string): Promise<{ width: number; height: number }> {
    const buffer = await this.storage.read(url);
    return StorageService.measure(buffer, this.storage.mimeOf(url));
  }

  /** For the health/version banner. */
  readonly kbVersion = KB_VERSION;
}

/** Two decimals. A sign width is quoted in inches, not in float noise. */
const round = (v: number): number => Math.round(v * 100) / 100;
