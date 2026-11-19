'use client';
// Overview: four pillar cards, overall score with the population curve, front / side profile scores,
// photo measurements and the pose check.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { app } from '@/lib/app.js';
import { PILLARS, METRICS, METRIC_BY_ID, rating, scoreColor, ratioColor, ratioLabel, fmt, fmtRange, POP, percentile, pctText } from '@/lib/engine/metrics.js';
import { Stage } from '@/lib/canvas/stage.js';
import { drawLinks, drawPoints, bbox } from '@/lib/canvas/draw.js';
import { Icon, Bars, RollingNumber, fadeUp } from './ui.jsx';
import { scanUrl } from '@/lib/routes.js';

export const PILLAR_ART = {
  harmony: <svg viewBox="0 0 120 80" className="art"><path d="M10 70 A60 60 0 0 1 70 10 A37 37 0 0 1 107 47 A23 23 0 0 1 84 70 A14 14 0 0 1 70 56 A9 9 0 0 1 79 47" /><path d="M10 70H110M70 10V70M70 47H110" className="thin" /></svg>,
  angularity: <svg viewBox="0 0 120 80" className="art"><path d="M4 76 L38 22 L52 40 L72 8 L116 76 Z" /><path d="M38 22 L46 44 L52 40 M72 8 L66 36 L80 50" className="thin" /></svg>,
  dimorphism: <svg viewBox="0 0 120 80" className="art"><path d="M30 4 C90 24 30 56 90 76 M90 4 C30 24 90 56 30 76" /><path d="M42 12H78M36 26H84M44 40H76M36 54H84M42 68H78" className="thin" /></svg>,
  features: <svg viewBox="0 0 120 80" className="art"><path d="M8 40 C30 14 90 14 112 40 C90 66 30 66 8 40 Z" /><circle cx="60" cy="40" r="15" /><circle cx="60" cy="40" r="6" className="fill" /><path d="M20 22 C40 6 80 6 100 22" className="thin" /></svg>,
};

// Photo with landmarks (static, fitted to the face)
export function FacePhoto({ scan, view, pad = 0.2, links = 0.45, r = 2, dim = 0.18 }) {
  const host = useRef(null);
  useEffect(() => {
    let st = null, alive = true;
    app.img(scan[view].url).then((img) => {
      if (!alive || !host.current) return;
      const lm = scan[view].lm;
      st = new Stage(host.current, img, {
        bg: '#0f1316',
        onDraw: (ctx, s) => {
          if (dim) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, s.w, s.h); }
          drawLinks(ctx, s, lm, view, { color: `rgba(255,255,255,${links})` });
          drawPoints(ctx, s, lm, { r });
        },
      });
      const fit = () => { const b = bbox(lm, pad); st.setView(st.rectView(b.x0, b.y0, b.x1, b.y1, 0)); };
      st.onResize = fit; fit();
    });
    return () => { alive = false; st?.destroy(); };
  }, [scan.id, scan.updated, view, pad, links, r, dim]);
  return <div className="stage-host" ref={host} />;
}

export function BellCurve({ score, pct }) {
  const W = 520, H = 220, pad = 24, mu = POP.mean, sd = POP.sd;
  const X = (s) => pad + (s / 10) * (W - pad * 2);
  const Y = (s) => H - 30 - Math.exp(-0.5 * ((s - mu) / sd) ** 2) * (H - 60);
  let d = '';
  for (let s = 0; s <= 10.001; s += 0.1) d += `${s === 0 ? 'M' : 'L'}${X(s).toFixed(1)},${Y(s).toFixed(1)}`;
  let area = `M${X(0)},${H - 30}`;
  for (let s = 0; s <= score + 0.001; s += 0.05) area += `L${X(s).toFixed(1)},${Y(s).toFixed(1)}`;
  area += `L${X(score)},${H - 30}Z`;
  const top = 100 - pct;
  return (
    <svg className="bell go" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="bellg" x1="0" x2="1"><stop offset="0" stopColor="#e86a5e" stopOpacity=".22" /><stop offset=".5" stopColor="#e8b34a" stopOpacity=".22" /><stop offset="1" stopColor="#36a675" stopOpacity=".3" /></linearGradient></defs>
      <line x1={pad} x2={W - pad} y1={H - 30} y2={H - 30} className="axis" />
      <motion.path d={area} fill="url(#bellg)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }} />
      <motion.path d={d} className="curve" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }} />
      <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }}>
        <line x1={X(score)} x2={X(score)} y1={Y(score) - 18} y2={H - 30} className="mk-line" />
        <circle cx={X(score)} cy={Y(score)} r="6" className="mk-dot" />
        <g transform={`translate(${Math.min(W - 70, Math.max(70, X(score)))},${Math.max(18, Y(score) - 34)})`}><rect x="-58" y="-15" width="116" height="28" rx="14" className="mk-rect" /><text textAnchor="middle" y="4" className="mk-text">You · top {top < 1 ? Math.max(0.1, top).toFixed(1) : top.toFixed(0)}%</text></g>
      </motion.g>
      {[0, 2, 4, 6, 8, 10].map((t) => <text key={t} x={X(t)} y={H - 8} textAnchor="middle">{t}</text>)}
    </svg>
  );
}

