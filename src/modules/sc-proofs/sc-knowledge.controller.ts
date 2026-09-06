import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SC_FORM_FACE_MATERIAL_MAP, SC_FACE_MATERIAL_FACTS, SC_FACE_MATERIALS,
  SC_FORM_MOUNT_MAP, SC_MOUNT_FACTS, SC_RETAINER_FACTS, SC_RETAINER_TYPES,
  SC_EXTRUSION_DEPTHS, SC_CORNER_RADII,
} from '#/kb/domain/sc-taxonomy.js';
import { SC_VERSION } from '#/kb/domain/sc-boilerplate.js';

/**
 * The Sign Cabinet form values, served the same way `KnowledgeController.options()`
 * serves Channel Letters' and `DLKnowledgeController.options()` serves
 * Dimensional Letters' — from the lookup tables rather than duplicated in the
 * wizard, so a client offering a value SC has no mapping for is impossible by
 * construction. No database dependency: unlike CL's thresholds, SC v1 has no
 * per-shop tunables.
 */
@ApiTags('sc-knowledge')
@Controller({ path: 'sc-knowledge', version: '1' })
export class SCKnowledgeController {
  @Get('options')
  @ApiOperation({ summary: 'The Sign Cabinet form values (face material, retainer, corners, mount).' })
  options() {
    return {
      scVersion: SC_VERSION,
      faceMaterial: Object.keys(SC_FORM_FACE_MATERIAL_MAP),
      faceMaterials: SC_FACE_MATERIALS.map((id) => ({
        id, label: SC_FACE_MATERIAL_FACTS[id].label, illuminable: SC_FACE_MATERIAL_FACTS[id].illuminable,
      })),
      mountingMethod: Object.keys(SC_FORM_MOUNT_MAP),
      mounts: Object.values(SC_MOUNT_FACTS).map((m) => ({ id: m.id, label: m.label, description: m.description })),
      retainerTypes: SC_RETAINER_TYPES.map((id) => SC_RETAINER_FACTS[id]),
      extrusionDepths: SC_EXTRUSION_DEPTHS,
      cornerRadii: SC_CORNER_RADII,
    };
  }
}
