import { BadRequestException } from '@nestjs/common';
import type { JobInput, PlacementInput } from '#/kb/domain/spec.js';

export interface CompatProject {
  projectId: string;
  signDetailId: string;
  businessName: string;
  logoText: string;
  logoUrl: string;
  wallUrl: string;
  placement: PlacementInput;
  form: JobInput['form'];
}

type RecordValue = Record<string, unknown>;

interface FieldInput {
  fieldName: string | null;
  title: string | null;
  value: unknown;
  aiMetadata: string | null;
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function record(value: unknown, path: string): RecordValue {
  if (!isRecord(value)) throw new BadRequestException(`${path} must be an object`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function positive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${path} must be a positive finite number`);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${path} must be a finite number`);
  }
  return value;
}

function valueText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const match = /[-+]?\d+(?:\.\d+)?/.exec(value);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function yes(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'false') return false;
  return undefined;
}

function fieldInputs(value: unknown): FieldInput[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('projectJson.signDetails[0].fieldInputs must be an array');
  }
  return value.map((candidate, index) => {
    const path = `projectJson.signDetails[0].fieldInputs[${index}]`;
    const input = record(candidate, path);
    if (input.fieldName !== null && typeof input.fieldName !== 'string') {
      throw new BadRequestException(`${path}.fieldName must be a string or null`);
    }
    if (input.title !== null && typeof input.title !== 'string') {
      throw new BadRequestException(`${path}.title must be a string or null`);
    }
    if (input.aiMetadata !== null && typeof input.aiMetadata !== 'string') {
      throw new BadRequestException(`${path}.aiMetadata must be a string or null`);
    }
    return {
      fieldName: input.fieldName as string | null,
      title: input.title as string | null,
      value: input.value,
      aiMetadata: input.aiMetadata as string | null,
    };
  });
}

function inches(value: unknown, path: string): number {
  const dimension = record(value, path);
  const amount = positive(dimension.value, `${path}.value`);
  const unit = normalize(text(dimension.unit, `${path}.unit`));
  const factors: Record<string, number> = {
    in: 1,
    inch: 1,
    inches: 1,
    ft: 12,
    foot: 12,
    feet: 12,
    mm: 1 / 25.4,
    millimeter: 1 / 25.4,
    millimeters: 1 / 25.4,
    cm: 1 / 2.54,
    centimeter: 1 / 2.54,
    centimeters: 1 / 2.54,
  };
  const factor = factors[unit];
  if (!factor) throw new BadRequestException(`${path}.unit must be in, ft, mm, or cm`);
  return amount * factor;
}

function urlOf(file: RecordValue): string | undefined {
  for (const key of ['url', 'downloadUrl', 'fileUrl']) {
    if (typeof file[key] === 'string' && file[key].trim()) return file[key].trim();
  }
  return undefined;
}

function facadeFrom(state: RecordValue): PlacementInput['facadeRect'] {
  if (!isRecord(state.facadeRect) || !Array.isArray(state.facadeRect.corners)) return undefined;
  const corners = state.facadeRect.corners;
  if (corners.length !== 4 || !corners.every(isRecord)) return undefined;
  const points = corners.map((corner) => ({ x: corner.x, y: corner.y }));
  if (!points.every((point) => typeof point.x === 'number' && Number.isFinite(point.x)
    && typeof point.y === 'number' && Number.isFinite(point.y))) return undefined;
  if (typeof state.facadeRect.widthInches !== 'number' || state.facadeRect.widthInches <= 0
    || typeof state.facadeRect.heightInches !== 'number' || state.facadeRect.heightInches <= 0) {
    return undefined;
  }
  return {
    corners: points as Array<{ x: number; y: number }>,
    widthInches: state.facadeRect.widthInches,
    heightInches: state.facadeRect.heightInches,
  };
}

