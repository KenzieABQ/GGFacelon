// New-scan flow: consent → profile → front photo → side photo → AI detection → verify → review → analyse.
import { $, el, esc, icon, modal, toast } from './dom.js';
import { normalizeFile, normalizeSource, loadImage } from '../img.js';
import { detect, loadDetector } from '../detect.js';
import { mountVerify } from './verify.js';
import { mountReview } from './review.js';
import { mountAnalyzing } from './analyzing.js';
import { mountDetecting } from './detecting.js';
import { DEFS } from '../landmarks.js';

export function mountFlow(root, app, opts) {
  const shell = el(`<div class="flow"><div class="flow-bg"></div><div class="flow-top">
      <button class="link-btn" data-exit>${icon('arrowL', 16)} Dashboard</button>
      <div class="flow-brand">${icon('logo', 20)} GGFacelon</div><span></span></div>
      <div class="flow-body"></div></div>`);
  root.appendChild(shell);
  const body = $('.flow-body', shell);
  let stepCleanup = null;
  let alive = true;

  const draft = opts.mode === 'edit'
    ? { editing: opts.scan, front: { ...opts.scan.front, ai: opts.scan.front.ai || opts.scan.front.lm }, side: { ...opts.scan.side, ai: opts.scan.side.ai || opts.scan.side.lm } }
    : { front: null, side: null };

  $('[data-exit]', shell).onclick = () => exit();
  function exit() {
    if (app.scans.length) app.go(opts.mode === 'edit' ? `#/scan/${opts.scan.id}/overview` : `#/scan/${app.scans[0].id}/overview`);
    else app.go('#/');
  }

  function step(fn, ...args) {
    if (!alive) return;
    if (stepCleanup) { try { stepCleanup(); } catch (e) { console.error(e); } }
    body.innerHTML = '';
    shell.classList.toggle('wide', fn === stepVerify || fn === stepReview || fn === stepDetect);
    shell.classList.toggle('dark', fn === stepAnalyze);
    window.scrollTo(0, 0);
    stepCleanup = fn(...args) || null;
  }

  // ── 1. consent ──
  function stepConsent() {
    const v = el(`<div class="card onb fade-up">
      <div class="onb-rule"></div>
      <h1 class="serif">How we handle your face data.</h1>
      <p class="sub">Your photos and measurements are processed on this device. Nothing is uploaded.</p>
      <ul class="consent-list">
        <li>${icon('device')}<span>Analysed in your browser</span></li>
        <li>${icon('shield')}<span>Never uploaded, sold or shared</span></li>
        <li>${icon('trash')}<span>Delete any scan whenever you want</span></li>
      </ul>
      <label class="check"><input type="checkbox" id="c1"><span class="box">${icon('check', 14, 2.6)}</span><span>I consent to the processing of my facial images on this device.</span></label>
      <p class="fine">The landmark model (~4 MB) is downloaded once from a public CDN. Your photos never leave the browser.</p>
      <button class="btn dark block" id="agree" disabled>Agree &amp; continue ${icon('arrowR', 16)}</button>
      <button class="link-btn center" id="notnow">Not now</button>
    </div>`);
    body.appendChild(v);
    const cb = $('#c1', v), go = $('#agree', v);
    cb.onchange = () => { go.disabled = !cb.checked; };
    go.onclick = () => { app.prefs.set('consent', Date.now()); step(stepGender); };
    $('#notnow', v).onclick = exit;
  }

  // ── 2. profile ──
  function stepGender() {
    const v = el(`<div class="onb narrow fade-up">
      <h1 class="serif">New scan.</h1>
      <p class="sub">Confirm your details and we’ll calibrate your scores.</p>
      <div class="choice-list">
        <button class="choice on" data-g="male">Male</button>
        <button class="choice" disabled>Female <span class="soon">Coming soon</span></button>
      </div>
      <button class="btn dark block" id="cont">Continue ${icon('arrowR', 16)}</button>
    </div>`);
    body.appendChild(v);
    $('#cont', v).onclick = () => step(stepUpload, 'front');
  }

  // ── 3/4. upload ──
  function stepUpload(view) {
    const isF = view === 'front';
    const cur = draft[view];
    const v = el(`<div class="onb narrow fade-up">
      <h1 class="serif">Let’s get your new score. <button class="icon-btn ghost" id="help" title="Photo instructions">${icon('info', 18)}</button></h1>
      <p class="sub">Step ${isF ? 1 : 2} of 2 · ${isF ? 'Front photo — look straight into the camera' : 'Side profile — turn 90° so only one ear shows'}</p>
      <div class="drop ${cur ? 'has' : ''}" tabindex="0">
        <input type="file" accept="image/*" hidden>
        <div class="drop-empty">
          <div class="drop-ic">${icon('upload', 26, 1.6)}</div>
          <div class="drop-t">Tap to upload or drag and drop</div>
          <div class="drop-s">JPG, PNG or WEBP · one face, well lit</div>
        </div>
        <img class="drop-img" alt="">
        <button class="pill replace" type="button">${icon('image', 14)} Replace</button>
      </div>
      <button class="btn ghost block cam">${icon('camera', 16)} Use camera</button>
      <div class="row2">
        <button class="btn ghost" id="back">Back</button>
        <button class="btn dark" id="next" ${cur ? '' : 'disabled'}>Continue ${icon('arrowR', 16)}</button>
      </div>
    </div>`);
    body.appendChild(v);
    const drop = $('.drop', v), input = $('input', v), imgEl = $('.drop-img', v), next = $('#next', v);
    if (cur) imgEl.src = cur.url;
    const set = (res) => {
      draft[view] = { url: res.url, w: res.w, h: res.h };
      imgEl.src = res.url;
      drop.classList.add('has');
      next.disabled = false;
    };
    const take = async (file) => {
      try { set(await normalizeFile(file)); } catch (e) { toast(e.message); }
    };
    drop.onclick = () => input.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = () => input.files[0] && take(input.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && take(e.dataTransfer.files[0]); };
    $('.cam', v).onclick = () => openCamera(view, set);
    $('#help', v).onclick = () => showInstructions(view);
    $('#back', v).onclick = () => (isF ? step(stepGender) : step(stepUpload, 'front'));
    next.onclick = () => (isF ? step(stepUpload, 'side') : step(stepDetect));
    if (!cur && !app.prefs.get('seenTips_' + view)) askInstructions(view);
  }

  function askInstructions(view) {
    const m = modal(`<h3 class="m-title center">Would you like to view ${view === 'front' ? 'front' : 'side'} photo instructions?</h3>
      <div class="m-stack"><button class="btn dark block" data-a="y">Yes</button><button class="btn ghost block" data-a="n">No</button></div>`, { cls: 'small' });
    m.el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      app.prefs.set('seenTips_' + view, true);
      m.close();
      if (a === 'y') setTimeout(() => showInstructions(view), 200);
    };
  }

  async function showInstructions(view) {
    const src = view === 'front' ? 'assets/ref-front.jpg' : 'assets/ref-side.jpg';
    const im = await loadImage(src);
    const good = cropRef(im, 0);
    const bad = cropRef(im, view === 'front' ? 1 : 2);
    const tips = view === 'front'
      ? ['Camera at eye level, at least an arm’s length away (or use 2× zoom) — close selfies make the nose look bigger', 'Look straight ahead with a neutral face, lips closed and relaxed', 'Push hair off your forehead and ears; remove glasses', 'Even, soft light from the front — no harsh shadows']
      : ['Turn your whole head 90° so only one ear is visible', 'Keep your chin level — imagine a line from ear to under‑eye that is horizontal', 'Hair behind the ear, neck visible down to the collar', 'Plain background helps the AI find your profile outline'];
    const m = modal(`<h3 class="m-title center">How to take your ${view === 'front' ? 'front' : 'side'} photo</h3>
      <div class="howto">
        <figure class="bad"><img src="${bad}" alt=""><figcaption><b>Wrong</b><span class="tag bad">${view === 'front' ? 'Tilted, too close' : 'Tilted, turned'}</span></figcaption></figure>
        <figure class="good"><img src="${good}" alt=""><figcaption><b>Correct</b><span class="tag good">Level, straight on</span></figcaption></figure>
      </div>
      <ul class="tips">${tips.map((t) => `<li>${icon('check', 14, 2.4)}<span>${esc(t)}</span></li>`).join('')}</ul>
      <button class="btn dark block" data-close>Got it</button>`, { cls: 'howto-modal' });
    m.el.querySelector('[data-close]').onclick = () => m.close();
  }

  function cropRef(im, mode) {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 360;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eef0f3';
    ctx.fillRect(0, 0, 300, 360);
    ctx.save();
    ctx.translate(150, 180);
    if (mode === 1) { ctx.rotate(0.16); ctx.scale(1.55, 1.55); ctx.filter = 'brightness(0.82) contrast(1.1)'; }
    if (mode === 2) { ctx.rotate(-0.22); ctx.scale(1.15, 1.15); ctx.filter = 'brightness(0.85)'; }
    const s = 0.58;
    ctx.drawImage(im, -im.naturalWidth * s / 2, -im.naturalHeight * s / 2 - 30, im.naturalWidth * s, im.naturalHeight * s);
    ctx.restore();
    return c.toDataURL('image/jpeg', 0.85);
  }

  // ── camera ──
  function openCamera(view, set) {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Camera not available in this browser'); return; }
    let stream = null;
    const m = modal(`<div class="cam-wrap">
        <video playsinline muted autoplay></video>
        <svg class="cam-guide" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">${view === 'front'
          ? '<ellipse cx="150" cy="185" rx="88" ry="118"/><line x1="150" y1="60" x2="150" y2="310"/><line x1="70" y1="168" x2="230" y2="168"/>'
          : '<path d="M175 70 C120 70 95 110 95 160 C95 210 110 250 150 290 L150 330 M175 70 C200 75 205 120 200 140 L216 182 L202 190 L206 214 L198 226 L200 250 C195 270 175 275 160 268"/><line x1="70" y1="168" x2="230" y2="168"/>'}</svg>
        <div class="cam-count"></div>
      </div>
      <p class="fine center">${view === 'front' ? 'Line up your eyes on the horizontal line and your nose on the vertical one.' : 'Turn 90° and keep the ear‑to‑eye line level.'}</p>
      <div class="row2"><button class="btn ghost" data-a="x">Cancel</button><button class="btn dark" data-a="snap">${icon('camera', 16)} Capture (3s)</button></div>`,
    { cls: 'cam-modal', onClose: () => stream && stream.getTracks().forEach((t) => t.stop()) });
    const video = $('video', m.el);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => { stream = s; video.srcObject = s; })
      .catch(() => { toast('Camera permission was denied'); m.close(); });
    m.el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'x') m.close();
      if (a === 'snap' && stream) {
        const cnt = $('.cam-count', m.el);
        let n = 3;
        cnt.textContent = n;
        cnt.classList.add('on');
        const iv = setInterval(() => {
          n--;
          if (n > 0) { cnt.textContent = n; return; }
          clearInterval(iv);
          cnt.classList.remove('on');
          const res = normalizeSource(video, video.videoWidth, video.videoHeight, false);
          set(res);
          m.close();
        }, 800);
      }
    };
  }

  // ── 5. AI detection ──
  function stepDetect() {
    return mountDetecting(body, app, draft, (out) => {
      for (const view of ['front', 'side']) {
        draft[view].lm = out[view].lm;
        draft[view].ai = { ...out[view].lm };
        draft[view].source = out[view].source;
      }
      step(stepVerify, 'front');
    });
  }

  // ── 6/7. verify ──
  function stepVerify(view) {
    return mountVerify(body, app, draft, view, {
      onBack: () => (view === 'front' ? step(stepUpload, 'side') : step(stepVerify, 'front')),
      onDone: () => (view === 'front' ? step(stepVerify, 'side') : step(stepReview)),
    });
  }

  // ── 8. review ──
  function stepReview() {
    return mountReview(body, app, draft, {
      onBack: () => (draft.editing ? exit() : step(stepVerify, 'side')),
      onAnalyze: () => step(stepAnalyze),
    });
  }

  // ── 9. analyse + save ──
  function stepAnalyze() {
    return mountAnalyzing(body, app, draft, async () => {
      const now = Date.now();
      const scan = draft.editing
        ? { ...draft.editing, front: pack(draft.front), side: pack(draft.side) }
        : { id: 's' + now.toString(36) + Math.random().toString(36).slice(2, 6), created: now, gender: 'male', front: pack(draft.front), side: pack(draft.side) };
      try {
        await app.save(scan);
      } catch (e) {
        toast('Could not save the scan: ' + e.message);
      }
      app.go(`#/scan/${scan.id}/overview`);
    });
  }
  const pack = (d) => ({ url: d.url, w: d.w, h: d.h, lm: d.lm, ai: d.ai, source: d.source });

  // start
  if (opts.mode === 'edit') step(stepReview);
  else if (app.sample) {
    app.sample = false;
    Promise.all(['front', 'side'].map(async (view) => {
      const url = `assets/ref-${view}.jpg`;
      const im = await app.img(url);
      draft[view] = { url, w: im.naturalWidth, h: im.naturalHeight };
    })).then(() => step(stepDetect));
  } else if (!app.prefs.get('consent')) step(stepConsent);
  else step(stepGender);
  loadDetector().catch(() => {});

  return () => { alive = false; if (stepCleanup) stepCleanup(); };
}

export { DEFS };
