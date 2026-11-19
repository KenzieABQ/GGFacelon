'use client';
// Plan (improvement areas), Simulate (drag landmarks, see scores move) and Methodology.
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { app } from '@/lib/app.js';
import { editableStage } from '@/lib/canvas/editable.js';
import { analyze, METRICS, METRIC_BY_ID, PILLARS, scoreColor, ratioColor, fmt, fmtRange } from '@/lib/engine/metrics.js';
import { FRONT, SIDE } from '@/lib/engine/landmarks.js';
import { AREAS } from '@/lib/plan-areas.js';
import { methodologyHTML } from '@/lib/methodology-text.js';
import { Icon, RollingNumber, fadeUp } from './ui.jsx';

// ── Plan ──
export function Plan({ res }) {
  const areas = AREAS.map((a) => {
    const ms = a.metrics.map((id) => ({ m: METRIC_BY_ID[id], ...res.values[id] })).filter((x) => Number.isFinite(x.v));
    const avg = ms.reduce((s, x) => s + x.s, 0) / (ms.length || 1);
    return { ...a, ms, avg, weak: ms.filter((x) => x.s < 7).sort((p, q) => p.s - q.s) };
  }).filter((a) => a.ms.length).sort((a, b) => a.avg - b.avg);
  const focus = areas.filter((a) => a.weak.length), strong = areas.filter((a) => !a.weak.length);
  return (
    <div className="plan">
      <motion.div className="card plan-head" {...fadeUp(0)}>
        <div><h2>Your improvement plan</h2><p className="sub">Focus areas ranked by how far they sit from the ideal ranges. Lifestyle steps first; professional options are listed for information only.</p></div>
        <div className="plan-stat"><b>{focus.length}</b><span>focus areas</span></div>
      </motion.div>
      {focus.map((a, i) => (
        <motion.section className="card plan-card" key={a.id} {...fadeUp(i + 1)}>
          <div className="pl-top"><span className="pl-rank">{i + 1}</span><h3>{a.name}</h3><b className="pl-score" style={{ color: ratioColor(a.avg) }}>{a.avg.toFixed(2)}</b></div>
          <div className="pl-weak">{a.weak.slice(0, 5).map((x) => <span className="chip" key={x.m.id} title={`Ideal ${fmtRange(x.m, x)}`}>{x.m.name} · <b style={{ color: ratioColor(x.s) }}>{fmt(x.m, x.v)}</b></span>)}</div>
          <div className="pl-cols">
            <div><div className="cap"><Icon name="sparkle" size={13} /> Lifestyle &amp; grooming</div><ul>{a.soft.map((t) => <li key={t}>{t}</li>)}</ul></div>
            <div><div className="cap"><Icon name="info" size={13} /> Professional options</div><ul className="muted">{a.hard.map((t) => <li key={t}>{t}</li>)}</ul></div>
          </div>
        </motion.section>
      ))}
      {strong.length > 0 && <section className="card"><h3>Already strong</h3><div className="pl-weak">{strong.map((a) => <span className="chip" key={a.id}>{a.name} · <b style={{ color: ratioColor(a.avg) }}>{a.avg.toFixed(2)}</b></span>)}</div></section>}
      <p className="fine center">Not medical advice. Bone structure can’t be changed by exercises; talk to a qualified professional before any procedure.</p>
    </div>
  );
}

