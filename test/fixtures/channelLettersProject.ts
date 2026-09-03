/**
 * A channel-letters Project JSON in the exact shape tsp-api emits.
 *
 * Structure copied from a real captured payload (`signDetails[0].fieldInputs`
 * with `fieldId`/`fieldName`/`title`/`value`/`type`/`required`/`options`/
 * `aiMetadata`, `mockup.views[0].logoPositionState`, `customerFiles` keyed by
 * `category` + `slot` + `viewId`); only the field vocabulary is the
 * channel-letters one. The captured sample was a Plaques order, so this is the
 * first record of what the channel-letters intake actually has to accept.
 *
 * `facadeRect` is deliberately absent: the real payload carries
 * `logoPositionState.facadeRect: null`, so the camera-matched render path is
 * the exception and the calibrated-sprite path is the default. A fixture that
 * always supplied a facade rectangle would test the wrong branch.
 */

export interface FieldInput {
  fieldId: number;
  fieldName: string | null;
  title: string | null;
  value: unknown;
  type: string;
  required: boolean;
  options: string[];
  aiMetadata: string | null;
}

function field(
  fieldId: number,
  fieldName: string | null,
  title: string | null,
  value: unknown,
  extra: Partial<FieldInput> = {},
): FieldInput {
  return {
    fieldId,
    fieldName,
    title,
    value,
    type: 'text',
    required: false,
    options: [],
    aiMetadata: null,
    ...extra,
  };
}

const VIEW_ID = '6a98f5bd22c295afb4da26ff';

/** Deep-cloned per call so a mutating test cannot leak into the next one. */
export function channelLettersProject(): Record<string, any> {
  return {
    id: 'daf7a41de719b610185bedeb',
    logo: {
      mode: 'text',
      text: 'North Star Coffee',
      fontFamily: 'Poppins',
      isBold: true,
      isItalic: null,
      color: '#1b1b1b',
      assetId: null,
    },
    signDetails: [
      {
        id: 'd2c7eda71e36a8b0841c6abe',
        signId: '6a9810d422c295afb4da0eb3',
        signTypeTitle: 'Channel Letters',
        signTypePersonality: 'personalities-channel-letters',
        fields: {
          'Channel Letter Type': 'Front Lit',
          'Installation Method': 'Raceway Mounted',
        },
        fieldsMetadata: {
          channelLetterType: { id: 'channelLetterType', type: 'radio-image' },
        },
        fieldInputs: [
          field(701, 'channelLetterType', 'Channel Letter Type', 'Front Lit', {
            type: 'radio-image',
            required: true,
            options: ['Front Lit', 'Back Lit', 'Front and Back Lit', 'Non-Illuminated'],
          }),
          field(702, 'installationMethod', 'Installation Method', 'Raceway Mounted', {
            type: 'radio-image',
            required: true,
            options: ['Flush Mounted', 'Raceway Mounted', 'Direct Mounted with Spacers'],
          }),
          field(703, 'backerPanelOptions', 'Backer Panel Options', 'No Backer Panel', {
            type: 'radio',
            options: ['No Backer Panel', 'Contour Flat', 'Rectangular Flat'],
          }),
          field(704, 'backerPanelColor', 'Backer Panel Color', 'Bronze'),
          field(705, 'enterYourSignQuantity', 'Enter your sign quantity', '1', {
            type: 'number',
          }),
          field(706, 'returnDepth', 'Return Depth', '5"'),
          field(707, 'returnColor', 'Return Color', 'Black'),
          field(708, 'trimCapColor', 'Trim Cap Color', 'Black'),
          field(709, 'faceColor', 'Face Color', 'White'),
          field(710, 'faceColorTreatment', 'Face Color Treatment', 'Standard Translucent Acrylic'),
          field(711, 'materialsThicknessDetails', 'Materials & Thickness Details', 'Standards: include standard thicknesses'),
          field(712, 'showSizesOnProof?', 'Show sizes on proof?', 'Yes', { type: 'radio' }),
          field(
            713,
            'typeAnyAdditionalInformationYouFeelWouldBeHelpfulForCreatingYourConceptRenderings',
            'Type any additional information you feel would be helpful for creating your concept renderings',
            'Keep the letters clear of the awning.',
            { aiMetadata: 'Treat this as customer intent, not measured geometry.' },
          ),
        ],
        mockup: {
          mockupProfile: {
            id: '6a6c36b3645f5c4a11f567db',
            easyID: 1,
            key: 'wall-signs',
            title: 'Wall Signs',
          },
          signTypeTitle: 'Channel Letters',
          enabled: true,
          views: [
            {
              id: VIEW_ID,
              index: 0,
              source: 'upload',
              logoPositionState: {
                logoTransform: {
                  x: 268.266796875,
                  y: 131.02013626098633,
                  width: 229.94296875,
                  height: 36.37769622802735,
                  rotation: 0,
                  mode: 'resize',
                  corners: null,
                },
                rulerLine: null,
                rulerRealSize: null,
                rulerUnit: 'inches',
                canvasSize: { w: 766.4765625, h: 298.41796875 },
                dimensions: {
                  width: { value: 120, unit: 'inches' },
                  height: { value: 19, unit: 'inches' },
                  area: { value: 2280, unit: 'sq in' },
                  inSqFt: 15.833333333333334,
                },
                facadeRect: null,
              },
            },
          ],
        },
      },
    ],
    customerFiles: [
      {
        category: 'logo',
        id: 'file-logo-1',
        url: 'https://assets.test/north-star-logo.svg',
        mode: 'upload',
        viewId: null,
        slot: null,
      },
      {
        category: 'survey',
        id: 'file-survey-bg',
        url: 'https://assets.test/storefront-background.jpg',
        viewId: VIEW_ID,
        slot: 'background',
      },
      {
        category: 'survey',
        id: 'file-survey-transform',
        url: 'https://assets.test/storefront-transform.jpg',
        viewId: VIEW_ID,
        slot: 'transform',
      },
      {
        category: 'survey',
        id: 'file-survey-measured',
        url: 'https://assets.test/storefront-measured.jpg',
        viewId: VIEW_ID,
        slot: 'measured',
      },
    ],
  };
}
