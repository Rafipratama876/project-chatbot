import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DL_FORM_MATERIAL_MAP, DL_MATERIALS, DL_FORM_MOUNT_MAP, DL_MOUNT_FACTS,
  DL_FINISHES, DL_FINISH_FACTS, DL_MATERIAL_FAMILIES,
} from '#/kb/domain/dl-taxonomy.js';
import { DL_VERSION } from '#/kb/domain/dl-boilerplate.js';

/**
 * The Dimensional Letters form values, served the same way
 * `KnowledgeController.options()` serves Channel Letters' — from the lookup
 * tables rather than duplicated in the wizard, so a client offering a value
 * DL has no mapping for is impossible by construction. No database
 * dependency: unlike CL's thresholds, DL v1 has no per-shop tunables.
 */
@ApiTags('dl-knowledge')
@Controller({ path: 'dl-knowledge', version: '1' })
export class DLKnowledgeController {
  @Get('options')
  @ApiOperation({ summary: 'The Dimensional Letters form values (material family, finish, mount).' })
  options() {
    return {
      dlVersion: DL_VERSION,
      materialFamily: Object.keys(DL_FORM_MATERIAL_MAP),
      materialFamilies: DL_MATERIAL_FAMILIES.map((id) => ({
        id, label: DL_MATERIALS[id].label, illuminable: DL_MATERIALS[id].illuminable,
        minHeight: DL_MATERIALS[id].minHeight, maxHeight: DL_MATERIALS[id].maxHeight,
        minDepth: DL_MATERIALS[id].minDepth, maxDepth: DL_MATERIALS[id].maxDepth,
      })),
      mountingMethod: Object.keys(DL_FORM_MOUNT_MAP),
      mounts: Object.values(DL_MOUNT_FACTS).map((m) => ({ id: m.id, label: m.label, description: m.description, standoff: m.standoff })),
      finishes: DL_FINISHES.map((id) => DL_FINISH_FACTS[id]),
    };
  }
}
