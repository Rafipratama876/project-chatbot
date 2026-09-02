import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ArtworkService, readSource } from '#/modules/artwork/artwork.service.js';
import { ProofsService } from '#/modules/proofs/proofs.service.js';
import { StorageService } from '#/modules/storage/storage.service.js';
import {
  CompatMessageEntity, CompatSessionEntity,
} from '#/modules/database/entities/compat-session.entity.js';
import type { JobInput, PlacementInput } from '#/kb/domain/spec.js';
import type { ProofEntity } from '#/modules/database/entities/proof.entity.js';
import { parseCompatProjectJson } from './compat.mapper.js';

const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

@Injectable()
export class CompatService {
  constructor(
    @InjectRepository(CompatSessionEntity) private readonly sessions: Repository<CompatSessionEntity>,
    @InjectRepository(CompatMessageEntity) private readonly messages: Repository<CompatMessageEntity>,
    private readonly artwork: ArtworkService,
    private readonly proofs: ProofsService,
    private readonly config: ConfigService,
  ) {}

  personalities() {
    return [{
      id: 'personalities-channel-letters',
      name: 'Channel Letters',
      description: 'Deterministic channel-letter proof generation against KB v2.2.',
    }];
  }

  async create(projectJson: unknown): Promise<Record<string, unknown>> {
    const project = parseCompatProjectJson(projectJson);
    const duplicate = await this.sessions.findOneBy({
      projectId: project.projectId, signDetailId: project.signDetailId,
    });
    if (duplicate) throw new ConflictException('Session already exists for this project and sign detail');

    const [logo, wall] = await Promise.all([
      fetchAsset(project.logoUrl, 'logo'),
      fetchAsset(project.wallUrl, 'wall'),
    ]);
    const wallSize = StorageService.measure(wall.buffer, wall.mime);
    const placement = scalePlacement(project.placement, wallSize.width, wallSize.height);
    placement.backgroundImage = `data:${wall.mime};base64,${wall.buffer.toString('base64')}`;

    const source = readSource(logo.mime === 'image/svg+xml'
      ? { svg: logo.buffer.toString('utf8') }
      : { data: logo.buffer.toString('base64'), mime: logo.mime });
    const placed = this.artwork.place(source, placement, { name: project.logoText });
    const id = randomUUID();
    const baseJob: JobInput = {
      jobId: `${id}-v1`,
      form: project.form,
      artwork: placed.items,
      placement,
      artworkProvenance: {
        source: placed.source,
        confidence: placed.confidence,
        notes: [...placed.warnings, ...placed.calibrationWarnings.map((warning) => warning.message)],
      },
    };

    const session = this.sessions.create({
      id,
      projectId: project.projectId,
      signDetailId: project.signDetailId,
      status: 'active',
      projectJson: projectJson as Record<string, unknown>,
      baseJob,
      approvedProofId: null,
      finalizedAt: null,
    });
    await this.sessions.save(session);
    return this.sessionDto(session);
  }

  async get(id: string): Promise<Record<string, unknown>> {
    return this.sessionDto(await this.requireSession(id));
  }

