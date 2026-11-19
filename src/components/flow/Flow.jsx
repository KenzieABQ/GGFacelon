'use client';
// New-scan flow: consent → profile → front photo → side photo → AI detection → verify → review → analyse.
// Edit mode starts at the review step with the saved points.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { app } from '@/lib/app.js';
import { normalizeFile, normalizeSource } from '@/lib/engine/img.js';
import { DEFS } from '@/lib/engine/landmarks.js';
import { METRICS } from '@/lib/engine/metrics.js';
import { Stage } from '@/lib/canvas/stage.js';
import { drawLinks, drawDot, bbox } from '@/lib/canvas/draw.js';
import { editableStage } from '@/lib/canvas/editable.js';
import { asset, scanUrl } from '@/lib/routes.js';
import { Icon, openModal, toast } from '../ui.jsx';
import { askInstructions, showInstructions } from '../PhotoGuide.jsx';
import Verify from './Verify.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pack = (d) => ({ url: d.url, w: d.w, h: d.h, lm: d.lm, ai: d.ai, source: d.source, dir: d.dir });
const step = (name, arg) => ({ name, arg, key: name + (arg || '') + Date.now() });

export default function Flow({ mode = 'new', editId }) {
  const router = useRouter();
  const draft = useRef(null);
  const [st, setSt] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await app.load();
      const ed = editId && app.scan(editId);
      if (mode === 'edit') {
        if (!ed) { router.replace('/'); return; }
        draft.current = { editing: ed, front: { ...ed.front, ai: ed.front.ai || ed.front.lm }, side: { ...ed.side, ai: ed.side.ai || ed.side.lm } };
        // older scans lack points added since: place them from the reference template fitted to the others
        const { refitTemplate } = await import('@/lib/engine/detect.js');
        for (const view of ['front', 'side']) {
          const d = draft.current[view];
          if (DEFS[view].some((def) => !d.lm[def.id])) {
            const confirmed = Object.fromEntries(Object.keys(d.lm).map((k) => [k, true]));
            d.lm = { ...refitTemplate(view, d.lm, confirmed), ...d.lm };
            d.ai = { ...d.lm, ...d.ai };
          }
        }
        setSt(step('review'));
      } else {
        draft.current = { front: null, side: null };
        if (app.sample || new URLSearchParams(location.search).has('sample')) {
          app.sample = false;
          for (const view of ['front', 'side']) {
            const url = asset(`/assets/ref-${view}.jpg`);
            const im = await app.img(url);
            draft.current[view] = { url, w: im.naturalWidth, h: im.naturalHeight };
          }
          setSt(step('detect'));
        } else setSt(step(app.prefs.get('consent') ? 'gender' : 'consent'));
      }
      setReady(true);
      // warm the models up while the user reads
      import('@/lib/engine/detect.js').then((m) => { m.loadDetector().catch(() => {}); m.loadSegmenter().catch(() => {}); });
    })();
  }, [mode, editId]);

  const go = (name, arg) => { setSt(step(name, arg)); window.scrollTo(0, 0); };
  const exit = () => {
    const ed = draft.current?.editing;
    if (ed) router.push(scanUrl(ed.id));
    else router.push(app.scans[0] ? scanUrl(app.scans[0].id) : '/');
  };
  if (!ready || !st) return <div className="flow"><div className="flow-bg" /></div>;
  const d = draft.current;
  const wide = ['verify', 'review', 'detect'].includes(st.name);

  return (
    <div className={`flow ${wide ? 'wide' : ''} ${st.name === 'analyze' ? 'dark' : ''}`}>
      <div className="flow-bg" />
      <div className="flow-top">
        <button className="link-btn" onClick={exit}><Icon name="arrowL" size={16} /> Dashboard</button>
        <div className="flow-brand"><Icon name="logo" size={20} /> GGFacelon</div><span />
      </div>
      <div className="flow-body">
        <AnimatePresence mode="wait">
          <motion.div key={st.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }} className="flow-step">
            {st.name === 'consent' && <Consent onAgree={() => { app.prefs.set('consent', Date.now()); go('gender'); }} onNo={exit} />}
            {st.name === 'gender' && <Gender onNext={() => go('upload', 'front')} />}
            {st.name === 'upload' && <Upload draft={d} view={st.arg} onBack={() => (st.arg === 'front' ? go('gender') : go('upload', 'front'))} onNext={() => (st.arg === 'front' ? go('upload', 'side') : go('detect'))} />}
            {st.name === 'detect' && <Detecting draft={d} onDone={(out) => {
              for (const view of ['front', 'side']) { d[view].lm = out[view].lm; d[view].ai = { ...out[view].lm }; d[view].source = out[view].source; }
              d.side.dir = out.side.dir; d.front.skin = out.front.skin;
              go('verify', 'front');
            }} />}
            {st.name === 'verify' && <Verify draft={d} view={st.arg}
              onBack={() => (st.arg === 'front' ? go('upload', 'side') : go('verify', 'front'))}
              onDone={() => (st.arg === 'front' ? go('verify', 'side') : go('review'))}
              onSkip={() => go('analyze')} />}
            {st.name === 'review' && <Review draft={d} onBack={() => (d.editing ? exit() : go('verify', 'side'))} onAnalyze={() => go('analyze')} />}
            {st.name === 'analyze' && <Analyzing draft={d} onDone={async (look) => {
              const now = Date.now();
              const scan = d.editing
                ? { ...d.editing, front: pack(d.front), side: pack(d.side), look }
                : { id: 's' + now.toString(36) + Math.random().toString(36).slice(2, 6), created: now, gender: 'male', front: pack(d.front), side: pack(d.side), look };
              try { await app.save(scan); } catch (e) { toast('Could not save the scan: ' + e.message); }
              router.push(scanUrl(scan.id));
            }} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Consent({ onAgree, onNo }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="card onb">
      <div className="onb-rule" />
      <h1 className="serif">How we handle your face data.</h1>
      <p className="sub">Your photos and measurements are processed on this device. Nothing is uploaded.</p>
      <ul className="consent-list">
        <li><Icon name="device" /><span>Analysed in your browser</span></li>
        <li><Icon name="shield" /><span>Never uploaded, sold or shared</span></li>
        <li><Icon name="trash" /><span>Delete any scan whenever you want</span></li>
      </ul>
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span className="box"><Icon name="check" size={14} sw={2.6} /></span><span>I consent to the processing of my facial images on this device.</span></label>
      <p className="fine">The AI models (~20 MB) are downloaded once from Google’s model storage. Your photos never leave the browser.</p>
      <button className="btn dark block" disabled={!ok} onClick={onAgree}>Agree &amp; continue <Icon name="arrowR" size={16} /></button>
      <button className="link-btn center" onClick={onNo}>Not now</button>
    </div>
  );
}

