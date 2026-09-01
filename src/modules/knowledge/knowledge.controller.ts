import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThresholdService } from './threshold.service.js';
import { VendorReferenceService } from './vendor-reference.service.js';
import { EmbeddingService } from './embedding.service.js';
import { ALL_RULES, KB_RULE_IDS, implementedRuleIds } from '#/kb/engine/rules/index.js';
import { FORM_TYPE_MAP, FORM_MOUNT_MAP, SIGN_TYPES, TYPES } from '#/kb/domain/taxonomy.js';
import { BACKER_SHAPES, GEMTRIM, JEWELITE, LED_COLOURS } from '#/kb/domain/materials.js';
import { GATE_NAME, GATE_ORDER, KB_STATED_GATES } from '#/kb/engine/gates.js';
import { KB_VERSION } from '#/kb/domain/boilerplate.js';

const prettyShape = (s: string): string =>
  s.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');

@ApiTags('knowledge')
@Controller({ path: 'knowledge', version: '1' })
export class KnowledgeController {
  constructor(
    private readonly thresholds: ThresholdService,
    private readonly vendor: VendorReferenceService,
    private readonly embeddings: EmbeddingService,
  ) {}

  @Get('rules')
  @ApiOperation({ summary: 'The registered rule set, and which KB IDs it covers.' })
  rules() {
    const implemented = implementedRuleIds();
    return {
      kbVersion: KB_VERSION,
      declared: KB_RULE_IDS.length,
      covered: KB_RULE_IDS.filter((id) => implemented.has(id)).length,
      missing: KB_RULE_IDS.filter((id) => !implemented.has(id)),
      rules: ALL_RULES.map((r) => ({
        id: r.id, gate: r.gate, gateName: GATE_NAME[r.gate],
        tier: r.tier, severity: r.severity, critical: r.critical ?? false,
        kbRef: r.kbRef, title: r.title,
      })),
    };
  }

  @Get('gates')
  @ApiOperation({
    summary: 'Gate order.',
    description:
      'The KB names Gate 2 (§6.0) and Gate 4 (§6.1–§6.7) and never defines the rest. ' +
      'Gates 1, 3, 5 and 6 are reconstructed — see docs/GATES.md.',
  })
  gates() {
    return GATE_ORDER.map((g) => ({
      gate: g,
      name: GATE_NAME[g],
      statedByKb: KB_STATED_GATES.includes(g),
      rules: ALL_RULES.filter((r) => r.gate === g).map((r) => r.id),
    }));
  }

  @Get('options')
  @ApiOperation({
    summary: 'The form values the KB accepts.',
    description:
      'Served from the §1.2 and §7.1 mapping tables rather than duplicated in the ' +
      'client. A form offering a value the KB has no mapping for produces a job that ' +
      'escalates at Gate 1, which is a worse way to find out.',
  })
  options() {
    return {
      channelLetterType: Object.keys(FORM_TYPE_MAP),
      installationMethod: Object.keys(FORM_MOUNT_MAP),
      backerPanelOption: ['No Backer', ...BACKER_SHAPES.map(prettyShape)],
      trimCapColours: [...new Set([...GEMTRIM.map((c) => c.name), ...JEWELITE])].sort(),
      // §4.2: what each type is stocked at, and what it can be built at.
      returnDepths: Object.fromEntries(
        SIGN_TYPES.map((t) => [t, {
          name: TYPES[t].name,
          standard: TYPES[t].standardDepth,
          onRequest: TYPES[t].onRequestDepths,
        }]),
      ),
      ledColours: [...LED_COLOURS],
      controls: ['photocell', 'timer'],
    };
  }

  @Get('thresholds')
  @ApiOperation({ summary: 'Every tunable value, with its KB provenance tag.' })
  allThresholds(@Query('unverified') unverified?: string) {
    return unverified === 'true' ? this.thresholds.unverified() : this.thresholds.all();
  }

  @Post('thresholds/:key')
  @ApiOperation({
    summary: 'Correct a threshold.',
    description:
      'Returns the proofs that used the old value. A [DER] number is derived, not ' +
      'vendor-confirmed, so correcting one must not need a deploy — and must not lose ' +
      'track of the proofs already sent on the old figure.',
  })
  async correct(
    @Param('key') key: string,
    @Body() body: { value: number; updatedBy: string; verified?: boolean; note?: string },
  ) {
    return this.thresholds.correct(key, body.value, body.updatedBy, {
      verified: body.verified,
      note: body.note,
    });
  }

  @Get('vendor')
  @ApiOperation({
    summary: 'Search Appendix A/B (Stage 2 vendor reference).',
    description:
      'Retrieval, because this material genuinely is a retrieval problem: large, ' +
      'open-ended, queried by paraphrase, safe to miss. The 56 rules are none of ' +
      'those things and live in code, not here.',
  })
  async searchVendor(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('section') section?: string,
  ) {
    const hits = await this.vendor.search(q, limit ? Number(limit) : 5, section);
    return {
      method: this.embeddings.enabled ? 'vector' : 'fulltext',
      embeddingsConfigured: this.embeddings.enabled,
      hits,
    };
  }
}