function placementFrom(view: RecordValue): PlacementInput {
  const base = 'projectJson.signDetails[0].mockup.views[0].logoPositionState';
  const state = record(view.logoPositionState, base);
  const canvas = record(state.canvasSize, `${base}.canvasSize`);
  const transform = record(state.logoTransform, `${base}.logoTransform`);
  const dimensions = record(state.dimensions, `${base}.dimensions`);
  const imageWidth = positive(canvas.w, `${base}.canvasSize.w`);
  const imageHeight = positive(canvas.h, `${base}.canvasSize.h`);
  const rect = {
    x: finite(transform.x, `${base}.logoTransform.x`),
    y: finite(transform.y, `${base}.logoTransform.y`),
    w: positive(transform.width, `${base}.logoTransform.width`),
    h: positive(transform.height, `${base}.logoTransform.height`),
  };
  const widthInches = inches(dimensions.width, `${base}.dimensions.width`);
  inches(dimensions.height, `${base}.dimensions.height`);
  const facadeRect = facadeFrom(state);
  return {
    backgroundImage: '',
    imageWidth,
    imageHeight,
    reference: {
      a: { x: rect.x, y: rect.y },
      b: { x: rect.x + rect.w, y: rect.y },
      inches: widthInches,
      label: 'stated sign width',
    },
    rect,
    ...(facadeRect ? { facadeRect } : {}),
  };
}

const semanticNames = {
  channellettertype: 'channelLetterType',
  installationmethod: 'installationMethod',
  backerpaneloptions: 'backerPanelOption',
  enteryoursignquantity: 'quantity',
  showsizesonproof: 'showSizesOnProof',
  backerpanelcolor: 'backerPanelColour',
  facecolor: 'faceColour',
  returncolor: 'returnColour',
  trimcapcolor: 'trimCapColour',
  returndepth: 'returnDepth',
  materialsthicknessdetails: 'showMaterialThickness',
  facecolortreatment: 'faceColourTreatment',
  typeanyadditionalinformationyoufeelwouldbehelpfulforcreatingyourconceptrenderings: 'additionalInformation',
} as const;

function formFrom(inputs: FieldInput[], businessName: string): JobInput['form'] {
  const byName = new Map(inputs
    .filter((input): input is FieldInput & { fieldName: string } => Boolean(input.fieldName?.trim()))
    .map((input) => [normalize(input.fieldName), input]));
  const input = (fieldName: string): FieldInput | undefined => byName.get(normalize(fieldName));
  const string = (fieldName: string): string | undefined => valueText(input(fieldName)?.value);
  const channelLetterTypeRaw = string('channelLetterType');
  const installationMethod = string('installationMethod');
  if (!channelLetterTypeRaw) {
    throw new BadRequestException('projectJson.signDetails[0].fieldInputs fieldName channelLetterType is required');
  }
  if (!installationMethod) {
    throw new BadRequestException('projectJson.signDetails[0].fieldInputs fieldName installationMethod is required');
  }

  const notes: string[] = [];
  for (const field of inputs) {
    const normalizedName = field.fieldName ? normalize(field.fieldName) : '';
    const semantic = semanticNames[normalizedName as keyof typeof semanticNames];
    const value = valueText(field.value);
    const guidance = field.aiMetadata?.trim();
    if (!semantic && value) {
      const label = field.title?.trim() || field.fieldName?.trim() || 'Unnamed field';
      notes.push(`${label}: ${value}${guidance ? ` (Guidance: ${guidance})` : ''}`);
    } else {
      if (semantic === 'additionalInformation' && value) notes.push(value);
      if (semantic === 'faceColourTreatment' && value) notes.push(`Face Color Treatment: ${value}`);
      if (guidance) notes.push(`${field.fieldName ?? 'Unnamed field'} guidance: ${guidance}`);
    }
  }

  const quantityValue = numeric(input('enterYourSignQuantity')?.value);
  const materialThickness = string('materialsThicknessDetails');
  const backerPanelColour = string('backerPanelColor');
  return {
    businessName,
    channelLetterType: normalize(channelLetterTypeRaw) === 'frontlit' ? 'Front Lit' : channelLetterTypeRaw,
    installationMethod,
    backerPanelOption: string('backerPanelOptions'),
    backerPanelColour,
    mountingSurfaceColour: backerPanelColour,
    quantity: quantityValue === undefined ? undefined : Math.floor(quantityValue),
    returnDepth: numeric(input('returnDepth')?.value),
    returnColour: string('returnColor'),
    trimCapColour: string('trimCapColor'),
    faceColour: string('faceColor'),
    showSizesOnProof: yes(input('showSizesOnProof?')?.value),
    showMaterialThickness: materialThickness === undefined
      ? undefined
      : normalize(materialThickness).startsWith('standards')
        || normalize(materialThickness).includes('standardthickness'),
    additionalInformation: notes.length ? notes.join('. ') : undefined,
  };
}

