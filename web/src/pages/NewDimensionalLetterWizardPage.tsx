import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dlApi, DLSpecForm } from '../api/dlClient';
import Stepper from '../components/Stepper';
import StepLogo from '../components/StepLogo';
import StepWall, { WallStepValue } from '../components/StepWall';
import StepDLSpec from '../components/StepDLSpec';

const STEPS = ['Logo', 'Wall & Placement', 'Specification'];

/**
 * The Dimensional Letters wizard. Same shape as `NewDesignWizardPage`
 * (Logo → Wall → Spec) and reuses its `StepLogo`/`StepWall` components
 * completely unmodified — both only ever call the generic upload/wall-preset
 * endpoints and hand their result back through `onChange`, never a
 * Channel-Letters-specific one, so nothing here had to fork them.
 *
 * The one real difference: Channel Letters saves a draft (`cl_design`) after
 * each step and generates a render against it; Dimensional Letters has no
 * draft table in v1, so this page keeps everything in local state and
 * submits once, at the end, to `POST /dl-proofs/wizard`.
 */
export default function NewDimensionalLetterWizardPage() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logoText, setLogoText] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [wall, setWall] = useState<WallStepValue>({
    wallPresetId: null,
    customWallImageUrl: null,
    widthInches: '',
    heightInches: '',
    maxSignAreaAllowed: '',
    box: { xFrac: 0.25, yFrac: 0.35, widthFrac: 0.5, heightFrac: 0.15 },
    facadeRect: null,
  });

  const [spec, setSpec] = useState<DLSpecForm>({
    materialFamily: 'Cast Metal',
    mountingMethod: 'Stud Mounted',
    quantity: 1,
  });

  async function handleGenerate() {
    if (!logoUrl) { setError('Upload logo dulu di step pertama.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const proof = await dlApi.createFromWizard({
        ...spec,
        logoText,
        logoUrl,
        wallPresetId: wall.wallPresetId ?? undefined,
        customWallImageUrl: wall.customWallImageUrl ?? undefined,
        widthInches: Number(wall.widthInches),
        heightInches: Number(wall.heightInches),
        maxSignAreaAllowed: wall.maxSignAreaAllowed ? Number(wall.maxSignAreaAllowed) : undefined,
        box: wall.box,
        facadeRect: wall.facadeRect ?? undefined,
      });
      navigate(`/dl-designs/${proof.rootProofId}`);
    } catch (e) {
      // Stay on the step so the spec is still there to correct.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>New Dimensional Letters Design</h1>
        <p>
          Cast metal, flat cut, injection molded, formed plastic, foam, HDU — jalur rule engine
          terpisah dari Channel Letters, return proof-nya format yang sama.
        </p>
      </div>

      <Stepper steps={STEPS} currentIndex={stepIndex} />

      {error && <div className="notice notice-error">{error}</div>}

      {stepIndex === 0 && (
        <StepLogo
          logoText={logoText}
          logoUrl={logoUrl}
          onChange={(patch) => {
            if (patch.logoText !== undefined) setLogoText(patch.logoText);
            if (patch.logoUrl !== undefined) setLogoUrl(patch.logoUrl);
          }}
          onNext={() => setStepIndex(1)}
        />
      )}

      {stepIndex === 1 && (
        <StepWall
          value={wall}
          logoUrl={logoUrl}
          logoText={logoText}
          onChange={(patch) => setWall((w) => ({ ...w, ...patch }))}
          onBack={() => setStepIndex(0)}
          onNext={() => setStepIndex(2)}
        />
      )}

      {stepIndex === 2 && (
        <StepDLSpec
          spec={spec}
          onChange={(patch) => setSpec((s) => ({ ...s, ...patch }))}
          onBack={() => setStepIndex(1)}
          onSubmit={handleGenerate}
          submitting={submitting}
        />
      )}
    </>
  );
}