function ViewCard({ scan, res, view, i }) {
  const V = res.views?.[view];
  if (!V || !Number.isFinite(V.score)) return null;
  const rows = [['harmony', 'Harmony'], ['angularity', 'Angularity'], ['dimorphism', 'Dimorphism'], ['features', 'Features']].filter(([k]) => Number.isFinite(V[k]));
  const items = METRICS.filter((m) => m.view === view && (m.hm || m.look) && Number.isFinite(res.values[m.id]?.v)).map((m) => ({ m, s: res.values[m.id].s, w: m.w }));
  const worst = items.filter((x) => x.s < 8).sort((a, b) => (10 - b.s) * b.w - (10 - a.s) * a.w).slice(0, 3);
  const best = items.filter((x) => x.s >= 9).sort((a, b) => b.w - a.w).slice(0, 3);
  const li = (x) => <li key={x.m.id}><span>{x.m.name}</span><b style={{ color: ratioColor(x.s) }}>{fmt(x.m, res.values[x.m.id].v)}</b></li>;
  return (
    <motion.div className="card view-card" {...fadeUp(4 + i)}>
      <div className="vc-photo"><FacePhoto scan={scan} view={view} pad={0.14} links={0.35} r={1.6} dim={0} /></div>
      <div className="vc-body">
        <div className="vc-head"><span className="cap">{view === 'front' ? 'Front profile' : 'Side profile'}</span><span className="muted">{view === 'front' ? 'front photo only' : 'side photo only'}</span></div>
        <div className="vc-score"><RollingNumber value={V.score} delay={300 + i * 120} style={{ color: scoreColor(V.score) }} /><span className="den">/10</span></div>
        <div className="vc-rate">{rating(V.score)} · higher than {pctText(percentile(V.score))}% of men</div>
        <div className="vc-rows">{rows.map(([k, n]) => (
          <div className="vc-row" key={k}><span>{n}</span><div className="meter"><motion.i initial={{ width: 0 }} animate={{ width: `${V[k] * 10}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.1 }} style={{ background: scoreColor(V[k]) }} /></div><b style={{ color: scoreColor(V[k]) }}>{V[k].toFixed(1)}</b></div>
        ))}</div>
        <div className="vc-lists">
          {best.length > 0 && <div><div className="cap good-t">Strongest</div><ul>{best.map(li)}</ul></div>}
          {worst.length > 0 && <div><div className="cap bad-t">Holding it back</div><ul>{worst.map(li)}</ul></div>}
        </div>
      </div>
    </motion.div>
  );
}

function LookCard({ scan, res }) {
  const ms = METRICS.filter((m) => m.look);
  const any = ms.some((m) => Number.isFinite(res.values[m.id]?.v));
  return (
    <motion.section className="card looks" {...fadeUp(6)}>
      <div className="lk-head"><h3><Icon name="eye" size={17} /> From the photo</h3><span className="muted">Read from the pixels around your landmarks, not from angles. They feed Features and Dimorphism.</span></div>
      {!any ? <p className="fine">{scan.look ? 'These couldn’t be read from this photo (face too small, or brows and eyes hidden).' : 'Reading brows, eye openness, lips and hairline from your photo…'}</p> : (
        <div className="lk-list">{ms.map((m) => {
          const r = res.values[m.id], ok = Number.isFinite(r.v);
          return (
            <div className="lk-row" key={m.id} title={m.desc}>
              <div className="lk-name">{m.name}<span>{m.desc.split('. ')[0]}.</span></div>
              <div className="lk-val">{ok ? <><b>{fmt(m, r.v)}</b><span className="muted">ideal {fmtRange(m, r)}</span></> : <span className="muted">not visible</span>}</div>
              <div className="lk-score">{ok && <><i style={{ background: ratioColor(r.s) }} />{ratioLabel(r.s)}</>}</div>
            </div>
          );
        })}</div>
      )}
    </motion.section>
  );
}

export default function Overview({ scan, res }) {
  const P = res.pillars, ov = res.overall;
  const [pid, setPid] = useState('harmony');
  const p = PILLARS.find((x) => x.id === pid);
  const sc = P[pid].score;
  const list = (pid === 'harmony'
    ? P.harmony.items.filter((id) => Number.isFinite(res.values[id].v)).map((id) => ({ name: METRIC_BY_ID[id].name, score: res.values[id].s, val: fmt(METRIC_BY_ID[id], res.values[id].v) }))
    : P[pid].items.map((a) => ({ name: a.name, score: a.score, val: '' }))).filter((r) => Number.isFinite(r.score));
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const row = (r) => <div className="mini-row" key={r.name}><span>{r.name}</span>{r.val && <span className="chip tiny">{r.val}</span>}<b style={{ color: ratioColor(r.score) }}>{r.score.toFixed(2)}</b></div>;

  return (
    <div className="overview">
      <div className="pillar-row">{PILLARS.map((pl, i) => (
        <motion.div key={pl.id} {...fadeUp(i)}>
          <Link className="pillar-card" href={scanUrl(scan.id, 'analysis', pl.id)}>
            <div className="pc-top"><Bars n={i + 1} /><span className="pc-name">{pl.name}</span><Icon name="arrowR" size={17} /></div>
            <div className="pc-score"><RollingNumber value={P[pl.id].score} delay={150 + i * 80} style={{ color: scoreColor(P[pl.id].score) }} /><span className="den">/10</span></div>
            <div className="pc-rate">{rating(P[pl.id].score)} {pl.name}</div>
            <div className="pc-art">{PILLAR_ART[pl.id]}</div>
          </Link>
        </motion.div>
      ))}</div>
      <div className="connectors">{PILLARS.map((x) => <i key={x.id} />)}</div>
      <motion.section className="card overall" {...fadeUp(4)}>
        <div className="ov-head"><Bars n={4} /><h2>Overall Score</h2><span className="muted">4 of 4 pillars</span></div>
        <div className="ov-body">
          <div className="ov-left">
            <div className="ov-score"><RollingNumber value={ov} delay={350} duration={1.6} className="big" style={{ color: scoreColor(ov) }} /><span className="den">/10</span></div>
            <div className="ov-rate">{rating(ov)}</div>
            <p className="ov-pct">Higher than <b>{pctText(res.percentile)}%</b> of men</p>
            <div className="ov-weights">{PILLARS.map((pl) => <div key={pl.id}><span>{pl.name}</span><b style={{ color: scoreColor(P[pl.id].score) }}>{P[pl.id].score.toFixed(2)}</b></div>)}</div>
          </div>
          <div className="ov-right"><BellCurve score={ov} pct={res.percentile} /></div>
        </div>
        <div className="ov-tabs seg dark">{PILLARS.map((pl) => (
          <button key={pl.id} className={pl.id === pid ? 'on' : ''} onClick={() => setPid(pl.id)}>{pl.name}</button>
        ))}</div>
        <motion.div className="ov-pillar" key={pid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="ovp-bar"><span className="cap">{p.name}</span><div className="meter"><motion.i initial={{ width: 0 }} animate={{ width: `${sc * 10}%` }} transition={{ duration: 0.8 }} style={{ background: scoreColor(sc) }} /></div><b style={{ color: scoreColor(sc) }}>{sc.toFixed(2)}</b><span className="den">/10</span></div>
          <div className="ovp-grid">
            <div className="ovp-photo"><FacePhoto scan={scan} view="front" /></div>
            <div className="ovp-photo"><FacePhoto scan={scan} view="side" /></div>
            <div className="ovp-lists">
              <div><div className="cap good-t">Strengths</div>{sorted.slice(0, 3).map(row)}</div>
              <div><div className="cap bad-t">Weakest</div>{sorted.slice(-3).reverse().map(row)}</div>
              <Link className="btn ghost block" href={scanUrl(scan.id, 'analysis', pid)}>See all {list.length} {pid === 'harmony' ? 'ratios' : 'assessments'} <Icon name="arrowR" size={15} /></Link>
            </div>
          </div>
        </motion.div>
      </motion.section>
      <section className="views-row">{['front', 'side'].map((view, i) => <ViewCard key={view} scan={scan} res={res} view={view} i={i} />)}</section>
      <LookCard scan={scan} res={res} />
      <motion.section className="card quality" {...fadeUp(7)}>
        <h3><Icon name="camera" size={17} /> Photo &amp; pose check</h3>
        <ul>{res.quality.map((q, i) => <li key={i} className={q.level}><span className="qdot" /><span className="qv">{q.view === 'front' ? 'Front' : 'Profile'}</span>{q.text}</li>)}</ul>
        <p className="fine">All measurements are ratios or angles, so they don’t depend on photo size or distance. Pose problems (head turned, lens too close) still distort them — retake if flagged.</p>
      </motion.section>
    </div>
  );
}
