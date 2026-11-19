'use client';
// Shared UI: icons, level bars, rolling numbers, modal stack, toasts and confirm dialogs.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, animate, useReducedMotion } from 'framer-motion';
import { ICONS } from './icon-paths.js';

export function Icon({ name, size = 18, sw = 1.8, className = '' }) {
  return (
    <svg className={'ic ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />
  );
}

export const Bars = ({ n }) => (
  <span className="bars">{[0, 1, 2, 3].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>
);

// ── rolling number ──
// Each digit is a reel that spins down to its value with a motion blur (framer-motion), right-hand digits
// spinning a little longer. Re-rolls when the value changes. Screen readers get the plain value.
const CELL = 1.12; // em
function Reel({ digit, delay, duration }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const steps = 10 + digit;
    if (reduce) { el.style.transform = `translateY(-${steps * CELL}em)`; return; }
    const a = animate(el, { y: [0, `-${steps * CELL}em`] }, { duration, delay, ease: [0.16, 0.84, 0.24, 1] });
    const b = animate(el, { filter: ['blur(0px)', 'blur(2.6px)', 'blur(1.2px)', 'blur(0px)'], opacity: [0.35, 1, 1, 1] }, { duration, delay, times: [0, 0.25, 0.7, 1], ease: 'easeOut' });
    return () => { a.stop(); b.stop(); };
  }, [digit, delay, duration, reduce]);
  return (
    <span className="rd" aria-hidden="true">
      <span className="rc" ref={ref}>{Array.from({ length: 20 + 1 }, (_, i) => <i key={i}>{i === 20 ? digit : i % 10}</i>)}</span>
    </span>
  );
}
export function RollingNumber({ value, dp = 2, delay = 0, duration = 1.35, className = '', style }) {
  const text = Number.isFinite(+value) ? (+value).toFixed(dp) : '—';
  if (text === '—') return <span className={'num ' + className} style={style}>—</span>;
  let k = 0;
  return (
    <span className={'num roll ' + className} style={style} aria-label={text} key={text}>
      {[...text].map((ch, i) => (/\d/.test(ch)
        ? <Reel key={i} digit={+ch} delay={delay / 1000} duration={duration + (k++) * 0.14} />
        : <span key={i} className="rs" aria-hidden="true">{ch}</span>))}
    </span>
  );
}

// ── modal stack ──
let modals = [], mv = 0, nextId = 1;
const mListeners = new Set();
const mEmit = () => { mv++; mListeners.forEach((l) => l()); };
// render(close) → JSX. Returns close().
export function openModal(render, { cls = '', onClose } = {}) {
  const id = nextId++;
  const close = () => {
    if (!modals.some((m) => m.id === id)) return;
    modals = modals.filter((m) => m.id !== id);
    mEmit();
    onClose && onClose();
  };
  modals = [...modals, { id, render, cls, close }];
  mEmit();
  return close;
}
export const isTopModal = (id) => modals.length && modals[modals.length - 1].id === id;
export const modalCount = () => modals.length;

export function ModalRoot() {
  useSyncExternalStore((l) => { mListeners.add(l); return () => mListeners.delete(l); }, () => mv, () => 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && modals.length) modals[modals.length - 1].close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {modals.map((m) => (
        <motion.div key={m.id} className="modal-wrap in" initial={{ backgroundColor: 'rgba(17,24,39,0)' }} animate={{ backgroundColor: 'rgba(17,24,39,0.42)' }}
          exit={{ backgroundColor: 'rgba(17,24,39,0)' }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget) m.close(); }}>
          <motion.div className={'modal ' + m.cls} role="dialog" aria-modal="true" initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{ opacity: undefined, transform: undefined }}>
            <ModalCtx id={m.id}>{m.render(m.close)}</ModalCtx>
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>,
    document.body,
  );
}
const ModalCtx = ({ children }) => children;

export function confirmDialog(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((res) => {
    let done = false;
    const close = openModal((close) => (
      <>
        <h3 className="m-title">{title}</h3>
        <p className="m-body">{body}</p>
        <div className="m-actions">
          <button className="btn ghost" onClick={() => { done = true; res(false); close(); }}>Cancel</button>
          <button className={'btn ' + (danger ? 'danger' : 'dark')} onClick={() => { done = true; res(true); close(); }}>{okLabel}</button>
        </div>
      </>
    ), { cls: 'small', onClose: () => { if (!done) res(false); } });
    return close;
  });
}

// ── toast ──
let toastMsg = null, tv = 0, toastT = 0;
const tListeners = new Set();
export function toast(msg, ms = 2600) {
  toastMsg = { msg, id: Date.now() };
  tv++; tListeners.forEach((l) => l());
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastMsg = null; tv++; tListeners.forEach((l) => l()); }, ms);
}
export function ToastRoot() {
  useSyncExternalStore((l) => { tListeners.add(l); return () => tListeners.delete(l); }, () => tv, () => 0);
  return (
    <div className="toast-root" role="status" aria-live="polite">
      <AnimatePresence>{toastMsg && (
        <motion.div key={toastMsg.id} className="toast" initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>{toastMsg.msg}</motion.div>
      )}</AnimatePresence>
    </div>
  );
}

// Staggered fade-up for cards
export const fadeUp = (i = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: i * 0.07, ease: [0.2, 0.8, 0.2, 1] },
});

export function relTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 86400 && new Date(ts).getDate() === new Date().getDate()) return 'Today';
  if (d < 86400 * 2) return 'Yesterday';
  if (d < 86400 * 30) return Math.round(d / 86400) + 'd';
  if (d < 86400 * 365) return Math.round(d / (86400 * 30)) + 'mo';
  return Math.round(d / (86400 * 365)) + 'y';
}

// Mount an imperative canvas thing into a div: create(host) → { destroy }
export function useImperative(create, deps) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    let obj = null, alive = true;
    Promise.resolve(create(ref.current)).then((o) => { if (alive) obj = o; else o?.destroy?.(); });
    return () => { alive = false; obj?.destroy?.(); if (ref.current) ref.current.innerHTML = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
