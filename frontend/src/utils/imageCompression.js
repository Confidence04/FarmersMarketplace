export const MAX_EDGE_PX = 1600;
export const QUALITY = 0.82;

export function isImageFile(file) {
  return Boolean(file && typeof file.type === 'string' && file.type.startsWith('image/'));
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscales a canvas (or drawable) to MAX_EDGE_PX on its long edge and
 * encodes it as WebP, falling back to JPEG where WebP encoding is unsupported (FE-23).
 */
export async function compressCanvas(source, { maxEdge = MAX_EDGE_PX, quality = QUALITY } = {}) {
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);

  const webp = await toBlob(out, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  return toBlob(out, 'image/jpeg', quality);
}
