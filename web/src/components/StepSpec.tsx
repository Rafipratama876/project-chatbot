import { useEffect, useState } from 'react';
import { api, SignSpec, KnowledgeOptions } from '../api/client';

interface Props {
  spec: Partial<SignSpec>;
  onChange: (patch: Partial<SignSpec>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

/**
 * Fallbacks only. The real lists come from /knowledge/options, which reads
 * them off the KB — a list hard-coded here would drift the moment the KB gains
 * a construction, and the wizard would quietly stop offering it.
 */
const FALLBACK = {
  channelLetterType: ['Front Lit', 'Reverse Halo', 'Front & Back Lit', 'Non-Illuminated'],
  installationMethod: ['Flush Mounted', 'Direct Mounted with Spacers', 'Raceway', 'Wireway', 'Custom'],
  backerPanelOption: ['No Backer', 'Straight Flat', 'Straight Pan', 'Contour Flat', 'Custom'],
  trimCapColours: ['Black', 'White', 'Dark Bronze'],
};

const FACE_COLOR_TREATMENTS = ['Per Logo', 'Color Acrylic', 'Day/Night Vinyl', 'Painted Aluminum', 'Custom'];
const RETURN_DEPTHS = ['3"', '4"', '5"', 'Custom'];
const MATERIAL_THICKNESS_OPTIONS = ['Do Not Show On Proof', 'Standards'];

export default function StepSpec({ spec, onChange, onBack, onSubmit, submitting }: Props) {
  const [options, setOptions] = useState<KnowledgeOptions | null>(null);

  useEffect(() => {
    api.options().then(setOptions).catch(() => setOptions(null));
  }, []);

  const list = (key: keyof typeof FALLBACK): string[] => {
    const fromKb = options?.[key as keyof KnowledgeOptions];
    return Array.isArray(fromKb) && fromKb.length > 0 ? (fromKb as string[]) : FALLBACK[key];
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Sign Specification</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, marginBottom: 18 }}>
        Yang dikosongkan diisi standar rumah oleh engine, dan proof-nya menyebutkan bahwa itu
        default — bukan pilihan kamu.
      </p>

      <div className="grid-3">
        <Select
          label="Channel Letter Type"
          value={spec.channelLetterType ?? 'Front Lit'}
          options={list('channelLetterType')}
          onChange={(v) => onChange({ channelLetterType: v })}
        />

        <div className="field">
          <label>Face Color</label>
          <input
            value={spec.faceColor ?? ''}
            onChange={(e) => onChange({ faceColor: e.target.value })}
            placeholder="Per Logo"
          />
          <span className="hint">“Per Logo” berarti warnanya diambil dari artwork, bukan dari sini.</span>
        </div>

        <SelectWithCustom
          label="Face Color Treatment"
          value={spec.faceColorTreatment ?? 'Per Logo'}
          options={FACE_COLOR_TREATMENTS}
          custom={spec.faceColorTreatmentCustomDetail ?? ''}
          onChange={(v) => onChange({ faceColorTreatment: v })}
          onCustomChange={(v) => onChange({ faceColorTreatmentCustomDetail: v })}
        />

        <Select
          label="Trim Cap Color"
          value={spec.trimCapColor ?? 'Black'}
          options={list('trimCapColours')}
          onChange={(v) => onChange({ trimCapColor: v })}
        />

        <div className="field">
          <label>Return Color</label>
          <input
            value={spec.returnColor ?? ''}
            onChange={(e) => onChange({ returnColor: e.target.value })}
            placeholder="Black"
          />
        </div>

        <SelectWithCustom
          label="Return Depth"
          value={spec.returnDepth ?? '5"'}
          options={RETURN_DEPTHS}
          custom={spec.returnDepthCustomDetail ?? ''}
          customPlaceholder="mis. 7.5 inch returns"
          onChange={(v) => onChange({ returnDepth: v })}
          onCustomChange={(v) => onChange({ returnDepthCustomDetail: v })}
        />

        <SelectWithCustom
          label="Installation Method"
          value={spec.installationMethod ?? 'Flush Mounted'}
          options={list('installationMethod')}
          custom={spec.installationMethodCustomDetail ?? ''}
          onChange={(v) => onChange({ installationMethod: v })}
          onCustomChange={(v) => onChange({ installationMethodCustomDetail: v })}
        />

        <SelectWithCustom
          label="Backer Panel"
          value={spec.backerPanelOption ?? 'No Backer'}
          options={list('backerPanelOption')}
          custom={spec.backerPanelCustomDetail ?? ''}
          onChange={(v) => onChange({ backerPanelOption: v })}
          onCustomChange={(v) => onChange({ backerPanelCustomDetail: v })}
        />

        <div className="field">
          <label>Mounting Surface Color</label>
          <input
            value={spec.backerPanelColor ?? ''}
            onChange={(e) => onChange({ backerPanelColor: e.target.value })}
            placeholder="Raceway & backer match this"
          />
        </div>

        <div className="field">
          <label>Sign Quantity</label>
          <input
            type="number"
            min={1}
            value={spec.quantity ?? 1}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          />
        </div>

        <Select
          label="Material Thickness Details"
          value={spec.materialsThicknessOption ?? 'Do Not Show On Proof'}
          options={MATERIAL_THICKNESS_OPTIONS}
          onChange={(v) => onChange({ materialsThicknessOption: v })}
        />
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label>Additional Information</label>
        <textarea
          rows={3}
          value={spec.additionalInformation ?? ''}
          onChange={(e) => onChange({ additionalInformation: e.target.value })}
          placeholder="Apa pun yang tidak tercakup dropdown di atas."
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" disabled={submitting} onClick={onSubmit}>
          {submitting ? 'Membuat proof…' : 'Generate Proof →'}
        </button>
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {/* A stored value the KB no longer lists still has to be selectable,
            or reopening an old design silently rewrites its spec. */}
        {(options.includes(value) ? options : [value, ...options]).map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  );
}

function SelectWithCustom({
  label, value, options, custom, customPlaceholder, onChange, onCustomChange,
}: {
  label: string;
  value: string;
  options: string[];
  custom: string;
  customPlaceholder?: string;
  onChange: (v: string) => void;
  onCustomChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {(options.includes(value) ? options : [value, ...options]).map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      {value === 'Custom' && (
        <>
          <input
            style={{ marginTop: 6 }}
            value={custom}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder={customPlaceholder ?? 'Jelaskan detail custom-nya…'}
          />
          {/* Not decoration: "Custom" on its own is not a specification, and
              the engine refuses it rather than printing the word on the proof. */}
          {!custom.trim() && <span className="hint hint-warn">Wajib diisi kalau pilih Custom.</span>}
        </>
      )}
    </div>
  );
}
