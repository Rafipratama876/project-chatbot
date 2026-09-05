import { useNavigate } from 'react-router-dom';

/**
 * "New Design" lands here first. Picking a product is the only thing this
 * page does — the two wizards behind it are otherwise unrelated: different
 * spec step, different API routes, different rule engine. Channel Letters'
 * own wizard component is unmodified, just reached one click later than it
 * used to be reached directly.
 */
export default function ProductPickerPage() {
  const navigate = useNavigate();

  return (
    <>
      <div className="page-header">
        <h1>New Design</h1>
        <p>Pilih jenis produk. Masing-masing punya alur, material dan proof sendiri.</p>
      </div>

      <div className="wall-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <button
          type="button"
          className="wall-option"
          style={{ textAlign: 'left', padding: 18, height: 'auto' }}
          onClick={() => navigate('/new/channel-letters')}
        >
          <div className="label" style={{ fontSize: 16, marginBottom: 6 }}>Channel Letters</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, padding: '0 2px 2px' }}>
            Front/back/halo lit, pill &amp; logo box, raceway/wireway. 56 rule dari Channel
            Letters KB v2.2.
          </p>
        </button>

        <button
          type="button"
          className="wall-option"
          style={{ textAlign: 'left', padding: 18, height: 'auto' }}
          onClick={() => navigate('/new/dimensional-letters')}
        >
          <div className="label" style={{ fontSize: 16, marginBottom: 6 }}>Dimensional Letters</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, padding: '0 2px 2px' }}>
            Cast metal, flat cut metal/acrylic/PVC, injection molded, formed plastic, foam, HDU.
            Jalur rule engine terpisah — tidak berbagi rule dengan Channel Letters.
          </p>
        </button>
      </div>
    </>
  );
}