  async send(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const session = await this.requireSession(id);
    const finalize = input.finalize === true || input.finalize === 'true';
    if (finalize) return this.finalize(session, input.draftMessageId);
    if (session.status === 'finalized') {
      session.status = 'active';
      session.finalizedAt = null;
      session.approvedProofId = null;
      await this.sessions.save(session);
    }

    const request = typeof input.text === 'string' ? input.text.trim() : '';
    if (request) await this.saveMessage(session.id, 'user', request, null, null);
    const prior = await this.proofsFor(session.id);
    const isGenerate = prior.length === 0 || input.regenerate === true;
    const version = prior.length + 1;

    if (isGenerate) {
      const job = { ...session.baseJob, jobId: `${session.id}-v${version}` };
      const proof = await this.proofs.create(job);
      const assistant = await this.proofMessage(session.id, proof, 'draft', version);
      return { session: await this.sessionDto(session), message: messageDto(assistant) };
    }

    // Revision path (fast enough to block)
    if (!request) throw new BadRequestException('A revision message is required');
    let proof: ProofEntity;
    try {
      proof = await this.proofs.revise(prior[0]!.id, request);
    } catch (specRevisionFailed) {
      // Nothing in the request mapped to a form field. That is not necessarily
      // a failure: "warmer light at dusk" changes how the sign is shown, not
      // what it is, and the scene panels can answer it without a rule moving.
      // The spec, and therefore every dimension on the board, is untouched.
      try {
        proof = await this.proofs.reviseAppearance(prior[0]!.id, request);
      } catch {
        const reason = specRevisionFailed instanceof Error
          ? specRevisionFailed.message : String(specRevisionFailed);
        const assistant = await this.saveMessage(
          session.id, 'assistant', `I could not apply that revision: ${reason}`, 'text', null,
        );
        return { session: await this.sessionDto(session), message: messageDto(assistant) };
      }
    }

    const assistant = await this.proofMessage(session.id, proof, 'draft', version);
    return { session: await this.sessionDto(session), message: messageDto(assistant) };
  }

  private async finalize(session: CompatSessionEntity, draftMessageId: unknown) {
    const selected = typeof draftMessageId === 'string'
      ? await this.messages.findOneBy({ id: draftMessageId, sessionId: session.id })
      : await this.messages.findOne({
          where: { sessionId: session.id, role: 'assistant' },
          order: { createdAt: 'DESC' },
        });
    if (!selected?.proofId || !selected.imageUrl) {
      throw new BadRequestException('Select a completed draft before finalizing');
    }
    session.status = 'finalized';
    session.finalizedAt = new Date();
    session.approvedProofId = selected.proofId;
    await this.sessions.save(session);
    const final = await this.saveMessage(
      session.id, 'assistant', selected.text, 'final', selected.proofId,
      selected.imageUrl, selected.versionLabel,
    );
    return { session: await this.sessionDto(session), message: messageDto(final) };
  }

  private async proofMessage(
    sessionId: string,
    proof: ProofEntity,
    mode: 'draft' | 'text',
    version: number,
  ): Promise<CompatMessageEntity> {
    const imageUrl = this.boardUrl(proof);
    const problems = [
      ...proof.escalations.map((item) => `${item.ruleId}: ${item.question}`),
      ...proof.problems,
    ];
    const text = imageUrl
      ? `Version ${version} generated through all 56 channel-letter rules.${proof.disclosureText ? `\n\n${proof.disclosureText}` : ''}`
      : `The proof needs review before rendering.${problems.length ? `\n\n${problems.join('\n')}` : ''}`;
    return this.saveMessage(
      sessionId, 'assistant', text, imageUrl ? mode : 'text', proof.id,
      imageUrl, `v${version}`,
    );
  }

  /**
   * What TSP is shown: the board, not one panel off it. The board carries the
   * specifications, the dimensions and the section detail, so a reviewer is
   * looking at the same page a fabricator would.
   */
  private boardUrl(proof: ProofEntity): string | null {
    const origin = this.config.getOrThrow<string>('app.publicUrl').replace(/\/$/, '');
    if (proof.boardFile) return `${origin}/api/v1/proofs/${proof.id}/board`;
    // No board — the photorealism stage or Chromium was unavailable. The day
    // elevation is still a true picture of the sign, so the draft is not lost.
    const panel = proof.panels.find((candidate) => candidate.view === 'day'
      && candidate.camera === 'front-elevation');
    return panel ? `${origin}/api/v1/proofs/${proof.id}/panels/${path.basename(panel.file)}` : null;
  }

