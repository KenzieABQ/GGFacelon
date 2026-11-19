// DOM helpers, icons, modal, toast, count-up.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const P = {
  logo: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  chevU: '<path d="M6 15l6-6 6 6"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  compare: '<path d="M7 4v12M7 4L4 7M7 4l3 3M17 20V8M17 20l-3-3M17 20l3-3"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9 4.5v15M15 10l-2 2 2 2"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  lockOpen: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  device: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M11 18h2"/>',
  eraser: '<path d="M4 20h16M7 16l-3-3 9-9 7 7-6 6"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  wand: '<path d="M4 20L16 8M14 4v2M18 8h2M18 4l-1.5 1.5M10 4l.5 1.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
  flip: '<path d="M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
export const icon = (name, size = 18, sw = 1.8) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// Pillar marks (small bar glyph like a level meter)
export const bars = (n) =>
  `<span class="bars">${[0, 1, 2, 3].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

// ── modal ──
export function modal(html, { onClose, cls = '' } = {}) {
  const root = document.getElementById('modal-root');
  const wrap = el(`<div class="modal-wrap"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`);
  const close = () => {
    wrap.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 180);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); }; // only the top modal
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  return { el: wrap.firstElementChild, close };
}

export function confirmDialog(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((res) => {
    let done = false;
    const m = modal(`
      <h3 class="m-title">${esc(title)}</h3>
      <p class="m-body">${esc(body)}</p>
      <div class="m-actions">
        <button class="btn ghost" data-a="no">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'dark'}" data-a="ok">${esc(okLabel)}</button>
      </div>`, { cls: 'small', onClose: () => { if (!done) res(false); } });
    m.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      done = true;
      res(a === 'ok');
      m.close();
    });
  });
}

// ── toast ──
let toastT = 0;
export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

// ── rolling numbers ──
// Each digit is a little reel that spins down to its value with a motion blur, right-hand digits spinning a
// touch longer (Web Animations API — no library needed). Screen readers get the plain value.
export function countUp(node, to, { dp = 2, ms = 1100, delay = 0 } = {}) {
  rollNumber(node, to, { dp, ms: ms + 250, delay });
}
export function rollNumber(node, to, { dp = 2, ms = 1350, delay = 0 } = {}) {
  const text = Number.isFinite(+to) ? (+to).toFixed(dp) : '—';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !node.animate || text === '—') { node.textContent = text; return; }
  node.classList.add('roll');
  node.setAttribute('aria-label', text);
  const digits = '0123456789';
  node.innerHTML = [...text].map((ch) => (/\d/.test(ch)
    ? `<span class="rd" aria-hidden="true"><span class="rc">${(digits + digits).split('').map((d) => `<i>${d}</i>`).join('')}<i>${ch}</i></span></span>`
    : `<span class="rs" aria-hidden="true">${ch}</span>`)).join('');
  let k = 0;
  node.querySelectorAll('.rc').forEach((col) => {
    const steps = col.children.length - 1; // land on the last cell (the target digit)
    const dur = ms + k * 140;
    col.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${steps * 1.12}em)` }],
      { duration: dur, delay, easing: 'cubic-bezier(.16,.84,.24,1)', fill: 'both' });
    col.animate([{ filter: 'blur(0px)', opacity: 0.35 }, { filter: 'blur(2.4px)', opacity: 1, offset: 0.25 }, { filter: 'blur(1.2px)', offset: 0.7 }, { filter: 'blur(0px)', opacity: 1 }],
      { duration: dur, delay, easing: 'ease-out', fill: 'both' });
    k++;
  });
}

export function relTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 86400 && new Date(ts).getDate() === new Date().getDate()) return 'Today';
  if (d < 86400 * 2) return 'Yesterday';
  if (d < 86400 * 30) return Math.round(d / 86400) + 'd';
  if (d < 86400 * 365) return Math.round(d / (86400 * 30)) + 'mo';
  return Math.round(d / (86400 * 365)) + 'y';
}
