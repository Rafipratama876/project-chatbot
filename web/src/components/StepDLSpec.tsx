import { useEffect, useState } from 'react';
import { dlApi, DLKnowledgeOptions, DLSpecForm } from '../api/dlClient';

interface Props {
  spec: DLSpecForm;
  onChange: (patch: Partial<DLSpecForm>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

const FALLBACK_MATERIALS = [
  'Cast Metal', 'Flat Cut Metal', 'Flat Cut Acrylic', 'Flat Cut PVC',
  'Injection Molded', 'Formed Plastic', 'Foam', 'HDU',
];
const FALLBACK_MOUNTS = [
  'Double-Sided Tape', 'Stud Mounted', 'Flush Stud', 'Jam Nut Mount',
  'Spacer Mount', 'Corrugated Mount', 'Flat Metal Wall Mount', 'Stud Mounted with Mounting Pads',
];

export default function StepDLSpec({ spec, onChange, onBack, onSubmit, submitting }: Props) {
  const [options, setOptions] = useState<DLKnowledgeOptions | null>(null);

  useEffect(() => {
    dlApi.options().then(setOptions).catch(() => setOptions(null));
  }, []);

  const materials = options?.materialFamily?.length ? options.materialFamily : FALLBACK_MATERIALS;
  const mounts = options?.mountingMethod?.length ? options.mountingMethod : FALLBACK_MOUNTS;
  const finishes = options?.finishes?.length ? options.finishes.map((f) => f.label) : [];

  const selectedMaterial = options?.materialFamilies.find(
    (m) => m.label === spec.materialFamily || m.id === spec.materialFamily,
  );
  const selectedMount = options?.mounts.find((m) => m.label === spec.mountingMethod);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Dimensional Letters Specification</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4, marginBottom: 18 }}>
        Yang dikosongkan diisi default oleh DL engine (kedalaman, warna, finish) — proof-nya
        menyebutkan itu default, bukan pilihan kamu. Jalur rule ini terpisah total dari Channel
        Letters.
      </p>

      <div className="grid-3">
        <div className="field">
          <label>Material Family</label>
          <select
            value={spec.materialFamily}
            onChange={(e) => onChange({ materialFamily: e.target.value })}
          >
            {(materials.includes(spec.materialFamily) ? materials : [spec.materialFamily, ...materials]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {selectedMaterial && (
            <span className="hint">
              Tinggi {selectedMaterial.minHeight}″–{selectedMaterial.maxHeight}″ · Depth {selectedMaterial.minDepth}″–{selectedMaterial.maxDepth}″
              {selectedMaterial.illuminable ? ' · Bisa lit' : ' · Tidak lit'}
            </span>
          )}
        </div>

        <div className="field">
          <label>Finish</label>
          {finishes.length > 0 ? (
            <select value={spec.finish ?? ''} onChange={(e) => onChange({ finish: e.target.value })}>
              <option value="">(default sesuai material)</option>
              {finishes.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : (
            <input
              value={spec.finish ?? ''}
              onChange={(e) => onChange({ finish: e.target.value })}
              placeholder="mis. Satin Brushed"
            />
          )}
        </div>

        <div className="field">
          <label>Colour</label>
          <input
            value={spec.colour ?? ''}
            onChange={(e) => onChange({ colour: e.target.value })}
            placeholder="mis. Natural / mill finish"
          />
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
            onChange={(e) => onChange({ mountingSurfaceTexture: e.target.value as DLSpecForm['mountingSurfaceTexture'] })}
          >
            <option value="unspecified">Belum tahu</option>
            <option value="smooth">Rata / halus</option>
            <option value="uneven">Tidak rata / bertekstur (batu, ACM, metal)</option>
          </select>
          <span className="hint">Permukaan tidak rata → engine menyarankan mounting pads.</span>
        </div>

        <div className="field">
          <label>Depth (inci, opsional)</label>
          <input
            type="number"
            step="0.125"
            value={spec.depth ?? ''}
            onChange={(e) => onChange({ depth: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Default dari rentang material"
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

        <div className="field">
          <label>Illuminated</label>
          <select
            value={spec.illuminated ? 'yes' : 'no'}
            onChange={(e) => onChange({ illuminated: e.target.value === 'yes' })}
            disabled={selectedMaterial ? !selectedMaterial.illuminable : false}
          >
            <option value="no">Tidak</option>
            <option value="yes">Ya (LED)</option>
          </select>
          {selectedMaterial && !selectedMaterial.illuminable && (
            <span className="hint">{selectedMaterial.label} tidak pernah lit di scope PDF ini.</span>
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
