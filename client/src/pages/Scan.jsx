import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatPrice, CONDITIONS } from '../api';

export default function Scan() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState([]);
  const [ocrText, setOcrText] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [prints, setPrints] = useState([]);
  const [collections, setCollections] = useState([]);
  const [addState, setAddState] = useState({
    collection_id: '',
    quantity: 1,
    foil: false,
    condition: 'NM',
  });
  const [toast, setToast] = useState('');
  const [adding, setAdding] = useState(false);
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    api.collections().then((cols) => {
      setCollections(cols);
      if (cols[0]) setAddState((s) => ({ ...s, collection_id: cols[0].id }));
    });
    return () => stopCamera();
  }, []);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  };

  const startCamera = async () => {
    setError('');
    setPreview(null);
    setMatches([]);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e) {
      setError('Camera access denied. You can upload a photo instead.');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreview(url);
        stopCamera();
        runScan(new File([blob], 'scan.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setPreview(URL.createObjectURL(file));
    setMatches([]);
    runScan(file);
    e.target.value = '';
  };

  const runScan = async (file) => {
    setScanning(true);
    setError('');
    setMatches([]);
    setOcrText('');
    setSelected(null);
    try {
      const result = await api.scan(file);
      setOcrText(result.ocr_text || '');
      setMatches(result.matches || []);
      if (!result.matches?.length) {
        setError('Could not identify the card. Try a clearer photo of the name line, or search manually.');
      } else {
        pickMatch(result.matches[0]);
      }
    } catch (e) {
      setError(e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const pickMatch = async (card) => {
    setSelected(card);
    setPrints([]);
    try {
      const p = await api.getPrints(card.scryfall_id);
      setPrints(p);
      const best =
        p.find((x) => x.scryfall_id === card.scryfall_id) ||
        p.find((x) => x.set_code === card.set_code) ||
        p[0] ||
        card;
      setSelected(best);
    } catch {
      setPrints([card]);
    }
  };

  const manualIdentify = async (e) => {
    e.preventDefault();
    if (!manualName.trim()) return;
    setScanning(true);
    setError('');
    try {
      const { card, prints: p } = await api.identify(manualName.trim());
      setMatches([{ ...card, confidence: 100, matched_text: manualName }]);
      setPrints(p);
      setSelected(card);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const addCard = async () => {
    if (!selected || !addState.collection_id) return;
    setAdding(true);
    try {
      await api.addCard(addState.collection_id, {
        scryfall_id: selected.scryfall_id,
        quantity: addState.quantity,
        foil: addState.foil,
        condition: addState.condition,
      });
      showToast(`Added ${selected.name}`);
      // keep camera ready for next
      setSelected(null);
      setMatches([]);
      setPreview(null);
      setOcrText('');
      startCamera();
    } catch (e) {
      showToast(e.message);
    } finally {
      setAdding(false);
    }
  };

  const price = selected
    ? addState.foil
      ? selected.price_usd_foil ?? selected.price_usd
      : selected.price_usd
    : null;

  return (
    <div className="scan-page">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <div className="page-header">
        <div>
          <h1>Scan card</h1>
          <p>Point at the card name — we&apos;ll match the printing & price</p>
        </div>
      </div>

      <div className="scan-viewport">
        {!preview && (
          <video ref={videoRef} playsInline muted style={{ display: cameraOn ? 'block' : 'none' }} />
        )}
        {preview && <img className="preview" src={preview} alt="Capture" />}
        {!cameraOn && !preview && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              color: 'var(--text-muted)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48 }}>◉</div>
            <p>Start the camera or upload a photo of your card</p>
          </div>
        )}
        {cameraOn && !preview && (
          <div className="scan-overlay">
            <div className="scan-frame" />
          </div>
        )}
        {scanning && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div className="spinner" />
            <p style={{ color: 'white', fontWeight: 600 }}>Identifying card…</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} hidden />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

      <div className="scan-actions">
        {!cameraOn ? (
          <button className="btn primary" type="button" onClick={startCamera}>
            Open camera
          </button>
        ) : (
          <button className="capture-btn" type="button" onClick={capture} disabled={scanning} aria-label="Capture" />
        )}
        <button className="btn secondary" type="button" onClick={() => fileRef.current?.click()}>
          Upload photo
        </button>
        {preview && (
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setPreview(null);
              setMatches([]);
              setSelected(null);
              startCamera();
            }}
          >
            Retake
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {matches.length > 0 && (
        <div>
          <h2 className="section-title">Matches {ocrText ? `· read “${ocrText.split('\n')[0].slice(0, 40)}”` : ''}</h2>
          <div className="match-list">
            {matches.map((m) => (
              <button
                key={m.scryfall_id + String(m.confidence)}
                type="button"
                className={`match-item ${selected?.scryfall_id === m.scryfall_id ? 'selected' : ''}`}
                onClick={() => pickMatch(m)}
              >
                {(m.image_small || m.image_normal) && (
                  <img src={m.image_small || m.image_normal} alt="" />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {m.set_name} · {formatPrice(m.price_usd)}
                  </div>
                </div>
                {m.confidence != null && <span className="conf">{m.confidence}%</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Type the name instead</h2>
        <form onSubmit={manualIdentify} className="toolbar-row">
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Card name…"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <button className="btn secondary" type="submit" disabled={scanning}>
            Identify
          </button>
        </form>
      </div>

      {selected && (
        <div className="panel">
          <div className="card-preview">
            {(selected.image_normal || selected.image_small) && (
              <img src={selected.image_normal || selected.image_small} alt="" style={{ width: 100, borderRadius: 8 }} />
            )}
            <div className="details">
              <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--display)' }}>{selected.name}</h3>
              <p className="price-lg" style={{ margin: 0 }}>
                {formatPrice(price)}
              </p>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {selected.set_name} #{selected.collector_number}
              </p>
            </div>
          </div>

          {prints.length > 1 && (
            <>
              <h3 className="section-title">Pick version / set</h3>
              <div className="print-grid">
                {prints.map((p) => (
                  <button
                    key={p.scryfall_id}
                    type="button"
                    className={`print-option ${selected.scryfall_id === p.scryfall_id ? 'selected' : ''}`}
                    onClick={() => setSelected(p)}
                  >
                    {p.image_small && <img src={p.image_small} alt="" />}
                    <div className="label">
                      {p.set_code?.toUpperCase()} · {formatPrice(p.price_usd)}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="field-grid" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label>Binder</label>
              <select
                className="input select"
                value={addState.collection_id}
                onChange={(e) => setAddState((s) => ({ ...s, collection_id: +e.target.value }))}
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Condition</label>
              <select
                className="input select"
                value={addState.condition}
                onChange={(e) => setAddState((s) => ({ ...s, condition: e.target.value }))}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Qty</label>
              <div className="stepper">
                <button
                  type="button"
                  onClick={() => setAddState((s) => ({ ...s, quantity: Math.max(1, s.quantity - 1) }))}
                >
                  −
                </button>
                <span>{addState.quantity}</span>
                <button type="button" onClick={() => setAddState((s) => ({ ...s, quantity: s.quantity + 1 }))}>
                  +
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Finish</label>
              <select
                className="input select"
                value={addState.foil ? '1' : '0'}
                onChange={(e) => setAddState((s) => ({ ...s, foil: e.target.value === '1' }))}
              >
                <option value="0">Non-foil</option>
                <option value="1">Foil</option>
              </select>
            </div>
          </div>

          <button className="btn primary block" type="button" onClick={addCard} disabled={adding} style={{ marginTop: 8 }}>
            {adding ? 'Adding…' : `Add to binder · ${formatPrice(price)}`}
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
