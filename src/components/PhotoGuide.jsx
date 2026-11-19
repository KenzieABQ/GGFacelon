'use client';
// Photo guide and the per-step "how to take your photo" instructions.
import { useEffect, useState } from 'react';
import { app } from '@/lib/app.js';
import { Icon, openModal } from './ui.jsx';
import { asset } from '@/lib/routes.js';

export const photoGuide = () => openModal((close) => (
  <>
    <h3 className="m-title">Photo guide</h3>
    <div className="guide-cols">
      <div><div className="cap">Front</div><ul className="tips">
        {['Camera at eye level, an arm’s length or more away (or 2× zoom) to avoid lens distortion', 'Neutral face, lips closed, looking straight into the lens', 'Hair off the forehead and ears, no glasses', 'Soft, even light from the front'].map((t) => <li key={t}><Icon name="check" size={14} sw={2.4} /><span>{t}</span></li>)}</ul></div>
      <div><div className="cap">Side</div><ul className="tips">
        {['Turn exactly 90° so only one ear shows', 'Keep the ear‑to‑under‑eye line level', 'Neck visible to the collar, hair behind the ear', 'Plain background so the outline is clear'].map((t) => <li key={t}><Icon name="check" size={14} sw={2.4} /><span>{t}</span></li>)}</ul></div>
    </div>
    <button className="btn dark block" onClick={close}>Close</button>
  </>
));

// "Wrong" / "Correct" example crops made from the reference photo
function cropRef(im, mode) {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eef0f3'; ctx.fillRect(0, 0, 300, 360);
  ctx.save(); ctx.translate(150, 180);
  if (mode === 1) { ctx.rotate(0.16); ctx.scale(1.55, 1.55); ctx.filter = 'brightness(0.82) contrast(1.1)'; }
  if (mode === 2) { ctx.rotate(-0.22); ctx.scale(1.15, 1.15); ctx.filter = 'brightness(0.85)'; }
  const s = 0.58;
  ctx.drawImage(im, (-im.naturalWidth * s) / 2, (-im.naturalHeight * s) / 2 - 30, im.naturalWidth * s, im.naturalHeight * s);
  ctx.restore();
  return c.toDataURL('image/jpeg', 0.85);
}

function Instructions({ view, close }) {
  const [imgs, setImgs] = useState(null);
  useEffect(() => {
    app.img(asset(view === 'front' ? '/assets/ref-front.jpg' : '/assets/ref-side.jpg')).then((im) => setImgs({ good: cropRef(im, 0), bad: cropRef(im, view === 'front' ? 1 : 2) }));
  }, [view]);
  const tips = view === 'front'
    ? ['Camera at eye level, at least an arm’s length away (or use 2× zoom) — close selfies make the nose look bigger', 'Look straight ahead with a neutral face, lips closed and relaxed', 'Push hair off your forehead and ears; remove glasses', 'Even, soft light from the front — no harsh shadows']
    : ['Turn your whole head 90° so only one ear is visible', 'Keep your chin level — imagine a line from ear to under‑eye that is horizontal', 'Hair behind the ear, neck visible down to the collar', 'Plain background helps the AI find your profile outline'];
  return (
    <>
      <h3 className="m-title center">How to take your {view === 'front' ? 'front' : 'side'} photo</h3>
      <div className="howto">
        <figure className="bad">{imgs && <img src={imgs.bad} alt="" />}<figcaption><b>Wrong</b><span className="tag bad">{view === 'front' ? 'Tilted, too close' : 'Tilted, turned'}</span></figcaption></figure>
        <figure className="good">{imgs && <img src={imgs.good} alt="" />}<figcaption><b>Correct</b><span className="tag good">Level, straight on</span></figcaption></figure>
      </div>
      <ul className="tips">{tips.map((t) => <li key={t}><Icon name="check" size={14} sw={2.4} /><span>{t}</span></li>)}</ul>
      <button className="btn dark block" onClick={close}>Got it</button>
    </>
  );
}
export const showInstructions = (view) => openModal((close) => <Instructions view={view} close={close} />, { cls: 'howto-modal' });

export const askInstructions = (view) => openModal((close) => (
  <>
    <h3 className="m-title center">Would you like to view {view === 'front' ? 'front' : 'side'} photo instructions?</h3>
    <div className="m-stack">
      <button className="btn dark block" onClick={() => { app.prefs.set('seenTips_' + view, true); close(); setTimeout(() => showInstructions(view), 200); }}>Yes</button>
      <button className="btn ghost block" onClick={() => { app.prefs.set('seenTips_' + view, true); close(); }}>No</button>
    </div>
  </>
), { cls: 'small' });