function Gender({ onNext }) {
  return (
    <div className="onb narrow">
      <h1 className="serif">New scan.</h1>
      <p className="sub">Confirm your details and we’ll calibrate your scores.</p>
      <div className="choice-list">
        <button className="choice on">Male</button>
        <button className="choice" disabled>Female <span className="soon">Coming soon</span></button>
      </div>
      <button className="btn dark block" onClick={onNext}>Continue <Icon name="arrowR" size={16} /></button>
    </div>
  );
}

function Upload({ draft, view, onBack, onNext }) {
  const isF = view === 'front';
  const [cur, setCur] = useState(draft[view]);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  useEffect(() => { if (!draft[view] && !app.prefs.get('seenTips_' + view)) askInstructions(view); }, [view]);
  const set = (res) => { draft[view] = { url: res.url, w: res.w, h: res.h }; setCur(draft[view]); };
  const take = async (file) => { try { set(await normalizeFile(file)); } catch (e) { toast(e.message); } };
  return (
    <div className="onb narrow">
      <h1 className="serif">Let’s get your new score. <button className="icon-btn ghost" title="Photo instructions" onClick={() => showInstructions(view)}><Icon name="info" size={18} /></button></h1>
      <p className="sub">Step {isF ? 1 : 2} of 2 · {isF ? 'Front photo — look straight into the camera' : 'Side profile — turn 90° so only one ear shows'}</p>
      <div className={`drop ${cur ? 'has' : ''} ${over ? 'over' : ''}`} tabIndex={0} onClick={() => input.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && take(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && take(e.target.files[0])} />
        <div className="drop-empty">
          <div className="drop-ic"><Icon name="upload" size={26} sw={1.6} /></div>
          <div className="drop-t">Tap to upload or drag and drop</div>
          <div className="drop-s">JPG, PNG or WEBP · one face, well lit</div>
        </div>
        {cur && <motion.img className="drop-img" src={cur.url} alt="" initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} />}
        <button className="pill replace" type="button"><Icon name="image" size={14} /> Replace</button>
      </div>
      <button className="btn ghost block cam" onClick={() => openCamera(view, set)}><Icon name="camera" size={16} /> Use camera</button>
      <div className="row2"><button className="btn ghost" onClick={onBack}>Back</button><button className="btn dark" disabled={!cur} onClick={onNext}>Continue <Icon name="arrowR" size={16} /></button></div>
    </div>
  );
}