export function parseCompatProjectJson(raw: unknown): CompatProject {
  const project = record(raw, 'projectJson');
  const projectId = text(project.id, 'projectJson.id');
  if (!Array.isArray(project.signDetails) || project.signDetails.length !== 1) {
    throw new BadRequestException('projectJson.signDetails must contain exactly one entry');
  }
  const sign = record(project.signDetails[0], 'projectJson.signDetails[0]');
  const signDetailId = text(sign.id, 'projectJson.signDetails[0].id');
  if (sign.signTypePersonality !== undefined && sign.signTypePersonality !== null) {
    const personality = text(sign.signTypePersonality, 'projectJson.signDetails[0].signTypePersonality');
    if (personality !== 'personalities-channel-letters' && personality !== 'channel-letters') {
      throw new BadRequestException(
        "projectJson.signDetails[0].signTypePersonality must be 'personalities-channel-letters' or 'channel-letters'",
      );
    }
  }
  const inputs = fieldInputs(sign.fieldInputs);
  const mockup = record(sign.mockup, 'projectJson.signDetails[0].mockup');
  if (!Array.isArray(mockup.views) || !isRecord(mockup.views[0])) {
    throw new BadRequestException('projectJson.signDetails[0].mockup.views[0] is required');
  }
  const view = mockup.views[0];
  const viewId = typeof view.id === 'string' ? view.id : undefined;
  const viewIndex = typeof view.index === 'number' ? view.index : 0;
  if (!Array.isArray(project.customerFiles)) {
    throw new BadRequestException('projectJson.customerFiles must be an array');
  }
  const files = project.customerFiles.filter(isRecord);
  const logo = files.find((file) => normalize(String(file.category ?? '')) === 'logo' && urlOf(file));
  if (!logo) {
    throw new BadRequestException(
      'projectJson.customerFiles must include a logo file with url, downloadUrl, or fileUrl',
    );
  }
  const surveys = files.filter((file) => normalize(String(file.category ?? '')) === 'survey'
    && (viewId ? file.viewId === viewId : file.viewIndex === viewIndex));
  const wall = ['transform', 'measured', 'upload', 'background']
    .map((slot) => surveys.find((file) => normalize(String(file.slot ?? '')) === slot && urlOf(file)))
    .find(Boolean);
  if (!wall) {
    throw new BadRequestException('projectJson.customerFiles must include a survey URL for mockup.views[0]');
  }

  const topLogo = isRecord(project.logo) ? valueText(project.logo.text) : undefined;
  const fieldBusinessName = ['businessName', 'signText', 'logoText']
    .map((name) => inputs.find((candidate) => candidate.fieldName
      && normalize(candidate.fieldName) === normalize(name)))
    .map((candidate) => valueText(candidate?.value))
    .find(Boolean);
  const businessName = topLogo || fieldBusinessName
    || valueText(project.display_name) || valueText(project.companyName)
    || valueText(project.customerName) || 'Channel Letter Project';

  return {
    projectId,
    signDetailId,
    businessName,
    logoText: topLogo || fieldBusinessName || businessName,
    logoUrl: urlOf(logo)!,
    wallUrl: urlOf(wall)!,
    placement: placementFrom(view),
    form: formFrom(inputs, businessName),
  };
}
