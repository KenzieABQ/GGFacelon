// Image import: decode (EXIF orientation applied by the browser), cap the long side, re-encode as JPEG.
// Landmarks are stored in the pixel space of this normalised image, so results never depend on
// the original upload size.

export const MAX_SIDE = 1800;

export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Could not read that image'));
    im.src = src;
  });
}

export async function normalizeFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Please choose an image file');
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    return normalizeSource(im, im.naturalWidth, im.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function normalizeSource(src, w, h, mirror = false) {
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height };
}

// Square-ish thumbnail centred on a point
export async function thumbAround(url, center, size, out = 160) {
  const im = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  ctx.drawImage(im, center.x - size / 2, center.y - size / 2, size, size, 0, 0, out, out);
  return c.toDataURL('image/jpeg', 0.85);
}
