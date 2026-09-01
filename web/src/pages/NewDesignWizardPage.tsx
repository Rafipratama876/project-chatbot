import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, SignSpec } from '../api/client';
import Stepper from '../components/Stepper';
import StepLogo from '../components/StepLogo';
import StepWall, { WallStepValue } from '../components/StepWall';
import StepSpec from '../components/StepSpec';

const STEPS = ['Logo', 'Wall & Placement', 'Specification'];

export default function NewDesignWizardPage() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [designId, setDesignId] = useState<string | null>(null);
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

  const [spec, setSpec] = useState<Partial<SignSpec>>({
    channelLetterType: 'Front Lit',
    faceColor: 'Per Logo',
    faceColorTreatment: 'Per Logo',
    trimCapColor: 'Black',
    returnColor: 'Black',
    returnDepth: '5"',
    installationMethod: 'Flush Mounted',
    backerPanelOption: 'No Backer',
    quantity: 1,
    materialsThicknessOption: 'Do Not Show On Proof',
  });

  async function ensureDesign(): Promise<string> {
    if (designId) return designId;
    const design = await api.createDesign(logoText || 'Untitled Sign');
    setDesignId(design.id);
    return design.id;
  }

  async function handleLogoNext() {
    setError(null);
    try {
      const id = await ensureDesign();
      await api.updateLogo(id, { logoText, logoUrl: logoUrl ?? undefined });
      setStepIndex(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleWallNext() {
    if (!designId) return;
    setError(null);
    try {
      // The interactive box stores its TOP-LEFT corner; the server stores the
      // centre, because that is what survives a change of sign proportions
      // without the sign appearing to jump.
      await api.updateWallPosition(designId, {
        wallPresetId: wall.wallPresetId ?? undefined,
        customWallImageUrl: wall.customWallImageUrl ?? undefined,
        positionX: wall.box.xFrac + wall.box.widthFrac / 2,
        positionY: wall.box.yFrac + wall.box.heightFrac / 2,
        scale: wall.box.widthFrac,
        // The box's height goes too. Rebuilding it server-side from the stated
        // proportions is circular once a wall face is marked, because there the
        // stated size is measured FROM this box.
        scaleY: wall.box.heightFrac,
        widthInches: Number(wall.widthInches),
        heightInches: Number(wall.heightInches),
        maxSignAreaAllowed: wall.maxSignAreaAllowed ? Number(wall.maxSignAreaAllowed) : undefined,
        facadeRect: wall.facadeRect ?? undefined,
      });
      setStepIndex(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleGenerate() {
    if (!designId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.updateSpec(designId, spec);
      await api.generateRender(designId);
      navigate(`/designs/${designId}`);
    } catch (e) {
      // Stay on the step so the spec is still there to correct — the engine's
      // refusals here name the field, and navigating away loses both.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>New Design</h1>
        <p>
          Proof konsep pre-sales: day &amp; night view, spec block dan disclosure, dihitung dari
          56 rule di knowledge base — bukan digambar ulang oleh model.
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
          onNext={handleLogoNext}
        />
      )}

      {stepIndex === 1 && (
        <StepWall
          value={wall}
          logoUrl={logoUrl}
          logoText={logoText}
          onChange={(patch) => setWall((w) => ({ ...w, ...patch }))}
          onBack={() => setStepIndex(0)}
          onNext={handleWallNext}
        />
      )}

      {stepIndex === 2 && (
        <StepSpec
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