function CameraBody({ view, set, close }) {
  const video = useRef(null), stream = useRef(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => { stream.current = s; if (video.current) video.current.srcObject = s; })
      .catch(() => { toast('Camera permission was denied'); close(); });
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    if (!stream.current) return;
    let n = 3; setCount(n);
    const iv = setInterval(() => {
      n--;
      if (n > 0) return setCount(n);
      clearInterval(iv); setCount(0);
      const v = video.current;
      set(normalizeSource(v, v.videoWidth, v.videoHeight, false));
      close();
    }, 800);
  };
  return (
    <>
      <div className="cam-wrap">
        <video ref={video} playsInline muted autoPlay />
        <svg className="cam-guide" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">{view === 'front'
          ? <><ellipse cx="150" cy="185" rx="88" ry="118" /><line x1="150" y1="60" x2="150" y2="310" /><line x1="70" y1="168" x2="230" y2="168" /></>
          : <><path d="M175 70 C120 70 95 110 95 160 C95 210 110 250 150 290 L150 330 M175 70 C200 75 205 120 200 140 L216 182 L202 190 L206 214 L198 226 L200 250 C195 270 175 275 160 268" /><line x1="70" y1="168" x2="230" y2="168" /></>}</svg>
        <div className={'cam-count ' + (count ? 'on' : '')}>{count || ''}</div>
      </div>
      <p className="fine center">{view === 'front' ? 'Line up your eyes on the horizontal line and your nose on the vertical one.' : 'Turn 90° and keep the ear‑to‑eye line level.'}</p>
      <div className="row2"><button className="btn ghost" onClick={close}>Cancel</button><button className="btn dark" onClick={snap}><Icon name="camera" size={16} /> Capture (3s)</button></div>
    </>
  );
}
function openCamera(view, set) {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Camera not available in this browser'); return; }
  openModal((close) => <CameraBody view={view} set={set} close={close} />, { cls: 'cam-modal' });
}

