import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseCompatProjectJson } from '#/modules/compat/compat.mapper.js';

function field(fieldName: string | null, value: unknown, title: string | null, aiMetadata: string | null = null) {
  return {
    fieldId: 999,
    fieldName,
    title,
    value,
    type: 'text',
    required: false,
    options: [],
    aiMetadata,
  };
}

function project(): any {
  return {
    id: 'project-1',
    logo: { text: 'North Star Coffee' },
    signDetails: [{
      id: 'sign-1',
      signTypePersonality: 'personalities-channel-letters',
      fieldInputs: [
        field('channelLetterType', 'Front LIt', 'Renamed product choice', 'Use the selected construction verbatim.'),
        field('installationMethod', 'Flush Mounted', 'Arbitrary mounting title'),
        field('backerPanelOptions', 'Contour Flat', 'Unrelated panel heading'),
        field('backerPanelColor', 'Bronze', 'Finish selection'),
        field('enterYourSignQuantity', '3 signs', 'How many fabricated sets?'),
        field('returnDepth', '5"', 'Cabinet projection'),
        field('returnColor', 'Black', 'Side finish'),
        field('trimCapColor', 'Black', 'Edge finish'),
        field('faceColor', 'Warm White', 'Artwork face finish'),
        field('faceColorTreatment', 'Day/Night Vinyl', 'Surface treatment'),
        field('materialsThicknessDetails', 'Standards: include standard thicknesses', 'Proof annotation choice'),
        field('showSizesOnProof?', 'Yes', 'Dimension annotation toggle'),
        field(
          'typeAnyAdditionalInformationYouFeelWouldBeHelpfulForCreatingYourConceptRenderings',
          'Keep clear of awning',
          'Customer freeform remarks',
          'Treat this as customer intent, not measured geometry.',
        ),
        field('engineerConstraintV3', { circuit: 'existing', voltage: 120 }, 'Renamed engineering data', 'Confirm before fabrication.'),
      ],
      fields: { 'Channel Letter Type': 'Back Lit', 'Installation Method': 'Raceway Mounted' },
      fieldsMetadata: { channelLetterType: 'Must never be read.' },
      mockup: {
        views: [{
          id: 'view-1',
          index: 0,
          logoPositionState: {
            canvasSize: { w: 1600, h: 1000 },
            logoTransform: { x: 400, y: 250, width: 800, height: 200 },
            dimensions: {
              width: { value: 10, unit: 'ft' },
              height: { value: 762, unit: 'mm' },
            },
            facadeRect: {
              corners: [{ x: 0, y: 0 }, { x: 1600, y: 0 }, { x: 1600, y: 1000 }, { x: 0, y: 1000 }],
              widthInches: 240,
              heightInches: 150,
            },
          },
        }],
      },
    }],
    customerFiles: [
      { category: 'logo', downloadUrl: 'https://assets.test/logo.png' },
      { category: 'survey', viewId: 'view-1', viewIndex: 0, slot: 'background', url: 'https://assets.test/background.jpg' },
      { category: 'survey', viewId: 'view-1', viewIndex: 0, slot: 'upload', fileUrl: 'https://assets.test/upload.jpg' },
      { category: 'survey', viewId: 'view-1', viewIndex: 0, slot: 'measured', url: 'https://assets.test/measured.jpg' },
      { category: 'survey', viewId: 'view-1', viewIndex: 0, slot: 'transform', url: 'https://assets.test/transform.jpg' },
    ],
  };
}