  private async sessionDto(session: CompatSessionEntity): Promise<Record<string, unknown>> {
    const messages = await this.messages.find({
      where: { sessionId: session.id }, order: { createdAt: 'ASC' },
    });
    return {
      id: session.id,
      status: session.status,
      canFinalize: messages.some((message) => message.mode === 'draft' && Boolean(message.imageUrl)),
      finalizedAt: session.finalizedAt?.toISOString() ?? null,
      logoAssetId: null,
      logoImageUrl: null,
      finalizedLogo: null,
      finalizedDraftContext: session.status === 'finalized' ? session.projectJson : null,
      messages: messages.map(messageDto),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private async proofsFor(sessionId: string): Promise<ProofEntity[]> {
    return this.proofs.findByJobPrefix(`${sessionId}-v`);
  }

  private async requireSession(id: string): Promise<CompatSessionEntity> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException(`session ${id} not found`);
    return session;
  }

  private saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
    mode: CompatMessageEntity['mode'],
    proofId: string | null,
    imageUrl: string | null = null,
    versionLabel: string | null = null,
  ) {
    return this.messages.save(this.messages.create({
      sessionId, role, text, mode, proofId, imageUrl, versionLabel,
    }));
  }
}

function messageDto(message: CompatMessageEntity) {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    mode: message.mode,
    imageUrl: message.imageUrl,
    model: 'three.js + channel-letter-kb-v2.2',
    versionLabel: message.versionLabel,
    createdAt: message.createdAt.toISOString(),
    choiceOptions: null,
  };
}

function scalePlacement(source: PlacementInput, width: number, height: number): PlacementInput {
  const sx = width / source.imageWidth;
  const sy = height / source.imageHeight;
  const point = (value: { x: number; y: number }) => ({ x: value.x * sx, y: value.y * sy });
  return {
    ...source,
    imageWidth: width,
    imageHeight: height,
    reference: {
      ...source.reference,
      a: point(source.reference.a),
      b: point(source.reference.b),
    },
    rect: {
      x: source.rect.x * sx,
      y: source.rect.y * sy,
      w: source.rect.w * sx,
      h: source.rect.h * sy,
    },
    ...(source.facadeRect ? {
      facadeRect: {
        ...source.facadeRect,
        corners: source.facadeRect.corners.map(point),
      },
    } : {}),
  };
}

async function fetchAsset(url: string, label: string): Promise<{ buffer: Buffer; mime: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException(`${label} asset URL is invalid`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException(`${label} asset URL must use HTTP or HTTPS`);
  }
  await assertPublicHost(parsed, label);
  const response = await fetch(parsed, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch((error) => {
    throw new BadRequestException(`Could not download ${label} asset: ${String(error)}`);
  });
  if (!response.ok) throw new BadRequestException(`${label} asset returned HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_ASSET_BYTES) throw new BadRequestException(`${label} asset exceeds 20 MB`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_ASSET_BYTES) {
    throw new BadRequestException(`${label} asset must be between 1 byte and 20 MB`);
  }
  const declaredMime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  const mime = sniffImageMime(buffer) ?? declaredMime;
  const accepted = label === 'wall'
    ? ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    : ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
  if (!accepted.includes(mime)) {
    throw new BadRequestException(
      `${label} asset must be ${label === 'wall' ? 'PNG, JPEG, or WebP' : 'SVG, PNG, or JPEG'}, `
      + `not "${mime || 'unknown'}"`,
    );
  }
  return { buffer, mime };
}

export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 1024).toString('utf8').trimStart().startsWith('<svg')) {
    return 'image/svg+xml';
  }
  return null;
}

async function assertPublicHost(url: URL, label: string): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new BadRequestException(`${label} asset URL must use a public host`);
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => {
        throw new BadRequestException(`${label} asset host could not be resolved`);
      });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new BadRequestException(`${label} asset URL must not resolve to a private network`);
  }
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd')
    || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea')
    || value.startsWith('feb')) return true;
  const ipv4 = value.startsWith('::ffff:') ? value.slice(7) : value;
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)
    || a! >= 224;
}
