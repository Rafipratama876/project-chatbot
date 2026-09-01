import { Design, Render } from '../api/client';

/**
 * The §9.3 spec block, as the review page shows it.
 *
 * These are the customer's own inputs, echoed back — a quick read while the
 * render is still in flight. The authoritative document is the proof sheet,
 * which is generated from the spec the gates produced and carries the
 * disclosures with it; the link to it is right below.
 */
export default function SpecSheet({ design, render }: { design: Design; render?: Render }) {
  const spec = design.spec;
  if (!spec) return null;

  const withCustom = (value?: string | null, detail?: string | null) =>
    value === 'Custom' && detail ? `Custom: ${detail}` : value ?? '—';

  return (
    <div className="spec-sheet">
      <div className="spec-col">
        <h4>SIGN SPECIFICATIONS</h4>
        <Row k="Channel Letter Type" v={spec.channelLetterType ?? '—'} />
        <Row k="Face Color" v={spec.faceColor ?? '—'} />
        <Row
          k="Face Color Treatment"
          v={withCustom(spec.faceColorTreatment, spec.faceColorTreatmentCustomDetail)}
        />
        <Row k="Trim Cap Color" v={spec.trimCapColor ?? '—'} />
        <Row k="Return Color" v={spec.returnColor ?? '—'} />
        <Row k="Return Depth" v={withCustom(spec.returnDepth, spec.returnDepthCustomDetail)} />
      </div>

      <div className="spec-col">
        <h4>DIMENSIONS</h4>
        <div className="spec-row">
          <div className="k">Overall</div>
          <div className="v" style={{ fontSize: 18 }}>
            {design.areaSqFt?.toFixed(2) ?? '—'} sq ft
          </div>
        </div>
        <Row k="Sign Text" v={design.logoText ?? '—'} />
        <Row
          k="Dimensions"
          v={`${design.widthInches ?? '—'}″ × ${design.heightInches ?? '—'}″`}
        />
        <Row
          k="Max Sign Area Allowed"
          v={design.maxSignAreaAllowed ? `${design.maxSignAreaAllowed} sq ft` : 'Not provided'}
        />
      </div>

      <div className="spec-col">
        <h4>INSTALLATION &amp; OPTIONS</h4>
        <Row
          k="Installation Method"
          v={withCustom(spec.installationMethod, spec.installationMethodCustomDetail)}
        />
        <Row
          k="Backer Panel"
          v={withCustom(spec.backerPanelOption, spec.backerPanelCustomDetail)}
        />
        <Row k="Mounting Surface Color" v={spec.backerPanelColor || 'Not provided'} />
        <Row k="Sign Quantity" v={String(spec.quantity ?? 1)} />
        <Row
          k="Viewpoint"
          v={design.facadeRect ? 'Matched to the photograph' : 'Wall assumed square to camera'}
        />
      </div>

      {render && (
        <div className="spec-col" style={{ gridColumn: '1 / -1' }}>
          <h4>PROOF</h4>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <Row k="Version" v={`v${render.version}`} />
            <Row k="Rules fired" v={String(render.rulesFired)} />
            <a
              className="btn btn-secondary"
              href={render.sheetUrl}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              Buka proof sheet lengkap ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="spec-row">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
