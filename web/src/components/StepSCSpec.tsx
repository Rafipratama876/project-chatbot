import { useEffect, useState } from 'react';
import { scApi, SCKnowledgeOptions, SCSpecForm } from '../api/scClient';

interface Props {
  spec: SCSpecForm;
  onChange: (patch: Partial<SCSpecForm>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

const FALLBACK_FACE_MATERIALS = [
  'Acrylic / Polycarbonate', 'Pan Face', 'Embossed Pan Face', 'Panel with Vinyl',
  'Cut-Through Face', 'Push-Through Acrylic', 'Flex Face',
];
const FALLBACK_MOUNTS = ['Wall Mounted', 'Blade Mounted', 'Ceiling Mounted', 'Pole Mounted', 'Base Mounted'];
const FALLBACK_RETAINERS = ['normal', 'insert', 'zf-style', 'hanger-bar'];
const FALLBACK_DEPTHS = [7, 9, 12];

export default function StepSCSpec({ spec, onChange, onBack, onSubmit, submitting }: Props) {
  const [options, setOptions] = useState<SCKnowledgeOptions | null>(null);

  useEffect(() => {
    scApi.options().then(setOptions).catch(() => setOptions(null));
  }, []);

  const faceMaterials = options?.faceMaterial?.length ? options.faceMaterial : FALLBACK_FACE_MATERIALS;
  const mounts = options?.mountingMethod?.length ? options.mountingMethod : FALLBACK_MOUNTS;
  const retainers = options?.retainerTypes?.length ? options.retainerTypes : FALLBACK_RETAINERS.map((id) => ({ id, label: id, description: '' }));
  const depths = options?.extrusionDepths?.length ? options.extrusionDepths : FALLBACK_DEPTHS;

  const selectedFace = options?.faceMaterials.find((m) => m.label === spec.faceMaterial || m.id === spec.faceMaterial);
  const selectedMount = options?.mounts.find((m) => m.label === spec.mountingMethod);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Sign Cabinet Specification</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, marginBottom: 18 }}>
        Yang dikosongkan diisi default oleh SC engine (extrusion depth, retainer, warna) — proof-nya
        menyebutkan itu default, bukan pilihan kamu. Jalur rule ini terpisah total dari Channel
        Letters dan Dimensional Letters.
      </p>

      <div className="grid-3">
        <div className="field">
          <label>Face Material</label>
          <select
            value={spec.faceMaterial}
            onChange={(e) => onChange({ faceMaterial: e.target.value })}
          >
            {(faceMaterials.includes(spec.faceMaterial) ? faceMaterials : [spec.faceMaterial, ...faceMaterials]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {selectedFace && (
            <span className="hint">{selectedFace.illuminable ? 'Bisa diberi lampu (LED)' : 'PDF: biasanya tanpa penerangan'}</span>
          )}
        </div>

        <div className="field">
          <label>Face Colour</label>
          <input
            value={spec.faceColour ?? ''}
            onChange={(e) => onChange({ faceColour: e.target.value })}
            placeholder="mis. White"
          />
        </div>

        <div className="field">
          <label>Illuminated</label>
          <select
            value={spec.illuminated ? 'yes' : 'no'}
            onChange={(e) => onChange({ illuminated: e.target.value === 'yes' })}
            disabled={selectedFace ? !selectedFace.illuminable : false}
          >
            <option value="no">Tidak</option>
            <option value="yes">Ya (LED)</option>
          </select>
          {selectedFace && !selectedFace.illuminable && (
            <span className="hint">{selectedFace.label} biasanya tanpa penerangan per PDF.</span>
          )}
        </div>

        {spec.illuminated && (
          <div className="field">
            <label>LED Colour</label>
            <input
              value={spec.ledColour ?? ''}
              onChange={(e) => onChange({ ledColour: e.target.value })}
              placeholder="White"
            />
          </div>
        )}

        <div className="field">
          <label>Extrusion Depth (inci)</label>
          <select
            value={spec.extrusionDepth ?? ''}
            onChange={(e) => onChange({ extrusionDepth: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">(default 7")</option>
            {depths.map((d) => <option key={d} value={d}>{d}"</option>)}
          </select>
        </div>

        <div className="field">
          <label>Corner Style</label>
          <select
            value={spec.cornerStyle ?? 'square'}
            onChange={(e) => onChange({ cornerStyle: e.target.value as SCSpecForm['cornerStyle'] })}
          >
            <option value="square">Square</option>
            <option value="radius">Radius</option>
          </select>
        </div>

        {spec.cornerStyle === 'radius' && (
          <div className="field">
            <label>Corner Radius (inci)</label>
            <select
              value={spec.cornerRadius ?? ''}
              onChange={(e) => onChange({ cornerRadius: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">(default 6")</option>
              {(options?.cornerRadii ?? [2, 4, 6, 8, 10, 12, 14, 16]).map((r) => (
                <option key={r} value={r}>{r}"</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Retainer Type</label>
          <select
            value={spec.retainerType ?? ''}
            onChange={(e) => onChange({ retainerType: e.target.value })}
          >
            <option value="">(default Normal Retainer)</option>
            {retainers.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Mounting Method</label>
          <select
            value={spec.mountingMethod}
            onChange={(e) => onChange({ mountingMethod: e.target.value })}
          >
            {(mounts.includes(spec.mountingMethod) ? mounts : [spec.mountingMethod, ...mounts]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {selectedMount && <span className="hint">{selectedMount.description}</span>}
        </div>

        <div className="field">
          <label>Mounting Surface Colour</label>
          <input
            value={spec.mountingSurfaceColour ?? ''}
            onChange={(e) => onChange({ mountingSurfaceColour: e.target.value })}
            placeholder="Warna dinding tempat mount"
          />
        </div>

        <div className="field">
          <label>Mounting Surface Texture</label>
          <select
            value={spec.mountingSurfaceTexture ?? 'unspecified'}
            onChange={(e) => onChange({ mountingSurfaceTexture: e.target.value as SCSpecForm['mountingSurfaceTexture'] })}
          >
            <option value="unspecified">Belum tahu</option>
            <option value="smooth">Rata / halus</option>
            <option value="uneven">Tidak rata / bertekstur (batu, ACM, metal)</option>
          </select>
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
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label>Attachment Detail (opsional — saddle, thru-pole, stiff arm, dll.)</label>
        <input
          value={spec.attachmentDetail ?? ''}
          onChange={(e) => onChange({ attachmentDetail: e.target.value })}
          placeholder="mis. Two Saddle, Stiff Arm / Angle Iron"
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