// ── AI detection: scanning sweep → mesh points → landmarks ──
function Detecting({ draft, onDone }) {
  const hosts = { front: useRef(null), side: useRef(null) };
  const [status, setStatus] = useState('Loading the landmark model…');
  const [note, setNote] = useState('');
  const [done, setDone] = useState({});
  useEffect(() => {
    let alive = true;
    const stages = {}, anim = { front: { phase: 'idle', t0: 0 }, side: { phase: 'idle', t0: 0 } }, out = {};
    const paint = (ctx, st, view, a) => {
      const now = performance.now();
      ctx.fillStyle = 'rgba(8,12,14,0.28)'; ctx.fillRect(0, 0, st.w, st.h);
      if (a.phase === 'scan') {
        const y = (((now - a.t0) / 1400) % 1) * st.h;
        const g = ctx.createLinearGradient(0, y - 90, 0, y); g.addColorStop(0, 'rgba(94,232,176,0)'); g.addColorStop(1, 'rgba(94,232,176,0.28)');
        ctx.fillStyle = g; ctx.fillRect(0, y - 90, st.w, 90);
        ctx.fillStyle = 'rgba(160,255,214,0.9)'; ctx.fillRect(0, y, st.w, 1.5);
      }
      if (a.phase === 'reveal' && a.res) {
        const t = (now - a.t0) / 1000;
        if (a.mesh) {
          const n = Math.floor(Math.min(1, t / 0.8) * a.mesh.length), fade = t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.5) : 1;
          ctx.fillStyle = `rgba(160,255,214,${0.75 * fade})`;
          for (let i = 0; i < n; i++) { const p = st.toScreen(a.mesh[i]); ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6); }
        }
        const lt = Math.max(0, (t - (a.mesh ? 0.7 : 0)) / 0.7);
        if (lt > 0) {
          drawLinks(ctx, st, a.res.lm, view, { progress: Math.min(1, lt), color: 'rgba(255,255,255,0.6)' });
          const keys = Object.keys(a.res.lm), k = Math.floor(Math.min(1, lt) * keys.length);
          for (let i = 0; i < k; i++) drawDot(ctx, st.toScreen(a.res.lm[keys[i]]), { r: 2.4, ringW: 1.1 });
        }
      }
    };
    const loop = () => { if (!alive) return; for (const k in stages) stages[k].draw(); requestAnimationFrame(loop); };
    (async () => {
      const { detectUpright } = await import('@/lib/engine/detect.js');
      for (const view of ['front', 'side']) {
        const img = await app.img(draft[view].url);
        if (!alive) return;
        const a = anim[view];
        const st = new Stage(hosts[view].current, img, { bg: '#0d1114', onDraw: (ctx, s) => paint(ctx, s, view, a) });
        st.autoFit = true; st.fitPad = 0; st.view = st.fitView(0, true);
        st.onResize = () => { st.view = st.fitView(0, true); };
        stages[view] = st;
      }
      loop();
      for (const view of ['front', 'side']) {
        if (!alive) return;
        const a = anim[view];
        a.phase = 'scan'; a.t0 = performance.now();
        setStatus(view === 'front' ? 'Detecting facial landmarks…' : 'Tracing your profile…');
        const img = await app.img(draft[view].url);
        const t0 = performance.now();
        const res = await detectUpright(view, img, view === 'side' && out.front ? { front: out.front.lm, skin: out.front.skin } : {});
        if (!alive) return;
        // a sideways or tilted photo comes back turned upright / levelled: keep that version
        if (res.image) {
          draft[view] = { ...draft[view], url: res.image.url, w: res.image.w, h: res.image.h };
          stages[view].img = await app.img(res.image.url);
          stages[view].view = stages[view].fitView(0, true);
          setNote(`The ${view === 'front' ? 'front' : 'profile'} photo was ${res.turned ? `turned ${res.turned}°` : `levelled by ${Math.abs(res.levelled).toFixed(1)}°`} so the ${view === 'front' ? 'eyes are level' : 'head sits level (Frankfort plane)'}.`);
        }
        await sleep(Math.max(0, 900 - (performance.now() - t0)));
        out[view] = res; a.res = res;
        a.mesh = res.mesh ? [...res.mesh].sort((p, q) => p.y - q.y) : null;
        a.phase = 'reveal'; a.t0 = performance.now();
        if (res.source === 'template') setNote(res.error === 'model' ? 'The AI model could not load (offline?). Points start from a template — you’ll place them in the next step.' : `No face found in the ${view === 'front' ? 'front' : 'profile'} photo. Points start from a template — place a couple and the rest will follow.`);
        await sleep(1500);
        setDone((x) => ({ ...x, [view]: true }));
      }
      if (!alive) return;
      setStatus('First pass complete. Verify each point next.');
      await sleep(650);
      if (alive) onDone(out);
    })().catch((e) => { console.error(e); setStatus('Something went wrong: ' + e.message); });
    return () => { alive = false; for (const k in stages) stages[k].destroy(); };
  }, []);
  return (
    <div className="detect">
      <h1 className="serif center">Mapping your face.</h1>
      <motion.p className="sub center" key={status} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{status}</motion.p>
      <div className="detect-grid">
        {['front', 'side'].map((v) => (
          <div key={v} className={'detect-card ' + (done[v] ? 'done' : '')}><div className="stage-host" ref={hosts[v]} />
            <div className="detect-tag"><span className="dot" />{v === 'front' ? 'Front' : 'Profile'} · {DEFS[v].length} points</div></div>
        ))}
      </div>
      {note && <p className="fine center"><Icon name="info" size={14} /> {note}</p>}
    </div>
  );
}