// ── Simulate ──
const Delta = ({ x }) => (Math.abs(x) < 0.005 ? null : <span className={`delta ${x > 0 ? 'up' : 'down'}`}>{x > 0 ? '+' : ''}{x.toFixed(2)}</span>);
export function Simulate({ scan, res }) {
  const sim = useRef({ front: { ...scan.front.lm }, side: { ...scan.side.lm } });
  const meta = { frontSize: { w: scan.front.w, h: scan.front.h }, sideSize: { w: scan.side.w, h: scan.side.h }, appearance: scan.look || null };
  const [r, setR] = useState(res);
  const fRef = useRef(null), sRef = useRef(null), eds = useRef([]), pending = useRef(0);
  const recompute = () => { if (pending.current) return; pending.current = requestAnimationFrame(() => { pending.current = 0; setR(analyze(sim.current.front, sim.current.side, meta)); }); };
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const [view, host] of [['front', fRef.current], ['side', sRef.current]]) {
        const img = await app.img(scan[view].url);
        if (!alive) return;
        eds.current.push(editableStage(host, img, () => sim.current[view], (lm) => { sim.current[view] = lm; }, view, { onChange: recompute }));
      }
    })();
    return () => { alive = false; eds.current.forEach((e) => e.destroy()); eds.current = []; };
  }, [scan.id]);
  const reset = () => { sim.current = { front: { ...scan.front.lm }, side: { ...scan.side.lm } }; eds.current.forEach((e) => e.st.render()); setR(res); };
  const ch = METRICS.map((m) => ({ m, a: res.values[m.id], b: r.values[m.id], d: r.values[m.id].s - res.values[m.id].s }))
    .filter((x) => Math.abs(x.d) > 0.01 || Math.abs(x.b.v - x.a.v) > 1e-6).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 12);
  return (
    <div className="simulate">
      <motion.div className="card sim-head" {...fadeUp(0)}><div><h2>Simulate</h2><p className="sub">Drag any landmark to see how a change would move your scores. Your saved scan isn’t modified.</p></div>
        <button className="btn ghost" onClick={reset}><Icon name="undo" size={15} /> Reset</button></motion.div>
      <div className="sim-grid">
        <div className="sim-stages">
          <div className="review-card"><div className="stage-host" ref={fRef} /><div className="rc-tag">Front</div></div>
          <div className="review-card"><div className="stage-host" ref={sRef} /><div className="rc-tag">Profile</div></div>
        </div>
        <div className="card sim-panel">
          <div className="cap">Overall</div>
          <div className="sim-ov"><span style={{ color: scoreColor(r.overall) }}>{r.overall.toFixed(2)}</span><Delta x={r.overall - res.overall} /></div>
          <div>{PILLARS.map((p) => <div className="sim-p" key={p.id}><span>{p.name}</span><b style={{ color: scoreColor(r.pillars[p.id].score) }}>{r.pillars[p.id].score.toFixed(2)}</b><Delta x={r.pillars[p.id].score - res.pillars[p.id].score} /></div>)}</div>
          <div className="cap" style={{ marginTop: 18 }}>Biggest changes</div>
          <div className="sim-changes">
            {!ch.length && <p className="fine">Move a point to see changes.</p>}
            <AnimatePresence initial={false}>{ch.map((x) => (
              <motion.div className="sim-c" key={x.m.id} layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div><b>{x.m.name}</b><span>{fmt(x.m, x.a.v)} → {fmt(x.m, x.b.v)}</span></div>{Math.abs(x.d) < 0.005 ? <span className="delta">0.00</span> : <Delta x={x.d} />}
              </motion.div>
            ))}</AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Methodology ──
export function Methodology() {
  const mt = (view) => METRICS.filter((m) => m.view === view).map((m) => (
    <tr key={m.id}><td><b>{m.name}</b>{m.look ? <> <span className="chip tiny ghost">from photo</span></> : m.extra ? <> <span className="chip tiny ghost">extra</span></> : null}<div className="muted">{m.desc}</div></td>
      <td className="mono">{m.how}</td><td className="nowrap">{fmtRange(m)}</td><td className="nowrap">{fmt(m, m.mean)}</td><td>{m.w}</td></tr>
  ));
  const lt = (defs) => defs.map((d, i) => <tr key={d.id}><td className="muted">{i + 1}</td><td><b>{d.name}</b></td><td className="muted">{d.anat}</td><td>{d.how}</td></tr>);
  const head = <thead><tr><th>Measurement</th><th>Formula</th><th>Ideal (Caucasian set)</th><th>Typical man</th><th>Weight</th></tr></thead>;
  return (
    <div className="method">
      <motion.section className="card" {...fadeUp(0)}><h2>Methodology</h2><div dangerouslySetInnerHTML={{ __html: methodologyHTML() }} /></motion.section>
      <motion.section className="card" {...fadeUp(1)}><h2>Front measurements</h2><div className="tbl-wrap"><table className="tbl">{head}<tbody>{mt('front')}</tbody></table></div></motion.section>
      <motion.section className="card" {...fadeUp(2)}><h2>Side measurements</h2><div className="tbl-wrap"><table className="tbl">{head}<tbody>{mt('side')}</tbody></table></div></motion.section>
      <motion.section className="card" {...fadeUp(3)}><h2>Landmarks</h2>
        <h3>Front ({FRONT.length})</h3><div className="tbl-wrap"><table className="tbl"><tbody>{lt(FRONT)}</tbody></table></div>
        <h3>Profile ({SIDE.length})</h3><div className="tbl-wrap"><table className="tbl"><tbody>{lt(SIDE)}</tbody></table></div></motion.section>
    </div>
  );
}