describe('parseCompatProjectJson', () => {
  it('maps stable fieldNames while ignoring arbitrary titles and legacy fields', () => {
    const result = parseCompatProjectJson(project());

    expect(result).toMatchObject({
      projectId: 'project-1',
      signDetailId: 'sign-1',
      businessName: 'North Star Coffee',
      logoText: 'North Star Coffee',
      logoUrl: 'https://assets.test/logo.png',
      wallUrl: 'https://assets.test/transform.jpg',
      placement: {
        backgroundImage: '',
        imageWidth: 1600,
        imageHeight: 1000,
        reference: { a: { x: 400, y: 250 }, b: { x: 1200, y: 250 }, inches: 120 },
        rect: { x: 400, y: 250, w: 800, h: 200 },
      },
      form: {
        channelLetterType: 'Front Lit',
        installationMethod: 'Flush Mounted',
        backerPanelOption: 'Contour Flat',
        backerPanelColour: 'Bronze',
        mountingSurfaceColour: 'Bronze',
        quantity: 3,
        returnDepth: 5,
        returnColour: 'Black',
        trimCapColour: 'Black',
        faceColour: 'Warm White',
        showSizesOnProof: true,
        showMaterialThickness: true,
      },
    });
    expect(result.placement.facadeRect?.widthInches).toBe(240);
    expect(result.form.additionalInformation).toContain('Keep clear of awning');
    expect(result.form.additionalInformation).toContain('Face Color Treatment: Day/Night Vinyl');
    expect(result.form.additionalInformation).toContain('Renamed engineering data: {"circuit":"existing","voltage":120}');
    expect(result.form.additionalInformation).toContain('Guidance: Confirm before fabrication.');
    expect(result.form.additionalInformation).toContain('channelLetterType guidance: Use the selected construction verbatim.');
    expect(result.form.additionalInformation).toContain('Treat this as customer intent, not measured geometry.');
    expect(result.form.additionalInformation).not.toContain('Must never be read.');
  });

  it('uses only stable fieldName values for the business-name fallback', () => {
    const payload = project();
    delete payload.logo;
    payload.signDetails[0].fieldInputs.push(field('signText', 'Field Name', 'Not a business-name title'));
    expect(parseCompatProjectJson(payload).businessName).toBe('Field Name');
  });

  it('rejects missing fieldInputs instead of falling back to fields', () => {
    const payload = project();
    delete payload.signDetails[0].fieldInputs;
    expect(() => parseCompatProjectJson(payload)).toThrow(/fieldInputs must be an array/);
  });

  it('names a missing required semantic fieldName', () => {
    const payload = project();
    payload.signDetails[0].fieldInputs = payload.signDetails[0].fieldInputs
      .filter((input: any) => input.fieldName !== 'installationMethod');
    expect(() => parseCompatProjectJson(payload)).toThrow(/fieldName installationMethod is required/);
  });

  it('rejects an explicit non-channel-letter personality', () => {
    const payload = project();
    payload.signDetails[0].signTypePersonality = 'personalities-sign-cabinets';
    expect(() => parseCompatProjectJson(payload)).toThrow(BadRequestException);
    expect(() => parseCompatProjectJson(payload)).toThrow(/signTypePersonality/);
  });

  it.each([
    ['logo asset', (payload: ReturnType<typeof project>) => { payload.customerFiles = payload.customerFiles.filter((file: any) => file.category !== 'logo'); }, /logo file/],
    ['wall asset', (payload: ReturnType<typeof project>) => { payload.customerFiles = payload.customerFiles.filter((file: any) => file.category !== 'survey'); }, /survey URL/],
    ['canvas size', (payload: ReturnType<typeof project>) => { payload.signDetails[0].mockup.views[0].logoPositionState.canvasSize.w = 0; }, /canvasSize\.w/],
    ['logo transform', (payload: ReturnType<typeof project>) => { payload.signDetails[0].mockup.views[0].logoPositionState.logoTransform.width = 0; }, /logoTransform\.width/],
    ['dimensions', (payload: ReturnType<typeof project>) => { payload.signDetails[0].mockup.views[0].logoPositionState.dimensions.height.value = 0; }, /dimensions\.height\.value/],
  ])('rejects missing or malformed %s', (_name, mutate, message) => {
    const payload = project();
    mutate(payload);
    expect(() => parseCompatProjectJson(payload)).toThrow(message);
  });
});
