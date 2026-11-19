'use client';
// Developer tool: run the FaceIQ benchmark in the browser (needs tools/testdata/, linked as public/testdata,
// and `python3 tools/sink.py` for Upload). See docs/scoring.md.
import { useState } from 'react';

export default function Bench() {
  const [log, setLog] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (opts) => {
    setBusy(true); setLog('Running…');
    const b = await import('@/lib/bench.js');
    const iv = setInterval(() => setLog(`Running… ${window.__bench?.length || 0} faces`), 2000);
    try { const r = await b.run({ n: 999, verbose: false, ...opts }); setRows(r); setLog(JSON.stringify(b.report(r), null, 1).slice(0, 4000)); }
    catch (e) { setLog('Error: ' + e.message); }
    clearInterval(iv); setBusy(false);
  };
  const upload = async () => { const b = await import('@/lib/bench.js'); setLog('Upload: ' + (await b.upload(rows))); };
  return (
    <div style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 900 }}>
      <h2>FaceIQ benchmark</h2>
      <p className="sub">Runs detection and scoring on the local FaceIQ benchmark and compares with FaceIQ’s landmarks and scores.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn dark" disabled={busy} onClick={() => run({})}>Run all</button>
        <button className="btn ghost" disabled={busy} onClick={() => run({ n: 10 })}>Run 10</button>
        <button className="btn ghost" disabled={!rows || busy} onClick={upload}>Upload → bench-raw.json</button>
      </div>
      <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{log}</pre>
    </div>
  );
}