// ── Review all points; hover for hints, drag to fine-tune ──
function Review({ draft, onBack, onAnalyze }) {
  const hosts = { front: useRef(null), side: useRef(null) };
  const eds = useRef({});
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const view of ['front', 'side']) {
        const img = await app.img(draft[view].url);
        const refImg = await app.img(asset(view === 'front' ? '/assets/ref-front.jpg' : '/assets/ref-side.jpg')).catch(() => null);
        if (!alive) return;
        eds.current[view] = editableStage(hosts[view].current, img, () => draft[view].lm, (lm) => { draft[view].lm = lm; }, view, { refImg });
      }
    })();
    return () => { alive = false; Object.values(eds.current).forEach((e) => e.destroy()); eds.current = {}; };
  }, []);
  const n = Object.keys(draft.front.lm).length + Object.keys(draft.side.lm).length;
  return (
    <div className="review">
      <div className="review-head">
        <h1 className="serif">Review your landmarks <span className="chip">{n} points</span></h1>
        <p className="sub">Hover a point to see where it belongs; drag it to fine‑tune. Scroll to zoom, double‑click to reset the view.</p>
      </div>
      <div className="review-grid">
        {['front', 'side'].map((v) => (
          <div key={v} className="review-card"><div className="stage-host" ref={hosts[v]} /><div className="rc-tag">{v === 'front' ? 'Front' : 'Profile'}</div>
            <button className="pill rc-reset" onClick={() => { draft[v].lm = { ...draft[v].ai }; eds.current[v]?.st.render(); }}><Icon name="undo" size={13} /> Reset to AI</button></div>
        ))}
      </div>
      <div className="review-foot">
        <button className="btn ghost" onClick={onBack}>{draft.editing ? 'Cancel' : 'Back'}</button>
        <button className="btn dark grow" onClick={onAnalyze}>{draft.editing ? 'Save & re‑analyse' : 'Analyze'} <Icon name="arrowR" size={16} /></button>
      </div>
    </div>
  );
}

// ── Analysing: landmark network draws in while measurement names tick by; photo measurements run meanwhile ──
function Analyzing({ draft, onDone }) {
  const host = useRef(null);
  const [label, setLabel] = useState(' ');
  useEffect(() => {
    let alive = true, st = null;
    const t0 = performance.now(), DUR = 3200;
    const lookP = Promise.all([app.img(draft.front.url), app.img(draft.side.url)])
      .then(async ([fi, si]) => (await import('@/lib/engine/appearance.js')).measureAppearance(fi, draft.front.lm, si, draft.side.lm))
      .catch((e) => { console.warn('appearance failed', e); return null; });
    (async () => {
      const img = await app.img(draft.front.url);
      if (!alive) return;
      const lm = draft.front.lm;
      st = new Stage(host.current, img, {
        bg: '#06090b',
        onDraw: (ctx, s) => {
          const t = Math.min(1, (performance.now() - t0) / DUR);
          ctx.fillStyle = 'rgba(4,8,10,0.55)'; ctx.fillRect(0, 0, s.w, s.h);
          drawLinks(ctx, s, lm, 'front', { progress: Math.min(1, t * 1.6), color: 'rgba(94,232,176,0.8)', width: 1.2 });
          const keys = Object.keys(lm), k = Math.floor(Math.min(1, t * 1.3) * keys.length);
          for (let i = 0; i < k; i++) drawDot(ctx, s.toScreen(lm[keys[i]]), { r: 2, ringW: 1, fill: '#5ee8b0' });
          const y = (((performance.now() - t0) / 1600) % 1) * s.h;
          const g = ctx.createLinearGradient(0, y - 60, 0, y); g.addColorStop(0, 'rgba(94,232,176,0)'); g.addColorStop(1, 'rgba(94,232,176,0.18)');
          ctx.fillStyle = g; ctx.fillRect(0, y - 60, s.w, 60);
        },
      });
      const b = bbox(lm, 0.18);
      const fit = () => st.setView(st.rectView(b.x0, b.y0, b.x1, b.y1, 0));
      st.onResize = fit; fit();
      const names = METRICS.map((m) => m.name);
      const loop = async () => {
        if (!alive) return;
        st.draw();
        const t = (performance.now() - t0) / DUR;
        setLabel('Measuring ' + names[Math.min(names.length - 1, Math.floor(t * names.length))]);
        if (t < 1) requestAnimationFrame(loop);
        else { setLabel('Building your report'); const look = await lookP; await sleep(350); if (alive) onDone(look); }
      };
      loop();
    })();
    return () => { alive = false; st?.destroy(); };
  }, []);
  return (
    <div className="analyzing">
      <div className="an-stage"><div className="stage-host" ref={host} /><div className="an-ring" /></div>
      <div className="an-text"><div className="spinner" /><div className="an-t">Analyzing your face…</div><div className="an-s">{label}</div></div>
    </div>
  );
}
